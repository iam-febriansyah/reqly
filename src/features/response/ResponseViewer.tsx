import React, { useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  AlertCircle,
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Eraser,
  FileDown,
  Globe,
  Image as ImageIcon,
  Loader2,
  Square,
  WrapText,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { JsonCodeEditor } from "../../components/JsonCodeEditor";
import {
  exportResponseBodyJson,
  exportRequestResponseExchange,
} from "../../utils/fileExport";
import { generateId } from "../../services/api";
import type { SavedRequest } from "../../types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ResponseViewer: React.FC = () => {
  const {
    activeRequestId,
    activeRequest,
    activeProject,
    tabStates,
    cancelActiveRequest,
    clearActiveResponse,
    saveRequest,
    openRequestTab,
    showToast,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<"body" | "headers">("body");
  const [viewFormat, setViewFormat] = useState<
    "pretty" | "raw" | "html" | "image"
  >("pretty");
  const [copiedBody, setCopiedBody] = useState(false);
  const [copiedHeaders, setCopiedHeaders] = useState(false);
  const [formattedOverride, setFormattedOverride] = useState<string | null>(
    null
  );
  const [wrapResponse, setWrapResponse] = useState(false);

  const state = activeRequestId ? tabStates[activeRequestId] : undefined;
  const response = state?.response || null;
  const isLoading = !!state?.loading;
  const error = state?.error || null;

  useEffect(() => {
    setFormattedOverride(null);
    if (!response) return;
    if (response.isImage) {
      setViewFormat("image");
    } else if (
      response.contentType.toLowerCase().includes("html") ||
      response.contentType.toLowerCase().includes("xml")
    ) {
      setViewFormat("html");
    } else {
      setViewFormat("pretty");
    }
  }, [response]);

  const prettyBody = useMemo(() => {
    if (!response) return "";
    if (formattedOverride !== null) return formattedOverride;
    try {
      const parsed = JSON.parse(response.body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return response.body;
    }
  }, [response, formattedOverride]);

  const isJsonLike = useMemo(() => {
    if (!response) return false;
    if (response.contentType.toLowerCase().includes("json")) return true;
    const t = response.body.trim();
    return (
      (t.startsWith("{") && t.endsWith("}")) ||
      (t.startsWith("[") && t.endsWith("]"))
    );
  }, [response]);

  const handleCopyBody = async () => {
    if (!response) return;
    const textToCopy = viewFormat === "pretty" ? prettyBody : response.body;
    await navigator.clipboard.writeText(textToCopy);
    setCopiedBody(true);
    showToast("Response body copied");
    setTimeout(() => setCopiedBody(false), 1600);
  };

  const handleCopyHeaders = async () => {
    if (!response) return;
    const formatted = response.headers
      .map((h) => `${h.key}: ${h.value}`)
      .join("\n");
    await navigator.clipboard.writeText(formatted);
    setCopiedHeaders(true);
    showToast("Response headers copied");
    setTimeout(() => setCopiedHeaders(false), 1600);
  };

  const handleFormatJson = () => {
    if (!response) return;
    try {
      const parsed = JSON.parse(response.body);
      setFormattedOverride(JSON.stringify(parsed, null, 2));
      setViewFormat("pretty");
      showToast("Formatted JSON");
    } catch {
      showToast("Response body is not valid JSON");
    }
  };

  const handleSaveResponseJson = async () => {
    if (!response) return;
    const savedPath = await exportResponseBodyJson(
      activeRequest?.name || "response",
      response
    );
    if (savedPath) {
      showToast(`Saved to ${savedPath}`);
    }
  };

  const handleSaveExchangeJson = async () => {
    if (!response || !activeRequest) return;
    const savedPath = await exportRequestResponseExchange(activeRequest, response);
    if (savedPath) {
      showToast(`Saved to ${savedPath}`);
    }
  };

  const handleSaveResponseAsRequest = async () => {
    if (!response || !activeProject) return;
    const now = new Date().toISOString();
    const reqName = activeRequest?.name
      ? `Response: ${activeRequest.name}`
      : "New Request from Response";

    const newRequest: SavedRequest = {
      id: generateId(),
      projectId: activeProject.id,
      folderId: activeRequest?.folderId || null,
      name: reqName,
      method: "POST",
      url: activeRequest?.url || "https://api.example.com",
      params: [],
      headers: [
        {
          id: generateId(),
          key: "Content-Type",
          value: isJsonLike ? "application/json" : "text/plain",
          description: "",
          enabled: true,
        },
      ],
      body: {
        mode: isJsonLike ? "json" : "raw",
        raw: viewFormat === "pretty" ? prettyBody : response.body,
        urlencoded: [],
        formdata: [],
      },
      auth: {
        type: "none",
        bearerToken: "",
        basicUsername: "",
        basicPassword: "",
        apiKeyName: "X-Api-Key",
        apiKeyValue: "",
        apiKeyIn: "header",
      },
      timeoutMs: 30000,
      sslVerify: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await saveRequest(newRequest);
    openRequestTab(saved.id);
    showToast(`Created new request "${saved.name}" from response`);
  };

  const getStatusBadgeClass = (code: number) => {
    if (code >= 200 && code < 300) return "status-pill-2xx";
    if (code >= 300 && code < 400) return "status-pill-3xx";
    if (code >= 400 && code < 500) return "status-pill-4xx";
    return "status-pill-5xx";
  };

  return (
    <section className="response-panel">
      {/* Top Status & Metrics Bar */}
      <div className="response-topbar">
        <div className="response-topbar-left">
          <span className="panel-heading">Response</span>

          {response && (
            <div className="response-metrics">
              <span
                className={`response-status-pill ${getStatusBadgeClass(
                  response.status
                )}`}
              >
                {response.status} {response.statusText}
              </span>
              <span className="metric-chip">{response.durationMs} ms</span>
              <span className="metric-chip">
                {formatSize(response.sizeBytes)}
              </span>
            </div>
          )}
        </div>

        {response && (
          <div className="response-topbar-actions">
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleFormatJson}
              title="Format JSON"
            >
              <AlignLeft size={12} />
              <span>Format</span>
            </button>
            <button
              type="button"
              className={`btn-ghost btn-xs ${wrapResponse ? "active" : ""}`}
              onClick={() => setWrapResponse(!wrapResponse)}
              title={
                wrapResponse
                  ? "Disable line wrapping (scroll horizontally)"
                  : "Enable line wrapping (soft wrap)"
              }
            >
              <WrapText size={12} />
              <span>{wrapResponse ? "Wrap: On" : "Wrap: Off"}</span>
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleCopyBody}
              title="Copy Response Body"
            >
              {copiedBody ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedBody ? "Copied" : "Copy Body"}</span>
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleCopyHeaders}
              title="Copy Response Headers"
            >
              {copiedHeaders ? <Check size={12} /> : <Copy size={12} />}
              <span>Copy Headers</span>
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleSaveResponseJson}
              title="Save Response Body as JSON file (Download to share with backend / frontend)"
            >
              <Download size={12} />
              <span>Save Response JSON</span>
            </button>
            {activeRequest && (
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={handleSaveExchangeJson}
                title="Save combined Request & Response as JSON contract file for backend/frontend"
              >
                <FileDown size={12} />
                <span>Save Req + Res</span>
              </button>
            )}
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={clearActiveResponse}
              title="Clear Response"
            >
              <Eraser size={12} />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="response-loading-overlay">
          <div className="loading-card">
            <Loader2 size={24} className="spin-icon" />
            <p>Sending HTTP Request...</p>
            <button
              type="button"
              className="btn-secondary btn-xs"
              onClick={cancelActiveRequest}
            >
              <Square size={11} />
              <span>Cancel Request</span>
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="response-error-container">
          <div className="error-banner-card">
            <AlertCircle size={18} className="error-icon" />
            <div className="error-banner-text">
              <h4>Request Failed</h4>
              <p>{error}</p>
            </div>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={clearActiveResponse}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && !response && (
        <div className="response-empty-state">
          <Globe size={26} className="muted-icon" />
          <p>Hit Send or press Ctrl+Enter to execute the request</p>
          <span>
            Status code, latency, payload size, headers, and formatted body will
            appear here.
          </span>
        </div>
      )}

      {/* Response Body & Headers Content */}
      {!isLoading && response && (
        <>
          <div className="response-subbar">
            <div className="response-tabs">
              <button
                type="button"
                className={`config-tab ${activeTab === "body" ? "active" : ""}`}
                onClick={() => setActiveTab("body")}
              >
                <span>Body</span>
              </button>
              <button
                type="button"
                className={`config-tab ${
                  activeTab === "headers" ? "active" : ""
                }`}
                onClick={() => setActiveTab("headers")}
              >
                <span>Headers</span>
                <span className="tab-badge">{response.headers.length}</span>
              </button>
            </div>

            {activeTab === "body" && (
              <div className="segmented-control">
                <button
                  type="button"
                  className={`seg-btn ${
                    viewFormat === "pretty" ? "active" : ""
                  }`}
                  onClick={() => setViewFormat("pretty")}
                >
                  Pretty JSON
                </button>
                <button
                  type="button"
                  className={`seg-btn ${viewFormat === "raw" ? "active" : ""}`}
                  onClick={() => setViewFormat("raw")}
                >
                  Raw
                </button>
                <button
                  type="button"
                  className={`seg-btn ${viewFormat === "html" ? "active" : ""}`}
                  onClick={() => setViewFormat("html")}
                >
                  HTML/XML
                </button>
                {response.isImage && (
                  <button
                    type="button"
                    className={`seg-btn ${
                      viewFormat === "image" ? "active" : ""
                    }`}
                    onClick={() => setViewFormat("image")}
                  >
                    <ImageIcon size={11} />
                    <span>Image</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="response-content-area">
            {activeTab === "headers" ? (
              <div className="response-headers-scroll">
                <table className="kv-table readonly-table">
                  <thead>
                    <tr>
                      <th style={{ width: "36%" }}>Header Name</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.headers.map((h, i) => (
                      <tr key={`${h.key}-${i}`}>
                        <td className="mono-cell header-key-cell">{h.key}</td>
                        <td className="mono-cell">{h.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : viewFormat === "image" && response.imageBase64 ? (
              <div className="response-image-preview">
                <img
                  src={response.imageBase64}
                  alt="Response preview"
                  className="preview-img"
                />
                <span className="image-caption">
                  {response.contentType} • {formatSize(response.sizeBytes)}
                </span>
              </div>
            ) : viewFormat === "pretty" ? (
              <JsonCodeEditor
                readOnly
                wrap={wrapResponse}
                onWrapChange={setWrapResponse}
                language={isJsonLike ? "json" : "raw"}
                value={prettyBody}
                onSaveFile={handleSaveResponseJson}
                saveButtonTitle="Save Response as JSON file for Backend / Frontend"
              />
            ) : viewFormat === "html" ? (
              <JsonCodeEditor
                readOnly
                wrap={wrapResponse}
                onWrapChange={setWrapResponse}
                language="html"
                value={response.body}
                onSaveFile={handleSaveResponseJson}
                saveButtonTitle="Save Response as file for Backend / Frontend"
              />
            ) : (
              <JsonCodeEditor
                readOnly
                wrap={wrapResponse}
                onWrapChange={setWrapResponse}
                language="raw"
                value={response.body}
                onSaveFile={handleSaveResponseJson}
                saveButtonTitle="Save Response as file for Backend / Frontend"
              />
            )}
          </div>
        </>
      )}
    </section>
  );
};
