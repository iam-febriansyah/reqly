import React, { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  Folder as FolderIcon,
  FolderPlus,
  History,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  Share2,
  X,
  Check,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { MethodBadge } from "../../components/MethodBadge";
import { HistoryList } from "../history/HistoryList";
import type { Folder, SavedRequest } from "../../types";

export const ProjectExplorer: React.FC<{
  searchInputRef: React.RefObject<HTMLInputElement>;
}> = ({ searchInputRef }) => {
  const {
    projects,
    activeProject,
    folders,
    requests,
    environments,
    activeRequestId,
    searchQuery,
    setSearchQuery,
    selectProject,
    createNewProject,
    renameActiveProject,
    deleteProjectById,
    setActiveEnvironmentId,
    setEnvModalOpen,
    setImportExportModalOpen,
    createFolder,
    renameFolder,
    deleteFolder,
    createRequest,
    openRequestTab,
    renameRequest,
    duplicateRequest,
    moveRequestToFolder,
    reorderRequest,
    deleteRequest,
  } = useAppStore();

  const [sidebarTab, setSidebarTab] = useState<"collections" | "history">(
    "collections"
  );
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [editingReqName, setEditingReqName] = useState("");
  const [openMenuReqId, setOpenMenuReqId] = useState<string | null>(null);

  // Project inline management
  const [projectMode, setProjectMode] = useState<"none" | "create" | "rename">(
    "none"
  );
  const [projectNameInput, setProjectNameInput] = useState("");
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState("");

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  const handleProjectFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameInput.trim()) return;
    if (projectMode === "create") {
      await createNewProject(projectNameInput.trim());
    } else if (projectMode === "rename") {
      await renameActiveProject(projectNameInput.trim());
    }
    setProjectMode("none");
    setProjectNameInput("");
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderNameInput.trim()) return;
    await createFolder(newFolderNameInput.trim(), null);
    setNewFolderNameInput("");
    setNewFolderMode(false);
  };

  const renderRequestRow = (req: SavedRequest) => {
    const isActive = req.id === activeRequestId;
    const isEditing = editingReqId === req.id;
    const isMenuOpen = openMenuReqId === req.id;

    return (
      <div
        key={req.id}
        className={`request-tree-item ${isActive ? "active" : ""}`}
        onClick={() => openRequestTab(req.id)}
      >
        <div className="request-tree-main">
          <MethodBadge method={req.method} size="sm" />
          {isEditing ? (
            <input
              type="text"
              className="tree-inline-input"
              autoFocus
              value={editingReqName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditingReqName(e.target.value)}
              onBlur={async () => {
                if (editingReqName.trim()) {
                  await renameRequest(req.id, editingReqName.trim());
                }
                setEditingReqId(null);
              }}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  if (editingReqName.trim()) {
                    await renameRequest(req.id, editingReqName.trim());
                  }
                  setEditingReqId(null);
                } else if (e.key === "Escape") {
                  setEditingReqId(null);
                }
              }}
            />
          ) : (
            <span
              className="request-tree-name"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingReqId(req.id);
                setEditingReqName(req.name);
              }}
            >
              {req.name}
            </span>
          )}
        </div>

        <div
          className="request-tree-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="icon-btn tree-action-btn"
            onClick={() =>
              setOpenMenuReqId(isMenuOpen ? null : req.id)
            }
            title="Request options"
          >
            <MoreHorizontal size={13} />
          </button>

          {isMenuOpen && (
            <div
              className="tree-context-popover"
              onPointerLeave={() => setOpenMenuReqId(null)}
            >
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  setEditingReqId(req.id);
                  setEditingReqName(req.name);
                  setOpenMenuReqId(null);
                }}
              >
                <Edit2 size={12} />
                <span>Rename</span>
              </button>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  duplicateRequest(req.id);
                  setOpenMenuReqId(null);
                }}
              >
                <Copy size={12} />
                <span>Duplicate</span>
              </button>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  reorderRequest(req.id, "up");
                  setOpenMenuReqId(null);
                }}
              >
                <ArrowUp size={12} />
                <span>Move Up</span>
              </button>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  reorderRequest(req.id, "down");
                  setOpenMenuReqId(null);
                }}
              >
                <ArrowDown size={12} />
                <span>Move Down</span>
              </button>

              <div className="popover-divider" />
              <div className="popover-subcaption">Move to Folder</div>
              <button
                type="button"
                className={`popover-item ${req.folderId === null ? "selected" : ""}`}
                onClick={() => {
                  moveRequestToFolder(req.id, null);
                  setOpenMenuReqId(null);
                }}
              >
                <span>Root (Ungrouped)</span>
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`popover-item ${req.folderId === f.id ? "selected" : ""}`}
                  onClick={() => {
                    moveRequestToFolder(req.id, f.id);
                    setOpenMenuReqId(null);
                  }}
                >
                  <FolderIcon size={11} />
                  <span>{f.name}</span>
                </button>
              ))}

              <div className="popover-divider" />
              <button
                type="button"
                className="popover-item danger"
                onClick={() => {
                  deleteRequest(req.id);
                  setOpenMenuReqId(null);
                }}
              >
                <Trash2 size={12} />
                <span>Delete Request</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFolderNode = (folder: Folder) => {
    const isCollapsed = !!collapsedFolders[folder.id];
    const folderRequests = filteredRequests
      .filter((r) => r.folderId === folder.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const isEditing = editingFolderId === folder.id;

    return (
      <div key={folder.id} className="folder-block">
        <div className="folder-row" onClick={() => toggleFolder(folder.id)}>
          <div className="folder-row-left">
            {isCollapsed ? (
              <ChevronRight size={13} className="muted-icon" />
            ) : (
              <ChevronDown size={13} className="muted-icon" />
            )}
            <FolderIcon size={13} className="folder-icon" />
            {isEditing ? (
              <input
                type="text"
                className="tree-inline-input"
                autoFocus
                value={editingFolderName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditingFolderName(e.target.value)}
                onBlur={async () => {
                  if (editingFolderName.trim()) {
                    await renameFolder(folder.id, editingFolderName.trim());
                  }
                  setEditingFolderId(null);
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    if (editingFolderName.trim()) {
                      await renameFolder(folder.id, editingFolderName.trim());
                    }
                    setEditingFolderId(null);
                  } else if (e.key === "Escape") {
                    setEditingFolderId(null);
                  }
                }}
              />
            ) : (
              <span className="folder-name">{folder.name}</span>
            )}
            <span className="folder-count">{folderRequests.length}</span>
          </div>

          <div
            className="folder-row-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="icon-btn tree-action-btn"
              onClick={() => createRequest(folder.id, "New Request")}
              title="Add request in folder"
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              className="icon-btn tree-action-btn"
              onClick={() => {
                setEditingFolderId(folder.id);
                setEditingFolderName(folder.name);
              }}
              title="Rename folder"
            >
              <Edit2 size={11} />
            </button>
            <button
              type="button"
              className="icon-btn tree-action-btn subtle-danger"
              onClick={() => deleteFolder(folder.id)}
              title="Delete folder"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="folder-children">
            {folderRequests.length === 0 ? (
              <div className="folder-empty-hint">Empty folder</div>
            ) : (
              folderRequests.map(renderRequestRow)
            )}
          </div>
        )}
      </div>
    );
  };

  const rootRequests = filteredRequests
    .filter((r) => !r.folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <aside className="sidebar-pane">
      {/* Project Header & Selector */}
      <div className="sidebar-project-box">
        <div className="project-selector-row">
          <select
            className="select-native project-select"
            value={activeProject?.id || ""}
            onChange={(e) => selectProject(e.target.value)}
            aria-label="Select Project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setProjectMode("create");
              setProjectNameInput("");
            }}
            title="New Project"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              if (!activeProject) return;
              setProjectMode("rename");
              setProjectNameInput(activeProject.name);
            }}
            title="Rename Project"
          >
            <Edit2 size={13} />
          </button>
          {projects.length > 1 && activeProject && (
            <button
              type="button"
              className="icon-btn subtle-danger"
              onClick={() => deleteProjectById(activeProject.id)}
              title="Delete Project"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {projectMode !== "none" && (
          <form onSubmit={handleProjectFormSubmit} className="inline-mini-form">
            <input
              type="text"
              className="input-compact"
              autoFocus
              placeholder={
                projectMode === "create" ? "New project name..." : "Rename project..."
              }
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
            />
            <button type="submit" className="icon-btn" title="Save">
              <Check size={13} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setProjectMode("none")}
              title="Cancel"
            >
              <X size={13} />
            </button>
          </form>
        )}

        {/* Environment Selector */}
        <div className="env-selector-row">
          <div className="env-select-wrap">
            <Layers size={12} className="muted-icon" />
            <select
              className="select-native env-select"
              value={activeProject?.activeEnvironmentId || ""}
              onChange={(e) =>
                setActiveEnvironmentId(e.target.value ? e.target.value : null)
              }
              aria-label="Active Environment"
            >
              <option value="">No Environment</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-ghost btn-xxs"
            onClick={() => setEnvModalOpen(true)}
            title="Manage Environment Variables (Ctrl+E)"
          >
            Variables
          </button>
        </div>
      </div>

      {/* Mode Switcher: Collections vs History */}
      <div className="sidebar-mode-bar">
        <div className="segmented-control full-width">
          <button
            type="button"
            className={`seg-btn ${sidebarTab === "collections" ? "active" : ""}`}
            onClick={() => setSidebarTab("collections")}
          >
            <FolderIcon size={12} />
            <span>Requests</span>
          </button>
          <button
            type="button"
            className={`seg-btn ${sidebarTab === "history" ? "active" : ""}`}
            onClick={() => setSidebarTab("history")}
          >
            <History size={12} />
            <span>History</span>
          </button>
        </div>
      </div>

      {sidebarTab === "history" ? (
        <HistoryList />
      ) : (
        <>
          {/* Search & Quick Action Toolbar */}
          <div className="sidebar-search-bar">
            <div className="search-input-wrap">
              <Search size={13} className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="Filter requests... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <div className="sidebar-quick-actions">
              <button
                type="button"
                className="btn-secondary btn-xxs"
                onClick={() => createRequest(null, "New Request")}
                title="New HTTP Request (Ctrl+N)"
              >
                <Plus size={12} />
                <span>Request</span>
              </button>
              <button
                type="button"
                className="btn-secondary btn-xxs"
                onClick={() => setNewFolderMode((v) => !v)}
                title="New Folder"
              >
                <FolderPlus size={12} />
                <span>Folder</span>
              </button>
              <button
                type="button"
                className="btn-secondary btn-xxs"
                onClick={() => setImportExportModalOpen(true)}
                title="Import / Export Postman Collection v2.1"
              >
                <Share2 size={12} />
                <span>Postman</span>
              </button>
            </div>

            {newFolderMode && (
              <form
                onSubmit={handleCreateFolderSubmit}
                className="inline-mini-form"
              >
                <input
                  type="text"
                  className="input-compact"
                  autoFocus
                  placeholder="Folder name..."
                  value={newFolderNameInput}
                  onChange={(e) => setNewFolderNameInput(e.target.value)}
                />
                <button type="submit" className="icon-btn" title="Create">
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setNewFolderMode(false)}
                >
                  <X size={13} />
                </button>
              </form>
            )}
          </div>

          {/* Folder & Request Hierarchy */}
          <div className="tree-scroll-area">
            {folders.map(renderFolderNode)}

            {rootRequests.length > 0 && (
              <div className="root-requests-section">
                {folders.length > 0 && (
                  <div className="root-requests-caption">Ungrouped Requests</div>
                )}
                {rootRequests.map(renderRequestRow)}
              </div>
            )}

            {folders.length === 0 && rootRequests.length === 0 && (
              <div className="sidebar-empty-state">
                <p>No matching requests</p>
                <button
                  type="button"
                  className="btn-primary btn-xs"
                  onClick={() => createRequest(null, "New Request")}
                >
                  <Plus size={13} />
                  <span>Create Request</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
};
