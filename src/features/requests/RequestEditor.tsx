import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { MethodBadge } from "../../components/MethodBadge";
import { KeyValueTable } from "../../components/KeyValueTable";
import { JsonCodeEditor } from "../../components/JsonCodeEditor";
import {
  collectUnresolvedVariables,
  generateId,
  resolveVariablesInString,
} from "../../services/api";
import type { AuthType, BodyMode, MultipartField } from "../../types";

const STANDARD_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export const RequestEditor: React.FC = () => {
  const {
    requests,
    openTabIds,
    activeRequestId,
    activeRequest,
    activeVariables,
    tabStates,
    openRequestTab,
    closeRequestTab,
    createRequest,
    updateActiveRequest,
    sendActiveRequest,
    cancelActiveRequest,
    setEnvModalOpen,
  } = useAppStore();

  const [configTab, setConfigTab] = useState<
    "params" | "headers" | "body" | "auth"
  >("params");
  const [customMethodMode, setCustomMethodMode] = useState(false);

  const executionState = activeRequestId
    ? tabStates[activeRequestId]
    : undefined;
  const isLoading = !!executionState?.loading;

  const variableResolution = useMemo(() => {
    if (!activeRequest) {
      return { resolvedUrl: "", unresolved: [] as string[] };
    }
    return collectUnresolvedVariables(activeRequest, activeVariables);
  }, [activeRequest, activeVariables]);

  if (!activeRequest) {
    return (
      <section className="workspace-empty">
        <div className="empty-card">
          <h3>No Request Selected</h3>
          <p>
            Select a saved request from the project explorer or create a new HTTP
            request to start testing.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => createRequest(null, "New Request")}
          >
            <Plus size={14} />
            <span>New HTTP Request (Ctrl+N)</span>
          </button>
        </div>
      </section>
    );
  }

  const isCustomMethod =
    customMethodMode || !STANDARD_METHODS.includes(activeRequest.method);

  const enabledParamsCount = activeRequest.params.filter(
    (p) => p.enabled && p.key.trim()
  ).length;
  const enabledHeadersCount = activeRequest.headers.filter(
    (h) => h.enabled && h.key.trim()
  ).length;

  const handleMultipartChange = (
    id: string,
    field: keyof MultipartField,
    val: string | boolean
  ) => {
    updateActiveRequest((prev) => ({
      ...prev,
      body: {
        ...prev.body,
        formdata: prev.body.formdata.map((f) =>
          f.id === id ? { ...f, [field]: val } : f
        ),
      },
    }));
  };

  const handleAddMultipartRow = () => {
    updateActiveRequest((prev) => ({
      ...prev,
      body: {
        ...prev.body,
        formdata: [
          ...prev.body.formdata,
          {
            id: generateId(),
            key: "",
            value: "",
            fieldType: "text",
            enabled: true,
          },
        ],
      },
    }));
  };

  const handleRemoveMultipartRow = (id: string) => {
    updateActiveRequest((prev) => ({
      ...prev,
      body: {
        ...prev.body,
        formdata: prev.body.formdata.filter((f) => f.id !== id),
      },
    }));
  };

  const renderAuthVarPreview = (raw: string) => {
    if (!raw.includes("{{")) return null;
    const { resolved, unresolved } = resolveVariablesInString(
      raw,
      activeVariables
    );
    if (unresolved.length > 0) {
      return (
        <span className="var-inline-chip var-unresolved">
          Unresolved: {unresolved.join(", ")}
        </span>
      );
    }
    return (
      <span className="var-inline-chip var-resolved">
        Resolves to: {resolved.length > 24 ? resolved.slice(0, 24) + "…" : resolved}
      </span>
    );
  };

  return (
    <section className="request-workspace">
      {/* Open Request Tabs Bar */}
      <div className="tabs-strip">
        <div className="tabs-scroll">
          {openTabIds.map((tabId) => {
            const req = requests.find((r) => r.id === tabId);
            if (!req) return null;
            const active = tabId === activeRequestId;
            return (
              <div
                key={tabId}
                className={`workspace-tab ${active ? "active" : ""}`}
                onClick={() => openRequestTab(tabId)}
              >
                <MethodBadge method={req.method} size="sm" />
                <span className="workspace-tab-title">{req.name}</span>
                <button
                  type="button"
                  className="tab-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeRequestTab(tabId);
                  }}
                  title="Close tab"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="icon-btn tabs-add-btn"
          onClick={() => createRequest(activeRequest.folderId, "New Request")}
          title="New Request Tab (Ctrl+N)"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Request Meta Header (Editable Name + Timeout) */}
      <div className="request-title-bar">
        <input
          type="text"
          className="request-title-input"
          value={activeRequest.name}
          placeholder="Request name..."
          onChange={(e) =>
            updateActiveRequest((prev) => ({ ...prev, name: e.target.value }))
          }
        />

        <div className="request-timeout-box" title="Request Timeout (ms)">
          <Clock size={12} className="muted-icon" />
          <span className="timeout-label">Timeout:</span>
          <input
            type="number"
            className="timeout-input"
            min={500}
            max={300000}
            step={500}
            value={activeRequest.timeoutMs || 30000}
            onChange={(e) =>
              updateActiveRequest((prev) => ({
                ...prev,
                timeoutMs: Math.max(500, Number(e.target.value) || 30000),
              }))
            }
          />
          <span className="timeout-unit">ms</span>
        </div>
      </div>

      {/* Main URL Bar: Method + URL + Send */}
      <div className="url-composer-bar">
        <div className="method-select-group">
          {!isCustomMethod ? (
            <select
              className={`method-select method-text-${activeRequest.method.toLowerCase()}`}
              value={activeRequest.method}
              onChange={(e) => {
                if (e.target.value === "__CUSTOM__") {
                  setCustomMethodMode(true);
                } else {
                  updateActiveRequest((prev) => ({
                    ...prev,
                    method: e.target.value,
                  }));
                }
              }}
              aria-label="HTTP Method"
            >
              {STANDARD_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__CUSTOM__">CUSTOM...</option>
            </select>
          ) : (
            <div className="custom-method-box">
              <input
                type="text"
                className="custom-method-input"
                value={activeRequest.method}
                placeholder="METHOD"
                onChange={(e) =>
                  updateActiveRequest((prev) => ({
                    ...prev,
                    method: e.target.value.toUpperCase(),
                  }))
                }
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setCustomMethodMode(false);
                  if (!STANDARD_METHODS.includes(activeRequest.method)) {
                    updateActiveRequest((prev) => ({ ...prev, method: "GET" }));
                  }
                }}
                title="Reset to standard methods"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        <div className="url-input-wrapper">
          <input
            type="text"
            className="url-input mono-input"
            placeholder="https://api.example.com/v1/resource or {{BASE_URL}}/users"
            value={activeRequest.url}
            onChange={(e) =>
              updateActiveRequest((prev) => ({ ...prev, url: e.target.value }))
            }
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey || !e.shiftKey) && e.key === "Enter") {
                e.preventDefault();
                if (!isLoading) sendActiveRequest();
              }
            }}
          />
        </div>

        {isLoading ? (
          <button
            type="button"
            className="btn-cancel-send"
            onClick={cancelActiveRequest}
          >
            <Square size={13} />
            <span>Cancel</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-send"
            onClick={sendActiveRequest}
            title="Send Request (Ctrl+Enter)"
          >
            <Play size={13} fill="currentColor" />
            <span>Send</span>
          </button>
        )}
      </div>

      {/* Variable Resolution & Unresolved Warning Strip */}
      {(activeRequest.url.includes("{{") ||
        variableResolution.unresolved.length > 0) && (
        <div className="variable-resolution-bar">
          {activeRequest.url.includes("{{") && (
            <div className="resolved-url-preview">
              <span className="preview-caption">Resolved URL:</span>
              <code className="preview-code">
                {variableResolution.resolvedUrl || "(empty)"}
              </code>
            </div>
          )}

          {variableResolution.unresolved.length > 0 ? (
            <div className="unresolved-banner">
              <AlertTriangle size={12} />
              <span>
                Unresolved variable
                {variableResolution.unresolved.length > 1 ? "s" : ""}:{" "}
                <strong>
                  {variableResolution.unresolved
                    .map((v) => `{{${v}}}`)
                    .join(", ")}
                </strong>
              </span>
              <button
                type="button"
                className="btn-link-inline"
                onClick={() => setEnvModalOpen(true)}
              >
                Configure Environment
              </button>
            </div>
          ) : (
            activeRequest.url.includes("{{") && (
              <span className="vars-ok-pill">
                <CheckCircle2 size={11} />
                <span>All variables resolved</span>
              </span>
            )
          )}
        </div>
      )}

      {/* Request Configuration Tabs: Params, Headers, Body, Auth */}
      <div className="config-tabs-bar">
        <button
          type="button"
          className={`config-tab ${configTab === "params" ? "active" : ""}`}
          onClick={() => setConfigTab("params")}
        >
          <span>Params</span>
          {enabledParamsCount > 0 && (
            <span className="tab-badge">{enabledParamsCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`config-tab ${configTab === "headers" ? "active" : ""}`}
          onClick={() => setConfigTab("headers")}
        >
          <span>Headers</span>
          {enabledHeadersCount > 0 && (
            <span className="tab-badge">{enabledHeadersCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`config-tab ${configTab === "body" ? "active" : ""}`}
          onClick={() => setConfigTab("body")}
        >
          <span>Body</span>
          {activeRequest.body.mode !== "none" && (
            <span className="tab-dot-indicator" />
          )}
        </button>

        <button
          type="button"
          className={`config-tab ${configTab === "auth" ? "active" : ""}`}
          onClick={() => setConfigTab("auth")}
        >
          <span>Auth</span>
          {activeRequest.auth.type !== "none" && (
            <span className="tab-badge">{activeRequest.auth.type}</span>
          )}
        </button>
      </div>

      {/* Configuration Content Area */}
      <div className="config-content-pane">
        {configTab === "params" && (
          <div className="config-section">
            <div className="config-section-top">
              <span className="config-section-title">
                Query Parameters (automatically URL-encoded on send)
              </span>
            </div>
            <KeyValueTable
              items={activeRequest.params}
              onChange={(params) =>
                updateActiveRequest((prev) => ({ ...prev, params }))
              }
              keyPlaceholder="Parameter name (e.g. page, userId)"
              valuePlaceholder="Value or {{VARIABLE}}"
              variables={activeVariables}
            />
          </div>
        )}

        {configTab === "headers" && (
          <div className="config-section">
            <div className="config-section-top">
              <span className="config-section-title">Request Headers</span>
            </div>
            <KeyValueTable
              items={activeRequest.headers}
              onChange={(headers) =>
                updateActiveRequest((prev) => ({ ...prev, headers }))
              }
              keyPlaceholder="Header (e.g. Accept, X-Request-ID)"
              valuePlaceholder="Header value or {{VARIABLE}}"
              variables={activeVariables}
            />
          </div>
        )}

        {configTab === "body" && (
          <div className="config-section body-section">
            <div className="body-mode-selector">
              {(
                [
                  { id: "none", label: "None" },
                  { id: "json", label: "JSON" },
                  { id: "raw", label: "Raw Text" },
                  { id: "urlencoded", label: "Form URL Encoded" },
                  { id: "formdata", label: "Multipart Form" },
                ] as { id: BodyMode; label: string }[]
              ).map((m) => (
                <label
                  key={m.id}
                  className={`body-mode-pill ${
                    activeRequest.body.mode === m.id ? "active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="bodyMode"
                    value={m.id}
                    checked={activeRequest.body.mode === m.id}
                    onChange={() =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        body: { ...prev.body, mode: m.id },
                      }))
                    }
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>

            {activeRequest.body.mode === "none" && (
              <div className="body-none-placeholder">
                This request does not have a body payload.
              </div>
            )}

            {activeRequest.body.mode === "json" && (
              <JsonCodeEditor
                language="json"
                value={activeRequest.body.raw}
                onChange={(raw) =>
                  updateActiveRequest((prev) => ({
                    ...prev,
                    body: { ...prev.body, raw },
                  }))
                }
                placeholder={'{\n  "name": "Example",\n  "userId": "{{USER_ID}}"\n}'}
              />
            )}

            {activeRequest.body.mode === "raw" && (
              <JsonCodeEditor
                language="raw"
                value={activeRequest.body.raw}
                onChange={(raw) =>
                  updateActiveRequest((prev) => ({
                    ...prev,
                    body: { ...prev.body, raw },
                  }))
                }
                placeholder="Enter raw request body text..."
              />
            )}

            {activeRequest.body.mode === "urlencoded" && (
              <KeyValueTable
                items={activeRequest.body.urlencoded}
                onChange={(urlencoded) =>
                  updateActiveRequest((prev) => ({
                    ...prev,
                    body: { ...prev.body, urlencoded },
                  }))
                }
                keyPlaceholder="Field key"
                valuePlaceholder="Field value or {{VARIABLE}}"
                variables={activeVariables}
              />
            )}

            {activeRequest.body.mode === "formdata" && (
              <div className="kv-table-wrapper">
                <table className="kv-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}></th>
                      <th style={{ width: "30%" }}>Field Key</th>
                      <th style={{ width: 96 }}>Type</th>
                      <th>Value / File Path</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRequest.body.formdata.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="kv-empty-row">
                          No multipart fields. Click <strong>Add Field</strong>{" "}
                          below.
                        </td>
                      </tr>
                    ) : (
                      activeRequest.body.formdata.map((field) => (
                        <tr
                          key={field.id}
                          className={!field.enabled ? "kv-row-disabled" : ""}
                        >
                          <td className="kv-cell-check">
                            <input
                              type="checkbox"
                              checked={field.enabled}
                              onChange={(e) =>
                                handleMultipartChange(
                                  field.id,
                                  "enabled",
                                  e.target.checked
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="kv-input mono-input"
                              placeholder="Field name"
                              value={field.key}
                              onChange={(e) =>
                                handleMultipartChange(
                                  field.id,
                                  "key",
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td>
                            <select
                              className="select-native kv-type-select"
                              value={field.fieldType}
                              onChange={(e) =>
                                handleMultipartChange(
                                  field.id,
                                  "fieldType",
                                  e.target.value as "text" | "file"
                                )
                              }
                            >
                              <option value="text">Text</option>
                              <option value="file">File</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="kv-input mono-input"
                              placeholder={
                                field.fieldType === "file"
                                  ? "/path/to/file.png"
                                  : "Text value or {{VARIABLE}}"
                              }
                              value={field.value}
                              onChange={(e) =>
                                handleMultipartChange(
                                  field.id,
                                  "value",
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td className="kv-cell-actions">
                            <button
                              type="button"
                              className="icon-btn subtle-danger"
                              onClick={() => handleRemoveMultipartRow(field.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="kv-footer">
                  <button
                    type="button"
                    className="btn-secondary btn-xs"
                    onClick={handleAddMultipartRow}
                  >
                    <Plus size={13} />
                    <span>Add Field</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {configTab === "auth" && (
          <div className="config-section auth-section">
            <div className="auth-type-bar">
              <label className="field-label">Authentication Type</label>
              <div className="segmented-control">
                {(
                  [
                    { id: "none", label: "No Auth" },
                    { id: "bearer", label: "Bearer Token" },
                    { id: "basic", label: "Basic Auth" },
                    { id: "apikey", label: "API Key" },
                  ] as { id: AuthType; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`seg-btn ${
                      activeRequest.auth.type === item.id ? "active" : ""
                    }`}
                    onClick={() =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, type: item.id },
                      }))
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {activeRequest.auth.type === "none" && (
              <div className="body-none-placeholder">
                <Lock size={16} className="muted-icon" />
                <span>
                  This request does not use authentication. Select an auth scheme
                  above if required.
                </span>
              </div>
            )}

            {activeRequest.auth.type === "bearer" && (
              <div className="auth-fields-card">
                <div className="form-group">
                  <label className="field-label">
                    Bearer Token (sent as{" "}
                    <code>Authorization: Bearer &lt;token&gt;</code>)
                  </label>
                  <input
                    type="text"
                    className="input-standard mono-input"
                    placeholder="e.g. {{API_TOKEN}} or eyJhbGciOi..."
                    value={activeRequest.auth.bearerToken}
                    onChange={(e) =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, bearerToken: e.target.value },
                      }))
                    }
                  />
                  {renderAuthVarPreview(activeRequest.auth.bearerToken)}
                </div>
              </div>
            )}

            {activeRequest.auth.type === "basic" && (
              <div className="auth-fields-card">
                <div className="form-group">
                  <label className="field-label">Username</label>
                  <input
                    type="text"
                    className="input-standard mono-input"
                    placeholder="Username or {{BASIC_USER}}"
                    value={activeRequest.auth.basicUsername}
                    onChange={(e) =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, basicUsername: e.target.value },
                      }))
                    }
                  />
                  {renderAuthVarPreview(activeRequest.auth.basicUsername)}
                </div>
                <div className="form-group">
                  <label className="field-label">Password</label>
                  <input
                    type="password"
                    className="input-standard mono-input"
                    placeholder="Password or {{BASIC_PASS}}"
                    value={activeRequest.auth.basicPassword}
                    onChange={(e) =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, basicPassword: e.target.value },
                      }))
                    }
                  />
                  {renderAuthVarPreview(activeRequest.auth.basicPassword)}
                </div>
              </div>
            )}

            {activeRequest.auth.type === "apikey" && (
              <div className="auth-fields-card">
                <div className="form-group">
                  <label className="field-label">Key Name</label>
                  <input
                    type="text"
                    className="input-standard mono-input"
                    placeholder="e.g. X-API-Key or api_key"
                    value={activeRequest.auth.apiKeyName}
                    onChange={(e) =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, apiKeyName: e.target.value },
                      }))
                    }
                  />
                  {renderAuthVarPreview(activeRequest.auth.apiKeyName)}
                </div>
                <div className="form-group">
                  <label className="field-label">Key Value</label>
                  <input
                    type="text"
                    className="input-standard mono-input"
                    placeholder="e.g. {{API_KEY}}"
                    value={activeRequest.auth.apiKeyValue}
                    onChange={(e) =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: { ...prev.auth, apiKeyValue: e.target.value },
                      }))
                    }
                  />
                  {renderAuthVarPreview(activeRequest.auth.apiKeyValue)}
                </div>
                <div className="form-group">
                  <label className="field-label">Add Key To</label>
                  <select
                    className="select-native input-standard"
                    value={activeRequest.auth.apiKeyIn}
                    onChange={(e) =>
                      updateActiveRequest((prev) => ({
                        ...prev,
                        auth: {
                          ...prev.auth,
                          apiKeyIn: e.target.value as "header" | "query",
                        },
                      }))
                    }
                  >
                    <option value="header">HTTP Header</option>
                    <option value="query">Query Parameter</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

