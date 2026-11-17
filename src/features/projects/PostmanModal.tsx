import React, { useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  Upload,
  Check,
  FileJson,
  FolderPlus,
  Layers,
  Package,
  X,
  Code2,
  CheckCircle2,
} from "lucide-react";
import { Modal } from "../../components/Modal";
import { useAppStore } from "../../stores/useAppStore";
import { api, isTauriRuntime } from "../../services/api";
import type { PostmanImportPreview } from "../../types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatKindLabel(kind: string): string {
  switch (kind) {
    case "collection_v21":
      return "Postman Collection v2.1";
    case "collection_v20":
      return "Postman Collection v2.0";
    case "environment":
      return "Postman Environment";
    case "globals":
      return "Postman Globals";
    case "dump":
      return "Postman Data Dump";
    default:
      return "Postman JSON";
  }
}

export const PostmanModal: React.FC = () => {
  const {
    activeProject,
    importExportModalOpen,
    setImportExportModalOpen,
    postmanModalMode,
    setPostmanModalMode,
    exportPostmanJson,
    importPostmanFile,
    showToast,
  } = useAppStore();

  const [exportedText, setExportedText] = useState("");
  const [copied, setCopied] = useState(false);

  // Import states
  const [importText, setImportText] = useState("");
  const [loadedFileMeta, setLoadedFileMeta] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [showRawInput, setShowRawInput] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<PostmanImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<"new" | "current">("new");
  const [nameOverride, setNameOverride] = useState("");
  const [setEnvActive, setSetEnvActive] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (importExportModalOpen && activeProject && postmanModalMode === "export") {
      exportPostmanJson()
        .then((json) => setExportedText(json))
        .catch((err) => setExportedText(`// Error exporting: ${err}`));
    }
  }, [importExportModalOpen, activeProject, postmanModalMode, exportPostmanJson]);

  const inspectContent = async (
    text: string,
    fileMeta: { name: string; size: number } | null
  ) => {
    setImportText(text);
    setLoadedFileMeta(fileMeta);
    setImportError(null);
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    try {
      const inspected = await api.inspectPostmanJson(text);
      setPreview(inspected);
      setNameOverride(inspected.name || "");
      if (inspected.kind === "environment" || inspected.kind === "globals") {
        setTargetMode("current");
      } else {
        setTargetMode("new");
      }
    } catch (err: any) {
      setPreview(null);
      setImportError(
        typeof err === "string"
          ? err
          : err?.message || "Format JSON Postman tidak dikenali."
      );
    }
  };

  const resetImportState = () => {
    setImportText("");
    setLoadedFileMeta(null);
    setPreview(null);
    setImportError(null);
    setNameOverride("");
    setShowRawInput(false);
    setIsDragOver(false);
  };

  const handleClose = () => {
    setImportExportModalOpen(false);
  };

  const handleCopyExport = async () => {
    await navigator.clipboard.writeText(exportedText);
    setCopied(true);
    showToast("Postman Collection v2.1 JSON copied to clipboard");
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadExport = async () => {
    if (!activeProject) return;
    const slug = activeProject.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const defaultName = `${slug || "collection"}.postman_collection.json`;
    try {
      const savedPath = await api.saveFileDialog({
        defaultName,
        content: exportedText,
        filterName: "Postman Collection JSON",
        filterExt: "json",
      });
      if (savedPath) {
        showToast(`Saved ${defaultName}`);
      }
    } catch (err: any) {
      showToast(`Export error: ${err?.message || err}`);
    }
  };

  const handlePickFile = async () => {
    if (isTauriRuntime()) {
      try {
        const picked = await api.openPostmanFileDialog();
        if (picked) {
          await inspectContent(picked.content, {
            name: picked.fileName,
            size: picked.sizeBytes,
          });
        }
      } catch (err: any) {
        setImportError(
          typeof err === "string"
            ? err
            : err?.message || "Gagal membaca file dari dialog."
        );
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        void inspectContent(reader.result, { name: file.name, size: file.size });
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await inspectContent(text, { name: file.name, size: file.size });
    } catch (err: any) {
      setImportError(err?.message || "Gagal membaca file yang di-drop.");
    }
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError(
        "Silakan pilih file Postman (.json) atau paste konten JSON terlebih dahulu."
      );
      return;
    }

    setIsImporting(true);
    try {
      const isEnv =
        preview?.kind === "environment" || preview?.kind === "globals";
      const isCollection =
        preview?.kind === "collection_v21" || preview?.kind === "collection_v20";

      const targetProjectId = isEnv
        ? activeProject?.id ?? null
        : isCollection && targetMode === "current"
          ? activeProject?.id ?? null
          : null;

      await importPostmanFile({
        jsonContent: importText,
        targetProjectId,
        nameOverride: nameOverride.trim() ? nameOverride.trim() : null,
        setEnvActive,
      });

      resetImportState();
      setImportExportModalOpen(false);
    } catch (err: any) {
      setImportError(
        typeof err === "string"
          ? err
          : err?.message || "File JSON Postman tidak valid atau gagal diimport."
      );
    } finally {
      setIsImporting(false);
    }
  };

  const isCollection =
    preview?.kind === "collection_v21" || preview?.kind === "collection_v20";
  const isEnv =
    preview?.kind === "environment" || preview?.kind === "globals";

  return (
    <Modal
      open={importExportModalOpen}
      onClose={handleClose}
      title="Import & Export Postman"
      subtitle="Mendukung file Postman Collection (v2.0 / v2.1), Environment, Globals, maupun Data Dump (.json)."
      width={720}
    >
      <div className="postman-modal-body">
        <div className="segmented-control" style={{ alignSelf: "flex-start" }}>
          <button
            type="button"
            className={`seg-btn ${postmanModalMode === "import" ? "active" : ""}`}
            onClick={() => setPostmanModalMode("import")}
          >
            <Upload size={13} />
            <span>Import File Postman</span>
          </button>
          <button
            type="button"
            className={`seg-btn ${postmanModalMode === "export" ? "active" : ""}`}
            onClick={() => setPostmanModalMode("export")}
          >
            <Download size={13} />
            <span>Export Project (v2.1)</span>
          </button>
        </div>

        {postmanModalMode === "import" ? (
          <div className="postman-pane">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json,.postman_collection,.postman_environment,.postman_globals,.postman_dump"
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />

            {!preview ? (
              <div
                className={`postman-dropzone ${isDragOver ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                }}
                onDrop={handleDrop}
                onClick={handlePickFile}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void handlePickFile();
                  }
                }}
              >
                <div className="dropzone-icon-wrap">
                  <FileJson size={24} />
                </div>
                <div className="dropzone-title">
                  Klik untuk pilih file Postman atau drag &amp; drop ke sini
                </div>
                <div className="dropzone-subtitle">
                  Mendukung <code>.postman_collection.json</code> (v2.0 &amp; v2.1),{" "}
                  <code>.postman_environment.json</code>,{" "}
                  <code>.postman_globals.json</code>, dan <code>.postman_dump.json</code>
                </div>
                <button
                  type="button"
                  className="btn-primary btn-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handlePickFile();
                  }}
                >
                  <Upload size={13} />
                  <span>Pilih File JSON...</span>
                </button>
              </div>
            ) : (
              <div className="postman-preview-card">
                <div className="postman-preview-header">
                  <div className="postman-preview-title-row">
                    <span className="postman-kind-badge">
                      <CheckCircle2 size={12} />
                      <span>{formatKindLabel(preview.kind)}</span>
                    </span>
                    {loadedFileMeta && (
                      <span className="postman-file-meta">
                        {loadedFileMeta.name} ({formatBytes(loadedFileMeta.size)})
                      </span>
                    )}
                  </div>
                  <div className="postman-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-xxs"
                      onClick={handlePickFile}
                    >
                      Ganti File
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={resetImportState}
                      title="Clear file"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div className="postman-preview-name">{preview.name}</div>
                {preview.description && (
                  <div className="postman-preview-desc">{preview.description}</div>
                )}

                <div className="postman-preview-stats">
                  {preview.collectionCount > 1 && (
                    <span className="preview-stat-pill">
                      <Package size={12} />
                      <span>{preview.collectionCount} collections</span>
                    </span>
                  )}
                  {(isCollection || preview.kind === "dump") && (
                    <>
                      <span className="preview-stat-pill">
                        <FolderPlus size={12} />
                        <span>{preview.folderCount} folders</span>
                      </span>
                      <span className="preview-stat-pill">
                        <FileJson size={12} />
                        <span>{preview.requestCount} requests</span>
                      </span>
                    </>
                  )}
                  <span className="preview-stat-pill">
                    <Layers size={12} />
                    <span>{preview.variableCount} variables</span>
                  </span>
                </div>

                {/* Import destination & naming options */}
                {(isCollection || isEnv) && (
                  <div className="postman-options-grid">
                    {isCollection && activeProject && (
                      <div className="postman-option-row">
                        <label className="field-label">Tujuan Import</label>
                        <div className="segmented-control">
                          <button
                            type="button"
                            className={`seg-btn ${targetMode === "new" ? "active" : ""}`}
                            onClick={() => setTargetMode("new")}
                          >
                            <span>Buat Project Baru</span>
                          </button>
                          <button
                            type="button"
                            className={`seg-btn ${targetMode === "current" ? "active" : ""}`}
                            onClick={() => setTargetMode("current")}
                          >
                            <span>Tambah ke "{activeProject.name}"</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {(isEnv || (isCollection && targetMode === "new")) && (
                      <div className="postman-option-row">
                        <label className="field-label">
                          {isEnv ? "Nama Environment" : "Nama Project"}
                        </label>
                        <input
                          type="text"
                          className="input-compact"
                          value={nameOverride}
                          onChange={(e) => setNameOverride(e.target.value)}
                          placeholder={preview.name}
                        />
                      </div>
                    )}

                    {(isEnv ||
                      (isCollection &&
                        targetMode === "current" &&
                        preview.variableCount > 0)) && (
                      <label className="postman-checkbox-row">
                        <input
                          type="checkbox"
                          checked={setEnvActive}
                          onChange={(e) => setSetEnvActive(e.target.checked)}
                        />
                        <span>Jadikan environment ini aktif setelah import</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="postman-raw-toggle-row">
              <button
                type="button"
                className="btn-ghost btn-xxs"
                onClick={() => setShowRawInput((v) => !v)}
              >
                <Code2 size={12} />
                <span>
                  {showRawInput
                    ? "Sembunyikan Raw JSON"
                    : "Atau Paste / Lihat Raw JSON"}
                </span>
              </button>
            </div>

            {showRawInput && (
              <textarea
                className="postman-json-textarea"
                style={{ height: 190 }}
                placeholder='{\n  "info": {\n    "name": "My API",\n    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"\n  },\n  "item": [...]\n}'
                value={
                  importText.length > 400_000
                    ? importText.slice(0, 400_000)
                    : importText
                }
                onChange={(e) => {
                  void inspectContent(e.target.value, null);
                }}
              />
            )}

            {importError && <div className="inline-error-box">{importError}</div>}

            <div className="postman-footer">
              <button
                type="button"
                className="btn-primary"
                disabled={!preview || isImporting}
                onClick={handleImportSubmit}
              >
                <Upload size={14} />
                <span>
                  {isImporting
                    ? "Importing..."
                    : isEnv
                      ? "Import Environment"
                      : isCollection && targetMode === "current"
                        ? "Import ke Project Ini"
                        : preview?.kind === "dump"
                          ? "Import Postman Dump"
                          : "Import ke Project Baru"}
                </span>
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </Modal>
  );
};
