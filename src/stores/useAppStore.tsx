import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Environment,
  EnvironmentVariable,
  Folder,
  HistoryEntry,
  HttpResponseData,
  Project,
  SavedRequest,
  ThemeMode,
} from "../types";
import { api, generateId } from "../services/api";

export interface TabExecutionState {
  loading: boolean;
  response: HttpResponseData | null;
  error: string | null;
}

interface AppStoreContextValue {
  projects: Project[];
  activeProject: Project | null;
  folders: Folder[];
  requests: SavedRequest[];
  environments: Environment[];
  activeEnvironment: Environment | null;
  activeVariables: EnvironmentVariable[];
  history: HistoryEntry[];
  openTabIds: string[];
  activeRequestId: string | null;
  activeRequest: SavedRequest | null;
  tabStates: Record<string, TabExecutionState>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  envModalOpen: boolean;
  setEnvModalOpen: (open: boolean) => void;
  importExportModalOpen: boolean;
  setImportExportModalOpen: (open: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Project actions
  selectProject: (projectId: string) => Promise<void>;
  createNewProject: (name: string, description?: string) => Promise<void>;
  renameActiveProject: (name: string, description?: string) => Promise<void>;
  deleteProjectById: (projectId: string) => Promise<void>;
  setActiveEnvironmentId: (envId: string | null) => Promise<void>;

  // Folder actions
  createFolder: (name: string, parentId?: string | null) => Promise<Folder | null>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;

  // Request actions
  createRequest: (folderId?: string | null, initialName?: string) => Promise<SavedRequest | null>;
  saveRequest: (req: SavedRequest) => Promise<SavedRequest>;
  openRequestTab: (requestId: string) => void;
  closeRequestTab: (requestId: string) => void;
  updateActiveRequest: (updater: (prev: SavedRequest) => SavedRequest) => void;
  renameRequest: (requestId: string, name: string) => Promise<void>;
  duplicateRequest: (requestId: string) => Promise<void>;
  moveRequestToFolder: (requestId: string, folderId: string | null) => Promise<void>;
  reorderRequest: (requestId: string, direction: "up" | "down") => Promise<void>;
  deleteRequest: (requestId: string) => Promise<void>;

  // Execution actions
  sendActiveRequest: () => Promise<void>;
  cancelActiveRequest: () => Promise<void>;
  clearActiveResponse: () => void;

  // Environment actions
  saveEnvironment: (env: Environment) => Promise<Environment>;
  deleteEnvironment: (envId: string) => Promise<void>;

  // History actions
  reopenHistoryEntry: (entry: HistoryEntry) => Promise<void>;
  clearProjectHistory: () => Promise<void>;
  deleteHistoryEntry: (entryId: string) => Promise<void>;

  // Postman Import / Export
  exportPostmanJson: () => Promise<string>;
  importPostmanJson: (jsonContent: string) => Promise<void>;
}

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

export const AppStoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [requests, setRequests] = useState<SavedRequest[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [tabStates, setTabStates] = useState<Record<string, TabExecutionState>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("reqly_theme_mode") as ThemeMode | null;
    return saved || "system";
  });
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [importExportModalOpen, setImportExportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<Record<string, number>>({});

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  }, []);

  // Theme application
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem("reqly_theme_mode", mode);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark =
        themeMode === "dark" || (themeMode === "system" && prefersDark);
      root.setAttribute("data-theme", isDark ? "dark" : "light");
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  const loadWorkspace = useCallback(async (projectId: string) => {
    const ws = await api.loadProjectWorkspace(projectId);
    setActiveProject(ws.project);
    setFolders(ws.folders);
    setRequests(ws.requests);
    setEnvironments(ws.environments);
    setHistory(ws.history);

    if (ws.requests.length > 0) {
      const firstId = ws.requests[0].id;
      setOpenTabIds([firstId]);
      setActiveRequestId(firstId);
    } else {
      setOpenTabIds([]);
      setActiveRequestId(null);
    }
    localStorage.setItem("reqly_last_project_id", ws.project.id);
  }, []);

  useEffect(() => {
    (async () => {
      const list = await api.listProjects();
      setProjects(list);
      if (list.length > 0) {
        const lastId = localStorage.getItem("reqly_last_project_id");
        const target = list.find((p) => p.id === lastId) || list[0];
        await loadWorkspace(target.id);
      }
    })();
  }, [loadWorkspace]);

  const selectProject = useCallback(
    async (projectId: string) => {
      await loadWorkspace(projectId);
    },
    [loadWorkspace]
  );

  const createNewProject = useCallback(
    async (name: string, description = "") => {
      if (!name.trim()) return;
      const created = await api.createProject(name.trim(), description);
      const all = await api.listProjects();
      setProjects(all);
      await loadWorkspace(created.id);
      showToast(`Created project "${created.name}"`);
    },
    [loadWorkspace, showToast]
  );

  const renameActiveProject = useCallback(
    async (name: string, description?: string) => {
      if (!activeProject || !name.trim()) return;
      const updated = await api.updateProject(
        activeProject.id,
        name.trim(),
        description !== undefined ? description : activeProject.description,
        activeProject.activeEnvironmentId
      );
      setActiveProject(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      showToast("Project updated");
    },
    [activeProject, showToast]
  );

  const deleteProjectById = useCallback(
    async (projectId: string) => {
      if (projects.length <= 1) {
        showToast("At least one project must remain");
        return;
      }
      await api.deleteProject(projectId);
      const remaining = await api.listProjects();
      setProjects(remaining);
      if (activeProject?.id === projectId && remaining.length > 0) {
        await loadWorkspace(remaining[0].id);
      }
      showToast("Project deleted");
    },
    [activeProject, loadWorkspace, projects.length, showToast]
  );

  const setActiveEnvironmentId = useCallback(
    async (envId: string | null) => {
      if (!activeProject) return;
      const updated = await api.updateProject(
        activeProject.id,
        activeProject.name,
        activeProject.description,
        envId
      );
      setActiveProject(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
    },
    [activeProject]
  );

  const createFolder = useCallback(
    async (name: string, parentId: string | null = null) => {
      if (!activeProject || !name.trim()) return null;
      const folder = await api.createFolder(
        activeProject.id,
        parentId,
        name.trim()
      );
      setFolders((prev) => [...prev, folder]);
      showToast(`Created folder "${folder.name}"`);
      return folder;
    },
    [activeProject, showToast]
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      if (!name.trim()) return;
      await api.renameFolder(folderId, name.trim());
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: name.trim() } : f))
      );
    },
    []
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      await api.deleteFolder(folderId);
      const removedRequestIds = new Set(
        requests.filter((r) => r.folderId === folderId).map((r) => r.id)
      );
      setFolders((prev) =>
        prev.filter((f) => f.id !== folderId && f.parentId !== folderId)
      );
      setRequests((prev) => prev.filter((r) => r.folderId !== folderId));
      setOpenTabIds((prev) => {
        const next = prev.filter((id) => !removedRequestIds.has(id));
        if (activeRequestId && removedRequestIds.has(activeRequestId)) {
          setActiveRequestId(next[0] || null);
        }
        return next;
      });
      showToast("Folder deleted");
    },
    [activeRequestId, requests, showToast]
  );

  const createRequest = useCallback(
    async (folderId: string | null = null, initialName = "New Request") => {
      if (!activeProject) return null;
      const now = new Date().toISOString();
      const newReq: SavedRequest = {
        id: generateId(),
        projectId: activeProject.id,
        folderId,
        name: initialName,
        method: "GET",
        url: "{{BASE_URL}}/users",
        params: [],
        headers: [
          {
            id: generateId(),
            key: "Accept",
            value: "application/json",
            description: "",
            enabled: true,
          },
        ],
        body: { mode: "none", raw: "", urlencoded: [], formdata: [] },
        auth: {
          type: "none",
          bearerToken: "",
          basicUsername: "",
          basicPassword: "",
          apiKeyName: "",
          apiKeyValue: "",
          apiKeyIn: "header",
        },
        timeoutMs: 30000,
        sslVerify: false,
        sortOrder: requests.length,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await api.saveRequest(newReq);
      setRequests((prev) => [...prev, saved]);
      setOpenTabIds((prev) =>
        prev.includes(saved.id) ? prev : [...prev, saved.id]
      );
      setActiveRequestId(saved.id);
      return saved;
    },
    [activeProject, requests.length]
  );

  const saveRequest = useCallback(async (req: SavedRequest) => {
    const saved = await api.saveRequest(req);
    setRequests((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
    });
    return saved;
  }, []);

  const openRequestTab = useCallback((requestId: string) => {
    setOpenTabIds((prev) =>
      prev.includes(requestId) ? prev : [...prev, requestId]
    );
    setActiveRequestId(requestId);
  }, []);

  const closeRequestTab = useCallback(
    (requestId: string) => {
      setOpenTabIds((prev) => {
        const idx = prev.indexOf(requestId);
        const next = prev.filter((id) => id !== requestId);
        if (activeRequestId === requestId) {
          const fallback = next[idx] || next[idx - 1] || next[0] || null;
          setActiveRequestId(fallback);
        }
        return next;
      });
    },
    [activeRequestId]
  );

  const activeRequest = useMemo(
    () => requests.find((r) => r.id === activeRequestId) || null,
    [requests, activeRequestId]
  );

  const updateActiveRequest = useCallback(
    (updater: (prev: SavedRequest) => SavedRequest) => {
      if (!activeRequestId) return;
      setRequests((prev) => {
        const idx = prev.findIndex((r) => r.id === activeRequestId);
        if (idx === -1) return prev;
        const updated = updater(prev[idx]);
        const next = [...prev];
        next[idx] = updated;

        // Debounced auto-save to SQLite
        if (saveTimerRef.current[updated.id]) {
          window.clearTimeout(saveTimerRef.current[updated.id]);
        }
        saveTimerRef.current[updated.id] = window.setTimeout(() => {
          api.saveRequest(updated).catch(() => {});
        }, 180);

        return next;
      });
    },
    [activeRequestId]
  );

  const renameRequest = useCallback(
    async (requestId: string, name: string) => {
      if (!name.trim()) return;
      const target = requests.find((r) => r.id === requestId);
      if (!target) return;
      const updated = { ...target, name: name.trim() };
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? updated : r))
      );
      await api.saveRequest(updated);
    },
    [requests]
  );

  const duplicateRequest = useCallback(
    async (requestId: string) => {
      const copy = await api.duplicateRequest(requestId);
      setRequests((prev) => [...prev, copy]);
      setOpenTabIds((prev) => [...prev, copy.id]);
      setActiveRequestId(copy.id);
      showToast(`Duplicated "${copy.name}"`);
    },
    [showToast]
  );

  const moveRequestToFolder = useCallback(
    async (requestId: string, folderId: string | null) => {
      const target = requests.find((r) => r.id === requestId);
      if (!target) return;
      await api.moveRequest(requestId, folderId, target.sortOrder);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, folderId } : r))
      );
    },
    [requests]
  );

  const reorderRequest = useCallback(
    async (requestId: string, direction: "up" | "down") => {
      const target = requests.find((r) => r.id === requestId);
      if (!target) return;
      const siblings = requests
        .filter((r) => r.folderId === target.folderId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = siblings.findIndex((r) => r.id === requestId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;

      const reorderedSiblings = [...siblings];
      const [moved] = reorderedSiblings.splice(idx, 1);
      reorderedSiblings.splice(swapIdx, 0, moved);

      const siblingOrderMap = new Map<string, number>();
      reorderedSiblings.forEach((item, i) => siblingOrderMap.set(item.id, i));

      const nextRequests = requests
        .map((r) =>
          siblingOrderMap.has(r.id)
            ? { ...r, sortOrder: siblingOrderMap.get(r.id)! }
            : r
        )
        .sort((a, b) => a.sortOrder - b.sortOrder);

      setRequests(nextRequests);
      await api.reorderRequests(nextRequests.map((r) => r.id));
    },
    [requests]
  );

  const deleteRequest = useCallback(
    async (requestId: string) => {
      await api.deleteRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      closeRequestTab(requestId);
      showToast("Request deleted");
    },
    [closeRequestTab, showToast]
  );

  const activeEnvironment = useMemo(
    () =>
      environments.find((e) => e.id === activeProject?.activeEnvironmentId) ||
      null,
    [environments, activeProject?.activeEnvironmentId]
  );

  const activeVariables = useMemo(
    () => activeEnvironment?.variables || [],
    [activeEnvironment]
  );

  const sendActiveRequest = useCallback(async () => {
    if (!activeProject || !activeRequest) return;
    const reqId = activeRequest.id;

    // Ensure latest state is persisted before sending
    await api.saveRequest(activeRequest);

    setTabStates((prev) => ({
      ...prev,
      [reqId]: {
        loading: true,
        response: prev[reqId]?.response || null,
        error: null,
      },
    }));

    try {
      const response = await api.sendHttpRequest(
        activeProject.id,
        activeRequest
      );
      setTabStates((prev) => ({
        ...prev,
        [reqId]: {
          loading: false,
          response,
          error: null,
        },
      }));
      const latestHistory = await api.listHistory(activeProject.id);
      setHistory(latestHistory);
    } catch (err: any) {
      const message =
        typeof err === "string"
          ? err
          : err?.message || "Failed to execute HTTP request";
      setTabStates((prev) => ({
        ...prev,
        [reqId]: {
          loading: false,
          response: null,
          error: message,
        },
      }));
      const latestHistory = await api.listHistory(activeProject.id);
      setHistory(latestHistory);
    }
  }, [activeProject, activeRequest]);

  const cancelActiveRequest = useCallback(async () => {
    if (!activeRequest) return;
    await api.cancelHttpRequest(activeRequest.id);
    setTabStates((prev) => ({
      ...prev,
      [activeRequest.id]: {
        loading: false,
        response: prev[activeRequest.id]?.response || null,
        error: "Request cancelled by user.",
      },
    }));
  }, [activeRequest]);

  const clearActiveResponse = useCallback(() => {
    if (!activeRequest) return;
    setTabStates((prev) => ({
      ...prev,
      [activeRequest.id]: {
        loading: false,
        response: null,
        error: null,
      },
    }));
  }, [activeRequest]);

  const saveEnvironment = useCallback(async (env: Environment) => {
    const saved = await api.saveEnvironment(env);
    setEnvironments((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      return exists
        ? prev.map((e) => (e.id === saved.id ? saved : e))
        : [...prev, saved];
    });
    return saved;
  }, []);

  const deleteEnvironment = useCallback(
    async (envId: string) => {
      await api.deleteEnvironment(envId);
      setEnvironments((prev) => prev.filter((e) => e.id !== envId));
      if (activeProject?.activeEnvironmentId === envId) {
        setActiveProject((prev) =>
          prev ? { ...prev, activeEnvironmentId: null } : null
        );
      }
      showToast("Environment deleted");
    },
    [activeProject?.activeEnvironmentId, showToast]
  );

  const reopenHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      const existing = requests.find((r) => r.id === entry.requestSnapshot.id);
      if (existing) {
        openRequestTab(existing.id);
        return;
      }
      if (!activeProject) return;
      const now = new Date().toISOString();
      const restored: SavedRequest = {
        ...entry.requestSnapshot,
        id: generateId(),
        projectId: activeProject.id,
        folderId: null,
        name: `${entry.method} ${entry.url.replace(/^https?:\/\//, "").slice(0, 28)}`,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await api.saveRequest(restored);
      setRequests((prev) => [...prev, saved]);
      openRequestTab(saved.id);
      showToast("Reopened request from history");
    },
    [activeProject, openRequestTab, requests, showToast]
  );

  const clearProjectHistory = useCallback(async () => {
    if (!activeProject) return;
    await api.clearHistory(activeProject.id);
    setHistory([]);
    showToast("History cleared");
  }, [activeProject, showToast]);

  const deleteHistoryEntry = useCallback(async (entryId: string) => {
    await api.removeHistoryItem(entryId);
    setHistory((prev) => prev.filter((h) => h.id !== entryId));
  }, []);

  const exportPostmanJson = useCallback(async () => {
    if (!activeProject) throw new Error("No active project");
    return api.exportPostmanCollection(activeProject.id);
  }, [activeProject]);

  const importPostmanJson = useCallback(
    async (jsonContent: string) => {
      const importedProject = await api.importPostmanCollection(jsonContent);
      const all = await api.listProjects();
      setProjects(all);
      await loadWorkspace(importedProject.id);
      showToast(`Imported collection "${importedProject.name}"`);
    },
    [loadWorkspace, showToast]
  );

  const value = useMemo<AppStoreContextValue>(
    () => ({
      projects,
      activeProject,
      folders,
      requests,
      environments,
      activeEnvironment,
      activeVariables,
      history,
      openTabIds,
      activeRequestId,
      activeRequest,
      tabStates,
      searchQuery,
      setSearchQuery,
      themeMode,
      setThemeMode,
      envModalOpen,
      setEnvModalOpen,
      importExportModalOpen,
      setImportExportModalOpen,
      toastMessage,
      showToast,
      selectProject,
      createNewProject,
      renameActiveProject,
      deleteProjectById,
      setActiveEnvironmentId,
      createFolder,
      renameFolder,
      deleteFolder,
      createRequest,
      saveRequest,
      openRequestTab,
      closeRequestTab,
      updateActiveRequest,
      renameRequest,
      duplicateRequest,
      moveRequestToFolder,
      reorderRequest,
      deleteRequest,
      sendActiveRequest,
      cancelActiveRequest,
      clearActiveResponse,
      saveEnvironment,
      deleteEnvironment,
      reopenHistoryEntry,
      clearProjectHistory,
      deleteHistoryEntry,
      exportPostmanJson,
      importPostmanJson,
    }),
    [
      projects,
      activeProject,
      folders,
      requests,
      environments,
      activeEnvironment,
      activeVariables,
      history,
      openTabIds,
      activeRequestId,
      activeRequest,
      tabStates,
      searchQuery,
      themeMode,
      setThemeMode,
      envModalOpen,
      importExportModalOpen,
      toastMessage,
      showToast,
      selectProject,
      createNewProject,
      renameActiveProject,
      deleteProjectById,
      setActiveEnvironmentId,
      createFolder,
      renameFolder,
      deleteFolder,
      createRequest,
      saveRequest,
      openRequestTab,
      closeRequestTab,
      updateActiveRequest,
      renameRequest,
      duplicateRequest,
      moveRequestToFolder,
      reorderRequest,
      deleteRequest,
      sendActiveRequest,
      cancelActiveRequest,
      clearActiveResponse,
      saveEnvironment,
      deleteEnvironment,
      reopenHistoryEntry,
      clearProjectHistory,
      deleteHistoryEntry,
      exportPostmanJson,
      importPostmanJson,
    ]
  );

  return (
    <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
  );
};

export function useAppStore(): AppStoreContextValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }
  return ctx;
}

