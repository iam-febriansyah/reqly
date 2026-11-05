export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | string;

export interface Project {
  id: string;
  name: string;
  description: string;
  activeEnvironmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

export interface MultipartField {
  id: string;
  key: string;
  value: string;
  fieldType: "text" | "file";
  fileName?: string | null;
  enabled: boolean;
}

export type BodyMode = "none" | "json" | "raw" | "urlencoded" | "formdata";

export interface RequestBody {
  mode: BodyMode;
  raw: string;
  urlencoded: KeyValueItem[];
  formdata: MultipartField[];
}

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export interface AuthConfig {
  type: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: "header" | "query";
}

export interface SavedRequest {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  body: RequestBody;
  auth: AuthConfig;
  timeoutMs: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  variables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  projectId: string;
  method: string;
  url: string;
  statusCode: number | null;
  durationMs: number;
  responseSize: number;
  timestamp: string;
  requestSnapshot: SavedRequest;
}

export interface ResponseHeader {
  key: string;
  value: string;
}

export interface HttpResponseData {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: ResponseHeader[];
  body: string;
  contentType: string;
  isImage: boolean;
  imageBase64: string | null;
  resolvedUrl: string;
  unresolvedVariables: string[];
}

export interface ProjectWorkspaceData {
  project: Project;
  folders: Folder[];
  requests: SavedRequest[];
  environments: Environment[];
  history: HistoryEntry[];
}

export type ThemeMode = "light" | "dark" | "system";

