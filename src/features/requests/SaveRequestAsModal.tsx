import React, { useState, useEffect } from "react";
import { BookmarkPlus, Folder as FolderIcon } from "lucide-react";
import { Modal } from "../../components/Modal";
import { useAppStore } from "../../stores/useAppStore";
import { MethodBadge } from "../../components/MethodBadge";
import { generateId } from "../../services/api";
import type { SavedRequest } from "../../types";

interface SaveRequestAsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SaveRequestAsModal: React.FC<SaveRequestAsModalProps> = ({
  open,
  onClose,
}) => {
  const {
    activeProject,
    activeRequest,
    folders,
    saveRequest,
    openRequestTab,
    showToast,
  } = useAppStore();

  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (open && activeRequest) {
      setName(`${activeRequest.name} (Copy)`);
      setFolderId(activeRequest.folderId);
    }
  }, [open, activeRequest]);

  if (!activeRequest || !activeProject) return null;

  const projectFolders = folders.filter((f) => f.projectId === activeProject.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || `${activeRequest.name} (Copy)`;
    const now = new Date().toISOString();

    const clonedRequest: SavedRequest = {
      ...activeRequest,
      id: generateId(),
      projectId: activeProject.id,
      folderId: folderId || null,
      name: finalName,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await saveRequest(clonedRequest);
    openRequestTab(saved.id);
    showToast(`Saved as "${saved.name}"`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save Request As"
      subtitle={`Save a copy of "${activeRequest.name}" into "${activeProject.name}".`}
      width={480}
    >
      <form onSubmit={handleSubmit} className="save-as-form">
        <div className="form-field">
          <label className="field-label">Request Name</label>
          <input
            type="text"
            className="input-text"
            placeholder="e.g. Get User Profile - Staging"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="field-label">Destination Folder</label>
          <select
            className="input-select"
            value={folderId || ""}
            onChange={(e) => setFolderId(e.target.value || null)}
          >
            <option value="">(Root - No Folder)</option>
            {projectFolders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="save-as-preview-box">
          <span className="preview-label">Snapshot Summary:</span>
          <div className="preview-row">
            <MethodBadge method={activeRequest.method} size="sm" />
            <code className="preview-url">
              {activeRequest.url || "https://..."}
            </code>
          </div>
          <span className="preview-details">
            Includes {activeRequest.headers.length} headers,{" "}
            {activeRequest.params.length} params, and {activeRequest.body.mode} body.
          </span>
        </div>

        <div className="modal-actions-right">
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary btn-sm">
            <BookmarkPlus size={13} />
            <span>Save as New Request</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

