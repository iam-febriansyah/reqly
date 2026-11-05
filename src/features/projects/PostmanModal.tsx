import React, { useEffect, useRef, useState } from "react";
import { Copy, Download, Upload, Check, FileJson } from "lucide-react";
import { Modal } from "../../components/Modal";
import { useAppStore } from "../../stores/useAppStore";

export const PostmanModal: React.FC = () => {
  const {
    activeProject,
    importExportModalOpen,
    setImportExportModalOpen,
    exportPostmanJson,
    importPostmanJson,
    showToast,
  } = useAppStore();

  const [mode, setMode] = useState<"export" | "import">("export");
  const [exportedText, setExportedText] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (importExportModalOpen && activeProject && mode === "export") {
      exportPostmanJson()
        .then((json) => setExportedText(json))
        .catch((err) => setExportedText(`// Error exporting: ${err}`));
    }
  }, [importExportModalOpen, activeProject, mode, exportPostmanJson]);

  const handleCopyExport = async () => {
    await navigator.clipboard.writeText(exportedText);
    setCopied(true);
    showToast("Postman Collection v2.1 JSON copied to clipboard");
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadExport = () => {
    if (!activeProject) return;
    const blob = new Blob([exportedText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = activeProject.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    a.href = url;
    a.download = `${slug || "collection"}.postman_collection.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded Postman Collection v2.1 JSON");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImportText(reader.result);
        setImportError(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError("Please paste or select a Postman Collection v2.1 JSON file.");
      return;
    }
    try {
      await importPostmanJson(importText);
      setImportText("");
      setImportExportModalOpen(false);
    } catch (err: any) {
      setImportError(
        typeof err === "string"
          ? err
          : err?.message || "Invalid Postman Collection v2.1 JSON."
      );
    }
  };

  return (
    <Modal
      open={importExportModalOpen}
      onClose={() => setImportExportModalOpen(false)}
      title="Postman Collection v2.1 Import & Export"
      subtitle="100% compatible with Postman Collection v2.1.0 schema including folders, methods, params, headers, bodies, auth, and collection variables."
      width={720}
    >
      <div className="postman-modal-body">
        <div className="segmented-control" style={{ alignSelf: "flex-start" }}>
          <button
            type="button"
            className={`seg-btn ${mode === "export" ? "active" : ""}`}
            onClick={() => setMode("export")}
          >
            <Download size={13} />
            <span>Export Project (v2.1)</span>
          </button>
          <button
            type="button"
            className={`seg-btn ${mode === "import" ? "active" : ""}`}
            onClick={() => setMode("import")}
          >
            <Upload size={13} />
            <span>Import Collection (v2.1)</span>
          </button>
        </div>

        {mode === "export" ? (
          <div className="postman-pane">
            <div className="postman-bar">
              <span className="postman-meta">
                Exporting project: <strong>{activeProject?.name}</strong>
              </span>
              <div className="postman-actions">
                <button
                  type="button"
                  className="btn-secondary btn-xs"
                  onClick={handleCopyExport}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? "Copied" : "Copy JSON"}</span>
                </button>
                <button
                  type="button"
                  className="btn-primary btn-xs"
                  onClick={handleDownloadExport}
                >
                  <Download size={13} />
                  <span>Save .postman_collection.json</span>
                </button>
              </div>
            </div>
            <textarea
              className="postman-json-textarea"
              readOnly
              value={exportedText}
            />
          </div>
        ) : (
          <div className="postman-pane">
            <div className="postman-bar">
              <span className="postman-meta">
                Select a <code>.postman_collection.json</code> file or paste JSON below:
              </span>
              <div className="postman-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn-secondary btn-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileJson size={13} />
                  <span>Choose JSON File...</span>
                </button>
              </div>
            </div>

            <textarea
              className="postman-json-textarea"
              placeholder='{\n  "info": {\n    "name": "My API",\n    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"\n  },\n  "item": [...]\n}'
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
              }}
            />

            {importError && <div className="inline-error-box">{importError}</div>}

            <div className="postman-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={handleImportSubmit}
              >
                <Upload size={14} />
                <span>Import into New Project</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

