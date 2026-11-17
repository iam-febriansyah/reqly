import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  Folder as FolderIcon,
  FolderPlus,
  GripVertical,
  History,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  X,
  Check,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { MethodBadge } from "../../components/MethodBadge";
import { HistoryList } from "../history/HistoryList";
import type { Folder, SavedRequest } from "../../types";

type RequestDropTarget =
  | {
      kind: "request";
      requestId: string;
      folderId: string | null;
      position: "before" | "after";
    }
  | { kind: "folder"; folderId: string }
  | { kind: "root" };

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
    openPostmanModal,
    createFolder,
    renameFolder,
    deleteFolder,
    createRequest,
    openRequestTab,
    renameRequest,
    duplicateRequest,
    moveRequestToFolder,
    reorderRequest,
    moveAndReorderRequest,
    deleteRequest,
    showToast,
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

  // Request Drag & Drop states
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<RequestDropTarget | null>(null);

  const pendingDragRef = useRef<{
    requestId: string;
    startX: number;
    startY: number;
  } | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<RequestDropTarget | null>(null);
  const wasDraggingRef = useRef(false);
  const lastClientYRef = useRef(0);
  const autoScrollRafRef = useRef<number | null>(null);
  const hoverExpandTimerRef = useRef<{ folderId: string; timer: number } | null>(
    null
  );

  // Latest state refs for smooth global pointer handlers
  const requestsRef = useRef(requests);
  requestsRef.current = requests;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const collapsedRef = useRef(collapsedFolders);
  collapsedRef.current = collapsedFolders;
  const moveAndReorderRef = useRef(moveAndReorderRequest);
  moveAndReorderRef.current = moveAndReorderRequest;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    const clearHoverTimer = () => {
      if (hoverExpandTimerRef.current) {
        window.clearTimeout(hoverExpandTimerRef.current.timer);
        hoverExpandTimerRef.current = null;
      }
    };

    const stopAutoScroll = () => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    };

    const cleanupDrag = () => {
      pendingDragRef.current = null;
      activeDragIdRef.current = null;
      dropTargetRef.current = null;
      setDraggedRequestId(null);
      setDragPointer(null);
      setDropTarget(null);
      clearHoverTimer();
      stopAutoScroll();
      document.body.classList.remove("is-dragging-request");
    };

    const resolveDropTarget = (
      clientX: number,
      clientY: number,
      draggedId: string
    ): RequestDropTarget | null => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!el) return null;

      const reqEl = el.closest("[data-drop-request-id]") as HTMLElement | null;
      if (reqEl) {
        const reqId = reqEl.getAttribute("data-drop-request-id");
        if (!reqId || reqId === draggedId) return null;
        const folderAttr = reqEl.getAttribute("data-drop-folder-id");
        const folderId = folderAttr ? folderAttr : null;
        const rect = reqEl.getBoundingClientRect();
        const position =
          clientY < rect.top + rect.height / 2 ? "before" : "after";
        return { kind: "request", requestId: reqId, folderId, position };
      }

      const folderRowEl = el.closest(
        "[data-folder-drop-id]"
      ) as HTMLElement | null;
      if (folderRowEl) {
        const folderId = folderRowEl.getAttribute("data-folder-drop-id");
        if (folderId) {
          return { kind: "folder", folderId };
        }
      }

      const rootEl = el.closest("[data-root-drop]") as HTMLElement | null;
      if (rootEl) {
        return { kind: "root" };
      }

      const folderBodyEl = el.closest(
        "[data-folder-body-id]"
      ) as HTMLElement | null;
      if (folderBodyEl) {
        const folderId = folderBodyEl.getAttribute("data-folder-body-id");
        if (folderId) {
          return { kind: "folder", folderId };
        }
      }

      return null;
    };

    const startAutoScroll = () => {
      if (autoScrollRafRef.current !== null) return;
      const step = () => {
        if (!activeDragIdRef.current) {
          autoScrollRafRef.current = null;
          return;
        }
        const container = treeScrollRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const y = lastClientYRef.current;
          if (y >= rect.top && y <= rect.top + 30) {
            container.scrollTop -= 6;
          } else if (y <= rect.bottom && y >= rect.bottom - 30) {
            container.scrollTop += 6;
          }
        }
        autoScrollRafRef.current = requestAnimationFrame(step);
      };
      autoScrollRafRef.current = requestAnimationFrame(step);
    };

    const handlePointerMove = (e: PointerEvent) => {
      lastClientYRef.current = e.clientY;

      if (!activeDragIdRef.current && pendingDragRef.current) {
        const dx = e.clientX - pendingDragRef.current.startX;
        const dy = e.clientY - pendingDragRef.current.startY;
        if (Math.hypot(dx, dy) < 6) return;

        activeDragIdRef.current = pendingDragRef.current.requestId;
        wasDraggingRef.current = true;
        setDraggedRequestId(activeDragIdRef.current);
        setOpenMenuReqId(null);
        document.body.classList.add("is-dragging-request");
        startAutoScroll();
      }

      if (!activeDragIdRef.current) return;

      setDragPointer({ x: e.clientX, y: e.clientY });
      const resolved = resolveDropTarget(
        e.clientX,
        e.clientY,
        activeDragIdRef.current
      );
      dropTargetRef.current = resolved;
      setDropTarget(resolved);

      if (resolved?.kind === "folder") {
        const targetFId = resolved.folderId;
        if (
          collapsedRef.current[targetFId] &&
          hoverExpandTimerRef.current?.folderId !== targetFId
        ) {
          clearHoverTimer();
          hoverExpandTimerRef.current = {
            folderId: targetFId,
            timer: window.setTimeout(() => {
              setCollapsedFolders((prev) => ({
                ...prev,
                [targetFId]: false,
              }));
              hoverExpandTimerRef.current = null;
            }, 520),
          };
        }
      } else {
        clearHoverTimer();
      }
    };

    const handlePointerUp = async () => {
      const draggedId = activeDragIdRef.current;
      const target = dropTargetRef.current;
      cleanupDrag();

      if (wasDraggingRef.current) {
        window.setTimeout(() => {
          wasDraggingRef.current = false;
        }, 0);
      }

      if (!draggedId || !target) return;

      const currentReqs = requestsRef.current;
      const draggedReq = currentReqs.find((r) => r.id === draggedId);
      if (!draggedReq) return;

      if (target.kind === "request") {
        const destSiblings = currentReqs
          .filter(
            (r) =>
              (r.folderId ?? null) === target.folderId && r.id !== draggedId
          )
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const targetIdx = destSiblings.findIndex(
          (r) => r.id === target.requestId
        );
        if (targetIdx === -1) return;
        const insertIndex =
          target.position === "before" ? targetIdx : targetIdx + 1;
        await moveAndReorderRef.current(draggedId, target.folderId, insertIndex);
        if ((draggedReq.folderId ?? null) !== target.folderId) {
          const destName = target.folderId
            ? foldersRef.current.find((f) => f.id === target.folderId)?.name ||
              "Folder"
            : "Root (Ungrouped)";
          showToastRef.current(`Moved "${draggedReq.name}" to ${destName}`);
        }
      } else if (target.kind === "folder") {
        setCollapsedFolders((prev) => ({
          ...prev,
          [target.folderId]: false,
        }));
        await moveAndReorderRef.current(draggedId, target.folderId);
        if (draggedReq.folderId !== target.folderId) {
          const folderName =
            foldersRef.current.find((f) => f.id === target.folderId)?.name ||
            "Folder";
          showToastRef.current(`Moved "${draggedReq.name}" to "${folderName}"`);
        }
      } else if (target.kind === "root") {
        await moveAndReorderRef.current(draggedId, null);
        if (draggedReq.folderId !== null) {
          showToastRef.current(
            `Moved "${draggedReq.name}" to Root (Ungrouped)`
          );
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeDragIdRef.current) {
        cleanupDrag();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cleanupDrag);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cleanupDrag);
      window.removeEventListener("keydown", handleKeyDown);
      cleanupDrag();
    };
  }, []);

  const handleRequestPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    req: SavedRequest
  ) => {
    if (e.button !== 0 || editingReqId === req.id) return;
    const targetEl = e.target as HTMLElement | null;
    if (
      targetEl?.closest(
        "button, input, textarea, select, .tree-context-popover, .request-tree-actions"
      )
    ) {
      return;
    }
    pendingDragRef.current = {
      requestId: req.id,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

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
    const isBeingDragged = draggedRequestId === req.id;
    const dropPos =
      dropTarget?.kind === "request" && dropTarget.requestId === req.id
        ? dropTarget.position
        : null;

    return (
      <div
        key={req.id}
        data-drop-request-id={req.id}
        data-drop-folder-id={req.folderId ?? ""}
        className={`request-tree-item ${isActive ? "active" : ""} ${
          isBeingDragged ? "is-drag-source" : ""
        } ${dropPos === "before" ? "drop-before" : ""} ${
          dropPos === "after" ? "drop-after" : ""
        }`}
        onPointerDown={(e) => handleRequestPointerDown(e, req)}
        onClick={() => {
          if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            return;
          }
          openRequestTab(req.id);
        }}
      >
        <div className="request-tree-main">
          {!isEditing && (
            <span className="request-drag-handle" aria-hidden="true">
              <GripVertical size={11} />
            </span>
          )}
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

  const countFolderRequests = (folderId: string, seen = new Set<string>()): number => {
    if (seen.has(folderId)) return 0;
    seen.add(folderId);
    let total = filteredRequests.filter((r) => r.folderId === folderId).length;
    for (const child of folders) {
      if (child.parentId === folderId) {
        total += countFolderRequests(child.id, seen);
      }
    }
    return total;
  };

  const renderFolderNode = (folder: Folder, seen = new Set<string>()) => {
    if (seen.has(folder.id)) return null;
    const nextSeen = new Set(seen);
    nextSeen.add(folder.id);

    const isCollapsed = !!collapsedFolders[folder.id];
    const childFolders = folders
      .filter((f) => f.parentId === folder.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const folderRequests = filteredRequests
      .filter((r) => r.folderId === folder.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const totalCount = countFolderRequests(folder.id);
    const isEditing = editingFolderId === folder.id;
    const isFolderDropOver =
      dropTarget?.kind === "folder" && dropTarget.folderId === folder.id;

    return (
      <div key={folder.id} className="folder-block">
        <div
          className={`folder-row ${isFolderDropOver ? "drag-over-folder" : ""}`}
          data-folder-drop-id={folder.id}
          onClick={() => toggleFolder(folder.id)}
        >
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
            <span className="folder-count">{totalCount}</span>
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
          <div
            className={`folder-children ${
              isFolderDropOver ? "drag-over-folder-body" : ""
            }`}
            data-folder-body-id={folder.id}
          >
            {childFolders.map((cf) => renderFolderNode(cf, nextSeen))}
            {childFolders.length === 0 && folderRequests.length === 0 ? (
              <div className="folder-empty-hint">
                {draggedRequestId ? "Drop request here" : "Empty folder"}
              </div>
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

  const draggedRequest = useMemo(
    () =>
      draggedRequestId
        ? requests.find((r) => r.id === draggedRequestId) || null
        : null,
    [draggedRequestId, requests]
  );

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
                onClick={() => openPostmanModal("import")}
                title="Import File dari Postman (Ctrl+I)"
              >
                <Upload size={12} />
                <span>Import</span>
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
          <div className="tree-scroll-area" ref={treeScrollRef}>
            {folders
              .filter((f) => !f.parentId || !folders.some((p) => p.id === f.parentId))
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((f) => renderFolderNode(f))}

            {rootRequests.length > 0 && (
              <div
                className={`root-requests-section ${
                  dropTarget?.kind === "root" ? "drag-over-root" : ""
                }`}
                data-root-drop="true"
              >
                {folders.length > 0 && (
                  <div className="root-requests-caption">Ungrouped Requests</div>
                )}
                {rootRequests.map(renderRequestRow)}
              </div>
            )}

            {draggedRequest && draggedRequest.folderId !== null && rootRequests.length === 0 && (
              <div
                className={`root-drop-zone ${
                  dropTarget?.kind === "root" ? "drag-over-root" : ""
                }`}
                data-root-drop="true"
              >
                Drop here to move to Root (Ungrouped)
              </div>
            )}

            {folders.length === 0 && rootRequests.length === 0 && (
              <div className="sidebar-empty-state">
                <p>No matching requests</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn-primary btn-xs"
                    onClick={() => createRequest(null, "New Request")}
                  >
                    <Plus size={13} />
                    <span>Create Request</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-xs"
                    onClick={() => openPostmanModal("import")}
                  >
                    <Upload size={13} />
                    <span>Import Postman</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {draggedRequest && dragPointer && (
        <div
          className="tree-drag-ghost"
          style={{
            left: dragPointer.x + 12,
            top: dragPointer.y + 10,
          }}
        >
          <MethodBadge method={draggedRequest.method} size="sm" />
          <span className="tree-drag-ghost-name">{draggedRequest.name}</span>
        </div>
      )}
    </aside>
  );
};
