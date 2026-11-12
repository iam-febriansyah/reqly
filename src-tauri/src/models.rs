use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub active_environment_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub id: String,
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartField {
    pub id: String,
    pub key: String,
    pub value: String,
    #[serde(default = "default_field_type")]
    pub field_type: String, // "text" | "file"
    #[serde(default)]
    pub file_name: Option<String>,
    pub enabled: bool,
}

fn default_field_type() -> String {
    "text".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBody {
    /// "none" | "json" | "raw" | "urlencoded" | "formdata"
    pub mode: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default)]
    pub urlencoded: Vec<KeyValueItem>,
    #[serde(default)]
    pub formdata: Vec<MultipartField>,
}

impl Default for RequestBody {
    fn default() -> Self {
        Self {
            mode: "none".to_string(),
            raw: String::new(),
            urlencoded: Vec::new(),
            formdata: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    /// "none" | "bearer" | "basic" | "apikey"
    #[serde(rename = "type")]
    pub auth_type: String,
    #[serde(default)]
    pub bearer_token: String,
    #[serde(default)]
    pub basic_username: String,
    #[serde(default)]
    pub basic_password: String,
    #[serde(default)]
    pub api_key_name: String,
    #[serde(default)]
    pub api_key_value: String,
    /// "header" | "query"
    #[serde(default = "default_api_key_in")]
    pub api_key_in: String,
}

fn default_api_key_in() -> String {
    "header".to_string()
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            auth_type: "none".to_string(),
            bearer_token: String::new(),
            basic_username: String::new(),
            basic_password: String::new(),
            api_key_name: String::new(),
            api_key_value: String::new(),
            api_key_in: "header".to_string(),
        }
    }
}

fn default_ssl_verify() -> bool {
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    pub id: String,
    pub project_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub params: Vec<KeyValueItem>,
    pub headers: Vec<KeyValueItem>,
    pub body: RequestBody,
    pub auth: AuthConfig,
    pub timeout_ms: u64,
    #[serde(default = "default_ssl_verify")]
    pub ssl_verify: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVariable {
    pub id: String,
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub variables: Vec<EnvironmentVariable>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub project_id: String,
    pub method: String,
    pub url: String,
    pub status_code: Option<u16>,
    pub duration_ms: u64,
    pub response_size: usize,
    pub timestamp: String,
    pub request_snapshot: SavedRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseData {
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    pub content_type: String,
    pub is_image: bool,
    pub image_base64: Option<String>,
    pub resolved_url: String,
    pub unresolved_variables: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteRequestPayload {
    pub request_id: String,
    pub project_id: String,
    pub request: SavedRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceData {
    pub project: Project,
    pub folders: Vec<Folder>,
    pub requests: Vec<SavedRequest>,
    pub environments: Vec<Environment>,
    pub history: Vec<HistoryEntry>,
}

