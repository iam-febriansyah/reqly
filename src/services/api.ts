import { invoke } from "@tauri-apps/api/core";
import type {
  Environment,
  EnvironmentVariable,
  Folder,
  HistoryEntry,
  HttpResponseData,
  KeyValueItem,
  Project,
  ProjectWorkspaceData,
  SavedRequest,
} from "../types";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).substring(2, 11) + "-" + Date.now();
}

export function resolveVariablesInString(
  input: string,
  variables: EnvironmentVariable[]
): { resolved: string; unresolved: string[] } {
  const varMap = new Map<string, string>();
  for (const v of variables) {
    if (v.enabled && v.key.trim()) {
      varMap.set(v.key.trim(), v.value);
    }
  }

  const unresolvedSet = new Set<string>();
  const resolved = input.replace(/\{\{([^{}]+)\}\}/g, (match, rawName) => {
    const key = String(rawName).trim();
    if (!key) return match;
    if (varMap.has(key)) {
      return varMap.get(key)!;
    }
    unresolvedSet.add(key);
    return match;
  });

  return {
    resolved,
    unresolved: Array.from(unresolvedSet).sort(),
  };
}

export function collectUnresolvedVariables(
  req: SavedRequest,
  variables: EnvironmentVariable[]
): { resolvedUrl: string; unresolved: string[] } {
  const unresolvedSet = new Set<string>();
  const check = (str: string) => {
    const res = resolveVariablesInString(str, variables);
    res.unresolved.forEach((u) => unresolvedSet.add(u));
    return res.resolved;
  };

  const resolvedUrl = check(req.url);
  req.params.filter((p) => p.enabled).forEach((p) => {
    check(p.key);
    check(p.value);
  });
  req.headers.filter((h) => h.enabled).forEach((h) => {
    check(h.key);
    check(h.value);
  });
  if (req.body.mode === "json" || req.body.mode === "raw") {
    check(req.body.raw);
  } else if (req.body.mode === "urlencoded") {
    req.body.urlencoded.filter((u) => u.enabled).forEach((u) => {
      check(u.key);
      check(u.value);
    });
  } else if (req.body.mode === "formdata") {
    req.body.formdata.filter((f) => f.enabled).forEach((f) => {
      check(f.key);
      check(f.value);
    });
  }

  if (req.auth.type === "bearer") {
    check(req.auth.bearerToken);
  } else if (req.auth.type === "basic") {
    check(req.auth.basicUsername);
    check(req.auth.basicPassword);
  } else if (req.auth.type === "apikey") {
    check(req.auth.apiKeyName);
    check(req.auth.apiKeyValue);
  }

  return {
    resolvedUrl,
    unresolved: Array.from(unresolvedSet).sort(),
  };
}

// ==================== FALLBACK LOCAL STORAGE FOR WEB DEV PREVIEW ====================
const STORAGE_KEY = "reqly_local_db_v1";

interface LocalDbSchema {
  projects: Project[];
  folders: Folder[];
  requests: SavedRequest[];
  environments: Environment[];
  history: HistoryEntry[];
}

function getFallbackDb(): LocalDbSchema {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // recreate below
    }
  }
  const now = new Date().toISOString();
  const projectId = generateId();
  const prodEnvId = generateId();
  const devEnvId = generateId();
  const usersFolderId = generateId();
  const postsFolderId = generateId();

  const initial: LocalDbSchema = {
    projects: [
      {
        id: projectId,
        name: "Core Platform API",
        description: "Starter workspace with sample endpoints and environments",
        activeEnvironmentId: prodEnvId,
        createdAt: now,
        updatedAt: now,
      },
    ],
    folders: [
      {
        id: usersFolderId,
        projectId,
        parentId: null,
        name: "Users",
        sortOrder: 0,
        createdAt: now,
      },
      {
        id: postsFolderId,
        projectId,
        parentId: null,
        name: "Posts",
        sortOrder: 1,
        createdAt: now,
      },
    ],
    environments: [
      {
        id: prodEnvId,
        projectId,
        name: "Production (JSONPlaceholder)",
        variables: [
          {
            id: generateId(),
            key: "BASE_URL",
            value: "https://jsonplaceholder.typicode.com",
            enabled: true,
          },
          {
            id: generateId(),
            key: "API_TOKEN",
            value: "prod-demo-token-9001",
            enabled: true,
          },
          {
            id: generateId(),
            key: "USER_ID",
            value: "1",
            enabled: true,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: devEnvId,
        projectId,
        name: "Development (Localhost)",
        variables: [
          {
            id: generateId(),
            key: "BASE_URL",
            value: "http://localhost:8000",
            enabled: true,
          },
          {
            id: generateId(),
            key: "API_TOKEN",
            value: "dev-token-local",
            enabled: true,
          },
          {
            id: generateId(),
            key: "USER_ID",
            value: "1001",
            enabled: true,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    requests: [
      {
        id: generateId(),
        projectId,
        folderId: usersFolderId,
        name: "Get User Profile",
        method: "GET",
        url: "{{BASE_URL}}/users/{{USER_ID}}",
        params: [],
        headers: [
          {
            id: generateId(),
            key: "Accept",
            value: "application/json",
            description: "JSON response format",
            enabled: true,
          },
        ],
        body: { mode: "none", raw: "", urlencoded: [], formdata: [] },
        auth: {
          type: "bearer",
          bearerToken: "{{API_TOKEN}}",
          basicUsername: "",
          basicPassword: "",
          apiKeyName: "",
          apiKeyValue: "",
          apiKeyIn: "header",
        },
        timeoutMs: 30000,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        projectId,
        folderId: usersFolderId,
        name: "Create User",
        method: "POST",
        url: "{{BASE_URL}}/users",
        params: [],
        headers: [
          {
            id: generateId(),
            key: "Content-Type",
            value: "application/json",
            description: "",
            enabled: true,
          },
        ],
        body: {
          mode: "json",
          raw: '{\n  "name": "Ada Lovelace",\n  "username": "ada",\n  "email": "ada@analytical.engine"\n}',
          urlencoded: [],
          formdata: [],
        },
        auth: {
          type: "bearer",
          bearerToken: "{{API_TOKEN}}",
          basicUsername: "",
          basicPassword: "",
          apiKeyName: "",
          apiKeyValue: "",
          apiKeyIn: "header",
        },
        timeoutMs: 30000,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        projectId,
        folderId: postsFolderId,
        name: "List Posts",
        method: "GET",
        url: "{{BASE_URL}}/posts",
        params: [
          {
            id: generateId(),
            key: "userId",
            value: "{{USER_ID}}",
            description: "Filter posts by user ID",
            enabled: true,
          },
        ],
        headers: [],
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
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ],
    history: [],
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveFallbackDb(db: LocalDbSchema) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const activeBrowserControllers = new Map<string, AbortController>();

export const api = {
  async listProjects(): Promise<Project[]> {
    if (isTauriRuntime()) {
      return invoke<Project[]>("list_projects");
    }
    return getFallbackDb().projects;
  },

  async loadProjectWorkspace(projectId: string): Promise<ProjectWorkspaceData> {
    if (isTauriRuntime()) {
      return invoke<ProjectWorkspaceData>("load_project_workspace", { projectId });
    }
    const db = getFallbackDb();
    const project = db.projects.find((p) => p.id === projectId) || db.projects[0];
    return {
      project,
      folders: db.folders
        .filter((f) => f.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      requests: db.requests
        .filter((r) => r.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      environments: db.environments.filter((e) => e.projectId === project.id),
      history: db.history
        .filter((h) => h.projectId === project.id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    };
  },

  async createProject(name: string, description: string): Promise<Project> {
    if (isTauriRuntime()) {
      return invoke<Project>("create_project", { name, description });
    }
    const db = getFallbackDb();
    const now = new Date().toISOString();
    const projectId = generateId();
    const envId = generateId();
    const project: Project = {
      id: projectId,
      name: name.trim(),
      description: description.trim(),
      activeEnvironmentId: envId,
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(project);
    db.environments.push({
      id: envId,
      projectId,
      name: "Development",
      variables: [
        {
          id: generateId(),
          key: "BASE_URL",
          value: "http://localhost:8000",
          enabled: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    saveFallbackDb(db);
    return project;
  },

  async updateProject(
    projectId: string,
    name: string,
    description: string,
    activeEnvironmentId: string | null
  ): Promise<Project> {
    if (isTauriRuntime()) {
      return invoke<Project>("update_project", {
        projectId,
        name,
        description,
        activeEnvironmentId,
      });
    }
    const db = getFallbackDb();
    const idx = db.projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error("Project not found");
    db.projects[idx] = {
      ...db.projects[idx],
      name: name.trim(),
      description: description.trim(),
      activeEnvironmentId,
      updatedAt: new Date().toISOString(),
    };
    saveFallbackDb(db);
    return db.projects[idx];
  },

  async deleteProject(projectId: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("delete_project", { projectId });
    }
    const db = getFallbackDb();
    db.projects = db.projects.filter((p) => p.id !== projectId);
    db.folders = db.folders.filter((f) => f.projectId !== projectId);
    db.requests = db.requests.filter((r) => r.projectId !== projectId);
    db.environments = db.environments.filter((e) => e.projectId !== projectId);
    db.history = db.history.filter((h) => h.projectId !== projectId);
    saveFallbackDb(db);
  },

  async createFolder(
    projectId: string,
    parentId: string | null,
    name: string
  ): Promise<Folder> {
    if (isTauriRuntime()) {
      return invoke<Folder>("create_folder", { projectId, parentId, name });
    }
    const db = getFallbackDb();
    const folder: Folder = {
      id: generateId(),
      projectId,
      parentId,
      name: name.trim(),
      sortOrder: db.folders.filter((f) => f.projectId === projectId).length,
      createdAt: new Date().toISOString(),
    };
    db.folders.push(folder);
    saveFallbackDb(db);
    return folder;
  },

  async renameFolder(folderId: string, name: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("rename_folder", { folderId, name });
    }
    const db = getFallbackDb();
    const f = db.folders.find((item) => item.id === folderId);
    if (f) f.name = name.trim();
    saveFallbackDb(db);
  },

  async deleteFolder(folderId: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("delete_folder", { folderId });
    }
    const db = getFallbackDb();
    db.folders = db.folders.filter((f) => f.id !== folderId && f.parentId !== folderId);
    db.requests = db.requests.filter((r) => r.folderId !== folderId);
    saveFallbackDb(db);
  },

  async saveRequest(request: SavedRequest): Promise<SavedRequest> {
    if (isTauriRuntime()) {
      return invoke<SavedRequest>("save_request", { request });
    }
    const db = getFallbackDb();
    const now = new Date().toISOString();
    const updated: SavedRequest = {
      ...request,
      updatedAt: now,
      createdAt: request.createdAt || now,
    };
    const idx = db.requests.findIndex((r) => r.id === request.id);
    if (idx >= 0) {
      db.requests[idx] = updated;
    } else {
      db.requests.push(updated);
    }
    saveFallbackDb(db);
    return updated;
  },

  async duplicateRequest(requestId: string): Promise<SavedRequest> {
    if (isTauriRuntime()) {
      return invoke<SavedRequest>("duplicate_request", { requestId });
    }
    const db = getFallbackDb();
    const orig = db.requests.find((r) => r.id === requestId);
    if (!orig) throw new Error("Request not found");
    const now = new Date().toISOString();
    const copy: SavedRequest = {
      ...JSON.parse(JSON.stringify(orig)),
      id: generateId(),
      name: `${orig.name} Copy`,
      sortOrder: orig.sortOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    db.requests.push(copy);
    saveFallbackDb(db);
    return copy;
  },

  async moveRequest(
    requestId: string,
    targetFolderId: string | null,
    sortOrder: number
  ): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("move_request", { requestId, targetFolderId, sortOrder });
    }
    const db = getFallbackDb();
    const req = db.requests.find((r) => r.id === requestId);
    if (req) {
      req.folderId = targetFolderId;
      req.sortOrder = sortOrder;
      req.updatedAt = new Date().toISOString();
    }
    saveFallbackDb(db);
  },

  async reorderRequests(orderedIds: string[]): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("reorder_requests", { orderedIds });
    }
    const db = getFallbackDb();
    orderedIds.forEach((id, index) => {
      const req = db.requests.find((r) => r.id === id);
      if (req) req.sortOrder = index;
    });
    saveFallbackDb(db);
  },

  async deleteRequest(requestId: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("delete_request", { requestId });
    }
    const db = getFallbackDb();
    db.requests = db.requests.filter((r) => r.id !== requestId);
    saveFallbackDb(db);
  },

  async saveEnvironment(environment: Environment): Promise<Environment> {
    if (isTauriRuntime()) {
      return invoke<Environment>("save_environment", { environment });
    }
    const db = getFallbackDb();
    const now = new Date().toISOString();
    const updated: Environment = {
      ...environment,
      updatedAt: now,
      createdAt: environment.createdAt || now,
    };
    const idx = db.environments.findIndex((e) => e.id === environment.id);
    if (idx >= 0) {
      db.environments[idx] = updated;
    } else {
      db.environments.push(updated);
    }
    saveFallbackDb(db);
    return updated;
  },

  async deleteEnvironment(environmentId: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("delete_environment", { environmentId });
    }
    const db = getFallbackDb();
    db.environments = db.environments.filter((e) => e.id !== environmentId);
    db.projects.forEach((p) => {
      if (p.activeEnvironmentId === environmentId) {
        p.activeEnvironmentId = null;
      }
    });
    saveFallbackDb(db);
  },

  async sendHttpRequest(
    projectId: string,
    request: SavedRequest
  ): Promise<HttpResponseData> {
    if (isTauriRuntime()) {
      return invoke<HttpResponseData>("send_http_request", { projectId, request });
    }

    // Fallback browser execution for Vite dev preview
    const db = getFallbackDb();
    const project = db.projects.find((p) => p.id === projectId);
    const activeEnv = db.environments.find(
      (e) => e.id === project?.activeEnvironmentId
    );
    const vars = activeEnv?.variables || [];
    const { unresolved } = collectUnresolvedVariables(request, vars);
    const rStr = (s: string) => resolveVariablesInString(s, vars).resolved;

    let rawUrl = rStr(request.url).trim();
    if (!rawUrl) throw new Error("Request URL cannot be empty.");
    if (!rawUrl.includes("://") && !rawUrl.startsWith("http")) {
      rawUrl = "http://" + rawUrl;
    }
    const urlObj = new URL(rawUrl);
    request.params
      .filter((p) => p.enabled && p.key.trim())
      .forEach((p) => {
        urlObj.searchParams.append(rStr(p.key.trim()), rStr(p.value));
      });
    if (
      request.auth.type === "apikey" &&
      request.auth.apiKeyIn === "query" &&
      request.auth.apiKeyName.trim()
    ) {
      urlObj.searchParams.append(
        rStr(request.auth.apiKeyName.trim()),
        rStr(request.auth.apiKeyValue)
      );
    }

    const headers = new Headers();
    request.headers
      .filter((h) => h.enabled && h.key.trim())
      .forEach((h) => {
        headers.set(rStr(h.key.trim()), rStr(h.value));
      });

    if (request.auth.type === "bearer" && request.auth.bearerToken.trim()) {
      headers.set("Authorization", `Bearer ${rStr(request.auth.bearerToken.trim())}`);
    } else if (request.auth.type === "basic") {
      const token = btoa(
        `${rStr(request.auth.basicUsername)}:${rStr(request.auth.basicPassword)}`
      );
      headers.set("Authorization", `Basic ${token}`);
    } else if (
      request.auth.type === "apikey" &&
      request.auth.apiKeyIn === "header" &&
      request.auth.apiKeyName.trim()
    ) {
      headers.set(
        rStr(request.auth.apiKeyName.trim()),
        rStr(request.auth.apiKeyValue)
      );
    }

    let body: BodyInit | undefined;
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      if (request.body.mode === "json") {
        if (!headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        body = rStr(request.body.raw);
      } else if (request.body.mode === "raw") {
        body = rStr(request.body.raw);
      } else if (request.body.mode === "urlencoded") {
        const params = new URLSearchParams();
        request.body.urlencoded
          .filter((u) => u.enabled && u.key.trim())
          .forEach((u) => params.append(rStr(u.key.trim()), rStr(u.value)));
        body = params;
      } else if (request.body.mode === "formdata") {
        const fd = new FormData();
        request.body.formdata
          .filter((f) => f.enabled && f.key.trim())
          .forEach((f) => fd.append(rStr(f.key.trim()), rStr(f.value)));
        body = fd;
      }
    }

    const controller = new AbortController();
    activeBrowserControllers.set(request.id, controller);
    const timeoutId = setTimeout(
      () => controller.abort(),
      request.timeoutMs || 30000
    );

    const start = performance.now();
    try {
      const resp = await fetch(urlObj.toString(), {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const buf = await resp.arrayBuffer();
      const durationMs = Math.round(performance.now() - start);
      const sizeBytes = buf.byteLength;
      const respHeaders: { key: string; value: string }[] = [];
      resp.headers.forEach((value, key) => respHeaders.push({ key, value }));
      const contentType = resp.headers.get("content-type") || "";
      const isImage = contentType.toLowerCase().startsWith("image/");
      let bodyText = "";
      let imageBase64: string | null = null;
      if (isImage) {
        const bytes = new Uint8Array(buf);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        imageBase64 = `data:${contentType.split(";")[0]};base64,${btoa(binary)}`;
        bodyText = `[Binary Image Payload: ${contentType} (${sizeBytes} bytes)]`;
      } else {
        bodyText = new TextDecoder().decode(buf);
      }

      db.history.unshift({
        id: generateId(),
        projectId,
        method,
        url: urlObj.toString(),
        statusCode: resp.status,
        durationMs,
        responseSize: sizeBytes,
        timestamp: new Date().toISOString(),
        requestSnapshot: JSON.parse(JSON.stringify(request)),
      });
      db.history = db.history.slice(0, 150);
      saveFallbackDb(db);

      return {
        status: resp.status,
        statusText: resp.statusText || "OK",
        durationMs,
        sizeBytes,
        headers: respHeaders,
        body: bodyText,
        contentType,
        isImage,
        imageBase64,
        resolvedUrl: urlObj.toString(),
        unresolvedVariables: unresolved,
      };
    } finally {
      clearTimeout(timeoutId);
      activeBrowserControllers.delete(request.id);
    }
  },

  async cancelHttpRequest(requestId: string): Promise<boolean> {
    if (isTauriRuntime()) {
      return invoke<boolean>("cancel_http_request", { requestId });
    }
    const ctrl = activeBrowserControllers.get(requestId);
    if (ctrl) {
      ctrl.abort();
      activeBrowserControllers.delete(requestId);
      return true;
    }
    return false;
  },

  async listHistory(projectId: string): Promise<HistoryEntry[]> {
    if (isTauriRuntime()) {
      return invoke<HistoryEntry[]>("list_history", { projectId });
    }
    return getFallbackDb().history.filter((h) => h.projectId === projectId);
  },

  async clearHistory(projectId: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("clear_history", { projectId });
    }
    const db = getFallbackDb();
    db.history = db.history.filter((h) => h.projectId !== projectId);
    saveFallbackDb(db);
  },

  async removeHistoryItem(entryId: string): Promise<void> {
    if (isTauriRuntime()) {
      return invoke("remove_history_item", { entryId });
    }
    const db = getFallbackDb();
    db.history = db.history.filter((h) => h.id !== entryId);
    saveFallbackDb(db);
  },

  async exportPostmanCollection(projectId: string): Promise<string> {
    if (isTauriRuntime()) {
      return invoke<string>("export_postman_collection", { projectId });
    }
    const ws = await this.loadProjectWorkspace(projectId);
    const activeEnv =
      ws.environments.find((e) => e.id === ws.project.activeEnvironmentId) ||
      ws.environments[0];
    const collection = {
      info: {
        _postman_id: ws.project.id,
        name: ws.project.name,
        description: ws.project.description,
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: ws.folders.map((folder) => ({
        name: folder.name,
        item: ws.requests
          .filter((r) => r.folderId === folder.id)
          .map((r) => ({
            name: r.name,
            request: {
              method: r.method,
              header: r.headers.map((h) => ({
                key: h.key,
                value: h.value,
                description: h.description,
                disabled: !h.enabled,
              })),
              url: {
                raw: r.url,
                query: r.params.map((p) => ({
                  key: p.key,
                  value: p.value,
                  description: p.description,
                  disabled: !p.enabled,
                })),
              },
            },
          })),
      })),
      variable: (activeEnv?.variables || []).map((v) => ({
        key: v.key,
        value: v.value,
        type: "string",
        disabled: !v.enabled,
      })),
    };
    return JSON.stringify(collection, null, 2);
  },

  async importPostmanCollection(jsonContent: string): Promise<Project> {
    if (isTauriRuntime()) {
      return invoke<Project>("import_postman_collection_cmd", { jsonContent });
    }
    const parsed = JSON.parse(jsonContent);
    const p = await this.createProject(
      parsed?.info?.name || "Imported Collection",
      parsed?.info?.description || ""
    );
    const db = getFallbackDb();
    if (Array.isArray(parsed?.variable) && p.activeEnvironmentId) {
      const env = db.environments.find((e) => e.id === p.activeEnvironmentId);
      if (env) {
        env.variables = parsed.variable.map(
          (v: { key?: string; value?: string; disabled?: boolean }) => ({
            id: generateId(),
            key: String(v.key || ""),
            value: String(v.value ?? ""),
            enabled: !v.disabled,
          })
        );
      }
    }
    const importItems = (items: any[], folderId: string | null) => {
      for (const item of items || []) {
        if (Array.isArray(item.item)) {
          const fId = generateId();
          db.folders.push({
            id: fId,
            projectId: p.id,
            parentId: folderId,
            name: item.name || "Folder",
            sortOrder: db.folders.length,
            createdAt: new Date().toISOString(),
          });
          importItems(item.item, fId);
        } else if (item.request) {
          const rawUrl =
            typeof item.request.url === "string"
              ? item.request.url
              : item.request.url?.raw || "";
          const baseUrl = rawUrl.split("?")[0] || rawUrl;
          const params: KeyValueItem[] = Array.isArray(item.request.url?.query)
            ? item.request.url.query.map((q: any) => ({
                id: generateId(),
                key: String(q.key || ""),
                value: String(q.value ?? ""),
                description: String(q.description || ""),
                enabled: !q.disabled,
              }))
            : [];
          const headers: KeyValueItem[] = Array.isArray(item.request.header)
            ? item.request.header.map((h: any) => ({
                id: generateId(),
                key: String(h.key || ""),
                value: String(h.value ?? ""),
                description: String(h.description || ""),
                enabled: !h.disabled,
              }))
            : [];
          db.requests.push({
            id: generateId(),
            projectId: p.id,
            folderId,
            name: item.name || "Request",
            method: (item.request.method || "GET").toUpperCase(),
            url: baseUrl,
            params,
            headers,
            body: {
              mode:
                item.request.body?.mode === "raw"
                  ? "json"
                  : item.request.body?.mode || "none",
              raw: item.request.body?.raw || "",
              urlencoded: [],
              formdata: [],
            },
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
            sortOrder: db.requests.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    };
    importItems(parsed?.item || [], null);
    saveFallbackDb(db);
    return p;
  },
};

