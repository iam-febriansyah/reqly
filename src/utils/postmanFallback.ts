import type {
  AuthConfig,
  Environment,
  EnvironmentVariable,
  Folder,
  KeyValueItem,
  MultipartField,
  PostmanImportPreview,
  PostmanImportResult,
  Project,
  RequestBody,
  SavedRequest,
} from "../types";

export interface LocalDbShape {
  projects: Project[];
  folders: Folder[];
  requests: SavedRequest[];
  environments: Environment[];
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function extractDescription(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "content" in v) {
    return asString((v as Record<string, unknown>).content);
  }
  return "";
}

function isKvEnabled(obj: Record<string, unknown>, defaultEnabled: boolean): boolean {
  if (typeof obj.disabled === "boolean") return !obj.disabled;
  if (typeof obj.enabled === "boolean") return obj.enabled;
  return defaultEnabled;
}

function detectKind(root: Record<string, unknown>): PostmanImportPreview["kind"] {
  if (Array.isArray(root.collections) || Array.isArray(root.environments)) {
    return "dump";
  }
  if ("info" in root || Array.isArray(root.item)) {
    const schema =
      root.info && typeof root.info === "object"
        ? asString((root.info as Record<string, unknown>).schema)
        : "";
    return schema.includes("v2.0") ? "collection_v20" : "collection_v21";
  }
  if (Array.isArray(root.values)) {
    const scope = asString(root._postman_variable_scope).toLowerCase();
    return scope === "globals" ? "globals" : "environment";
  }
  throw new Error(
    "File JSON ini bukan format Postman Collection (v2.0/v2.1), Postman Environment, Globals, atau Postman Dump yang valid."
  );
}

function parseRoot(jsonContent: string): Record<string, unknown> {
  const clean = jsonContent.replace(/^\uFEFF/, "").trim();
  if (!clean) throw new Error("File JSON kosong.");
  const parsed = JSON.parse(clean);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Root JSON harus berupa objek Postman.");
  }
  return parsed as Record<string, unknown>;
}

function countItems(items: unknown[]): { folders: number; requests: number } {
  let folders = 0;
  let requests = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (Array.isArray(item.item)) {
      folders += 1;
      const sub = countItems(item.item);
      folders += sub.folders;
      requests += sub.requests;
    } else if (item.request !== undefined && item.request !== null) {
      requests += 1;
    }
  }
  return { folders, requests };
}

export function inspectPostmanFallback(jsonContent: string): PostmanImportPreview {
  const root = parseRoot(jsonContent);
  const kind = detectKind(root);

  if (kind === "collection_v21" || kind === "collection_v20") {
    const info = (root.info && typeof root.info === "object" ? root.info : {}) as Record<
      string,
      unknown
    >;
    const name = asString(info.name).trim() || "Imported Collection";
    const description = extractDescription(info.description);
    const items = Array.isArray(root.item) ? root.item : [];
    const { folders, requests } = countItems(items);
    const variableCount = Array.isArray(root.variable)
      ? root.variable.filter(
        (v) => v && typeof v === "object" && asString((v as any).key).trim() !== ""
      ).length
      : 0;

    return {
      kind,
      name,
      description,
      folderCount: folders,
      requestCount: requests,
      variableCount,
      environmentCount: variableCount > 0 ? 1 : 0,
      collectionCount: 1,
      environmentNames: [],
      collectionNames: [name],
    };
  }

  if (kind === "environment" || kind === "globals") {
    const name =
      asString(root.name).trim() ||
      (kind === "globals" ? "Postman Globals" : "Postman Environment");
    const values = Array.isArray(root.values) ? root.values : [];
    const variableCount = values.filter(
      (v) => v && typeof v === "object" && asString((v as any).key).trim() !== ""
    ).length;

    return {
      kind,
      name,
      description: "",
      folderCount: 0,
      requestCount: 0,
      variableCount,
      environmentCount: 1,
      collectionCount: 0,
      environmentNames: [name],
      collectionNames: [],
    };
  }

  const collections = Array.isArray(root.collections) ? root.collections : [];
  const environments = Array.isArray(root.environments) ? root.environments : [];
  let folderCount = 0;
  let requestCount = 0;
  let variableCount = 0;
  const collectionNames: string[] = [];
  const environmentNames: string[] = [];

  for (const col of collections) {
    if (!col || typeof col !== "object") continue;
    const c = col as Record<string, unknown>;
    const info = (c.info && typeof c.info === "object" ? c.info : {}) as Record<string, unknown>;
    collectionNames.push(asString(info.name || c.name).trim() || "Imported Collection");
    if (Array.isArray(c.item)) {
      const counts = countItems(c.item);
      folderCount += counts.folders;
      requestCount += counts.requests;
    }
    if (Array.isArray(c.variable)) variableCount += c.variable.length;
  }

  for (const env of environments) {
    if (!env || typeof env !== "object") continue;
    const e = env as Record<string, unknown>;
    environmentNames.push(asString(e.name).trim() || "Imported Environment");
    if (Array.isArray(e.values)) variableCount += e.values.length;
  }

  return {
    kind: "dump",
    name: "Postman Data Dump",
    description: "",
    folderCount,
    requestCount,
    variableCount,
    environmentCount: environmentNames.length,
    collectionCount: collections.length,
    environmentNames,
    collectionNames,
  };
}

function splitRawUrl(raw: string): { baseUrl: string; params: KeyValueItem[] } {
  const trimmed = raw.trim();
  const qIdx = trimmed.indexOf("?");
  if (qIdx === -1) return { baseUrl: trimmed, params: [] };
  const baseUrl = trimmed.slice(0, qIdx);
  const queryPart = trimmed.slice(qIdx + 1).split("#")[0] || "";
  const params: KeyValueItem[] = [];
  for (const pair of queryPart.split("&")) {
    if (!pair) continue;
    const eqIdx = pair.indexOf("=");
    const key = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    const value = eqIdx === -1 ? "" : pair.slice(eqIdx + 1);
    if (key) {
      params.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random()}`,
        key,
        value,
        description: "",
        enabled: true,
      });
    }
  }
  return { baseUrl, params };
}

function extractAuth(authRaw: unknown): AuthConfig | null {
  if (!authRaw || typeof authRaw !== "object") return null;
  const auth = authRaw as Record<string, unknown>;
  const type = asString(auth.type).toLowerCase();

  const findAttr = (block: string, key: string): string => {
    const val = auth[block];
    if (Array.isArray(val)) {
      const hit = val.find(
        (item) => item && typeof item === "object" && (item as any).key === key
      ) as Record<string, unknown> | undefined;
      return hit ? asString(hit.value) : "";
    }
    if (val && typeof val === "object") {
      return asString((val as Record<string, unknown>)[key]);
    }
    return "";
  };

  const base: AuthConfig = {
    type: "none",
    bearerToken: "",
    basicUsername: "",
    basicPassword: "",
    apiKeyName: "",
    apiKeyValue: "",
    apiKeyIn: "header",
  };

  if (type === "bearer") {
    return { ...base, type: "bearer", bearerToken: findAttr("bearer", "token") };
  }
  if (type === "basic") {
    return {
      ...base,
      type: "basic",
      basicUsername: findAttr("basic", "username"),
      basicPassword: findAttr("basic", "password"),
    };
  }
  if (type === "apikey") {
    const inWhere = findAttr("apikey", "in");
    return {
      ...base,
      type: "apikey",
      apiKeyName: findAttr("apikey", "key"),
      apiKeyValue: findAttr("apikey", "value"),
      apiKeyIn: inWhere === "query" ? "query" : "header",
    };
  }
  if (type === "noauth") return base;
  return null;
}

export function importPostmanFallback(
  db: LocalDbShape,
  genId: () => string,
  jsonContent: string,
  options?: {
    targetProjectId?: string | null;
    nameOverride?: string | null;
    setEnvActive?: boolean;
  }
): PostmanImportResult {
  const root = parseRoot(jsonContent);
  const kind = detectKind(root);
  const now = new Date().toISOString();
  const setEnvActive = options?.setEnvActive ?? true;

  const extractVars = (arr: unknown, defaultEnabled: boolean): EnvironmentVariable[] => {
    if (!Array.isArray(arr)) return [];
    const out: EnvironmentVariable[] = [];
    for (const v of arr) {
      if (!v || typeof v !== "object") continue;
      const vo = v as Record<string, unknown>;
      const key = asString(vo.key).trim();
      if (!key) continue;
      out.push({
        id: genId(),
        key,
        value: asString(vo.value),
        enabled: isKvEnabled(vo, defaultEnabled),
      });
    }
    return out;
  };

  const importCollection = (
    colObj: Record<string, unknown>,
    detectedKind: string,
    targetProjectId?: string | null,
    nameOverride?: string | null
  ): PostmanImportResult => {
    const info = (colObj.info && typeof colObj.info === "object"
      ? colObj.info
      : {}) as Record<string, unknown>;
    const chosenName =
      nameOverride?.trim() ||
      asString(info.name || colObj.name).trim() ||
      "Imported Collection";
    const description = extractDescription(info.description);

    let project: Project;
    let merging = false;
    if (targetProjectId) {
      const existing = db.projects.find((p) => p.id === targetProjectId);
      if (!existing) throw new Error("Target project not found");
      project = existing;
      merging = true;
    } else {
      const defaultEnvId = genId();
      project = {
        id: genId(),
        name: chosenName,
        description,
        activeEnvironmentId: defaultEnvId,
        createdAt: now,
        updatedAt: now,
      };
      db.projects.push(project);
      db.environments.push({
        id: defaultEnvId,
        projectId: project.id,
        name: "Development",
        variables: [
          {
            id: genId(),
            key: "BASE_URL",
            value: "http://localhost:8000",
            enabled: true,
          },
        ],
        createdAt: now,
        updatedAt: now,
      });
    }

    const vars = extractVars(colObj.variable, false);
    let environmentsImported = 0;
    let environmentId: string | null = null;
    if (vars.length > 0) {
      if (merging) {
        const env: Environment = {
          id: genId(),
          projectId: project.id,
          name: `${chosenName} Env`,
          variables: vars,
          createdAt: now,
          updatedAt: now,
        };
        db.environments.push(env);
        environmentId = env.id;
        environmentsImported = 1;
        if (setEnvActive) project.activeEnvironmentId = env.id;
      } else {
        const firstEnv = db.environments.find((e) => e.projectId === project.id);
        if (firstEnv) {
          firstEnv.name = "Collection Environment";
          firstEnv.variables = vars;
          firstEnv.updatedAt = now;
          environmentId = firstEnv.id;
          environmentsImported = 1;
        }
      }
    }

    const colAuth: AuthConfig = extractAuth(colObj.auth) || {
      type: "none",
      bearerToken: "",
      basicUsername: "",
      basicPassword: "",
      apiKeyName: "",
      apiKeyValue: "",
      apiKeyIn: "header",
    };

    let foldersImported = 0;
    let requestsImported = 0;

    const walk = (items: unknown[], folderId: string | null, inheritedAuth: AuthConfig) => {
      for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const itemName = asString(item.name).trim() || "Untitled";
        if (Array.isArray(item.item)) {
          const fId = genId();
          db.folders.push({
            id: fId,
            projectId: project.id,
            parentId: folderId,
            name: itemName,
            sortOrder: db.folders.length,
            createdAt: now,
          });
          foldersImported += 1;
          const folderAuth = extractAuth(item.auth) || inheritedAuth;
          walk(item.item, fId, folderAuth);
        } else if (item.request && item.request !== null) {
          const reqVal = item.request;
          let method = "GET";
          let url = "";
          let params: KeyValueItem[] = [];
          let headers: KeyValueItem[] = [];
          let body: RequestBody = {
            mode: "none",
            raw: "",
            urlencoded: [],
            formdata: [],
          };
          let auth = inheritedAuth;

          if (typeof reqVal === "string") {
            const split = splitRawUrl(reqVal);
            url = split.baseUrl;
            params = split.params;
          } else if (typeof reqVal === "object") {
            const r = reqVal as Record<string, unknown>;
            method = asString(r.method).trim().toUpperCase() || "GET";
            if (typeof r.url === "string") {
              const split = splitRawUrl(r.url);
              url = split.baseUrl;
              params = split.params;
            } else if (r.url && typeof r.url === "object") {
              const u = r.url as Record<string, unknown>;
              const rawU = asString(u.raw);
              if (rawU.trim()) {
                const split = splitRawUrl(rawU);
                url = split.baseUrl;
                params = split.params;
              }
              if (Array.isArray(u.query) && u.query.length > 0) {
                params = u.query
                  .filter((q) => q && typeof q === "object" && asString((q as any).key).trim())
                  .map((q) => {
                    const qo = q as Record<string, unknown>;
                    return {
                      id: genId(),
                      key: asString(qo.key).trim(),
                      value: asString(qo.value),
                      description: extractDescription(qo.description),
                      enabled: isKvEnabled(qo, true),
                    };
                  });
              }
            }

            if (Array.isArray(r.header)) {
              headers = r.header
                .filter((h) => h && typeof h === "object" && asString((h as any).key).trim())
                .map((h) => {
                  const ho = h as Record<string, unknown>;
                  return {
                    id: genId(),
                    key: asString(ho.key).trim(),
                    value: asString(ho.value),
                    description: extractDescription(ho.description),
                    enabled: isKvEnabled(ho, true),
                  };
                });
            }

            if (r.body && typeof r.body === "object") {
              const b = r.body as Record<string, unknown>;
              const bMode = asString(b.mode).toLowerCase();
              if (bMode === "raw") {
                const rawText = asString(b.raw);
                const t = rawText.trim();
                const isJson =
                  (t.startsWith("{") && t.endsWith("}")) ||
                  (t.startsWith("[") && t.endsWith("]")) ||
                  headers.some(
                    (h) =>
                      h.key.toLowerCase() === "content-type" &&
                      h.value.toLowerCase().includes("json")
                  );
                body = {
                  mode: isJson ? "json" : "raw",
                  raw: rawText,
                  urlencoded: [],
                  formdata: [],
                };
              } else if (bMode === "graphql" && b.graphql && typeof b.graphql === "object") {
                const gql = b.graphql as Record<string, unknown>;
                let varsParsed: unknown = {};
                if (typeof gql.variables === "string" && gql.variables.trim()) {
                  try {
                    varsParsed = JSON.parse(gql.variables);
                  } catch {
                    varsParsed = gql.variables;
                  }
                }
                body = {
                  mode: "json",
                  raw: JSON.stringify(
                    { query: asString(gql.query), variables: varsParsed },
                    null,
                    2
                  ),
                  urlencoded: [],
                  formdata: [],
                };
              } else if (bMode === "urlencoded" && Array.isArray(b.urlencoded)) {
                body = {
                  mode: "urlencoded",
                  raw: "",
                  urlencoded: b.urlencoded
                    .filter((kv) => kv && typeof kv === "object")
                    .map((kv) => {
                      const kvo = kv as Record<string, unknown>;
                      return {
                        id: genId(),
                        key: asString(kvo.key),
                        value: asString(kvo.value),
                        description: extractDescription(kvo.description),
                        enabled: isKvEnabled(kvo, true),
                      };
                    }),
                  formdata: [],
                };
              } else if (bMode === "formdata" && Array.isArray(b.formdata)) {
                body = {
                  mode: "formdata",
                  raw: "",
                  urlencoded: [],
                  formdata: b.formdata
                    .filter((kv) => kv && typeof kv === "object")
                    .map((kv): MultipartField => {
                      const kvo = kv as Record<string, unknown>;
                      const ftype = kvo.type === "file" ? "file" : "text";
                      const srcVal = Array.isArray(kvo.src)
                        ? asString(kvo.src[0])
                        : asString(kvo.src);
                      return {
                        id: genId(),
                        key: asString(kvo.key),
                        value: ftype === "file" ? srcVal || asString(kvo.value) : asString(kvo.value),
                        fieldType: ftype,
                        fileName: srcVal ? srcVal.split(/[/\\]/).pop() || null : null,
                        enabled: isKvEnabled(kvo, true),
                      };
                    }),
                };
              }
            }
            auth = extractAuth(r.auth) || inheritedAuth;
          }

          const savedReq: SavedRequest = {
            id: genId(),
            projectId: project.id,
            folderId,
            name: itemName,
            method,
            url,
            params,
            headers,
            body,
            auth,
            timeoutMs: 30000,
            sslVerify: false,
            sortOrder: db.requests.length,
            createdAt: now,
            updatedAt: now,
          };
          db.requests.push(savedReq);
          requestsImported += 1;
        }
      }
    };

    if (Array.isArray(colObj.item)) walk(colObj.item, null, colAuth);

    return {
      kind: detectedKind,
      project,
      foldersImported,
      requestsImported,
      environmentsImported,
      variablesImported: vars.length,
      environmentId,
      message: merging
        ? `Imported ${requestsImported} requests & ${foldersImported} folders into "${project.name}"`
        : `Imported collection "${project.name}" (${requestsImported} requests, ${foldersImported} folders)`,
    };
  };

  if (kind === "collection_v21" || kind === "collection_v20") {
    return importCollection(root, kind, options?.targetProjectId, options?.nameOverride);
  }

  if (kind === "environment" || kind === "globals") {
    const project =
      (options?.targetProjectId &&
        db.projects.find((p) => p.id === options.targetProjectId)) ||
      db.projects[0];
    if (!project) throw new Error("No target project available");
    const envName =
      options?.nameOverride?.trim() ||
      asString(root.name).trim() ||
      (kind === "globals" ? "Postman Globals" : "Imported Environment");
    const variables = extractVars(root.values, true);
    const newEnv: Environment = {
      id: genId(),
      projectId: project.id,
      name: envName,
      variables,
      createdAt: now,
      updatedAt: now,
    };
    db.environments.push(newEnv);
    if (setEnvActive) project.activeEnvironmentId = newEnv.id;
    return {
      kind,
      project,
      foldersImported: 0,
      requestsImported: 0,
      environmentsImported: 1,
      variablesImported: variables.length,
      environmentId: newEnv.id,
      message: `Imported environment "${newEnv.name}" (${variables.length} variables)`,
    };
  }

  // Dump
  const collections = Array.isArray(root.collections) ? root.collections : [];
  const environments = Array.isArray(root.environments) ? root.environments : [];
  let foldersImported = 0;
  let requestsImported = 0;
  let environmentsImported = 0;
  let variablesImported = 0;
  let primaryProject: Project | null = null;
  let lastEnvId: string | null = null;

  for (const col of collections) {
    if (col && typeof col === "object") {
      const r = importCollection(col as Record<string, unknown>, "collection_v21", null, null);
      foldersImported += r.foldersImported;
      requestsImported += r.requestsImported;
      environmentsImported += r.environmentsImported;
      variablesImported += r.variablesImported;
      if (!primaryProject) primaryProject = r.project;
    }
  }

  const targetForEnv = primaryProject?.id || options?.targetProjectId || db.projects[0]?.id;
  for (let idx = 0; idx < environments.length; idx++) {
    const envObj = environments[idx];
    if (!envObj || typeof envObj !== "object" || !targetForEnv) continue;
    const eo = envObj as Record<string, unknown>;
    const proj = db.projects.find((p) => p.id === targetForEnv);
    if (!proj) continue;
    const vars = extractVars(eo.values, true);
    const newEnv: Environment = {
      id: genId(),
      projectId: proj.id,
      name: asString(eo.name).trim() || "Imported Environment",
      variables: vars,
      createdAt: now,
      updatedAt: now,
    };
    db.environments.push(newEnv);
    if (setEnvActive && idx === 0) proj.activeEnvironmentId = newEnv.id;
    environmentsImported += 1;
    variablesImported += vars.length;
    lastEnvId = newEnv.id;
    if (!primaryProject) primaryProject = proj;
  }

  if (!primaryProject) {
    const fallback = db.projects.find((p) => p.id === options?.targetProjectId) || db.projects[0];
    if (!fallback) throw new Error("No projects available");
    primaryProject = fallback;
  }

  return {
    kind: "dump",
    project: primaryProject,
    foldersImported,
    requestsImported,
    environmentsImported,
    variablesImported,
    environmentId: lastEnvId,
    message: `Imported dump: ${collections.length} collections, ${requestsImported} requests, ${environmentsImported} environments`,
  };
}
