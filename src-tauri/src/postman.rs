use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::Path;
use uuid::Uuid;

use crate::database::Database;
use crate::models::{
    AuthConfig, Environment, EnvironmentVariable, Folder, KeyValueItem, MultipartField, Project,
    RequestBody, SavedRequest,
};

const POSTMAN_SCHEMA_V2_1: &str =
    "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanCollection {
    pub info: PostmanInfo,
    #[serde(default)]
    pub item: Vec<PostmanItem>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variable: Vec<PostmanVariable>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<PostmanAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanInfo {
    #[serde(rename = "_postman_id", default = "generate_uuid")]
    pub postman_id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(default = "default_schema")]
    pub schema: String,
}

fn generate_uuid() -> String {
    Uuid::new_v4().to_string()
}

fn default_schema() -> String {
    POSTMAN_SCHEMA_V2_1.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanVariable {
    pub key: String,
    #[serde(default)]
    pub value: Value,
    #[serde(rename = "type", default = "default_string_type")]
    pub var_type: String,
    #[serde(default)]
    pub disabled: bool,
}

fn default_string_type() -> String {
    "string".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanItem {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<Vec<PostmanItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request: Option<PostmanRequest>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub response: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanRequest {
    pub method: String,
    #[serde(default)]
    pub header: Vec<PostmanKeyValue>,
    pub url: PostmanUrl,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<PostmanBody>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<PostmanAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PostmanUrl {
    Simple(String),
    Structured(PostmanUrlObject),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanUrlObject {
    #[serde(default)]
    pub raw: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub query: Vec<PostmanKeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanKeyValue {
    pub key: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub disabled: bool,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub field_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<Value>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanBody {
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub urlencoded: Option<Vec<PostmanKeyValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formdata: Option<Vec<PostmanKeyValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanAuth {
    #[serde(rename = "type")]
    pub auth_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bearer: Option<Vec<PostmanAuthAttribute>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basic: Option<Vec<PostmanAuthAttribute>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apikey: Option<Vec<PostmanAuthAttribute>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostmanAuthAttribute {
    pub key: String,
    #[serde(default)]
    pub value: Value,
    #[serde(rename = "type", default = "default_string_type")]
    pub attr_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostmanImportPreview {
    pub kind: String,
    pub name: String,
    pub description: String,
    pub folder_count: usize,
    pub request_count: usize,
    pub variable_count: usize,
    pub environment_count: usize,
    pub collection_count: usize,
    pub environment_names: Vec<String>,
    pub collection_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostmanImportResult {
    pub kind: String,
    pub project: Project,
    pub folders_imported: usize,
    pub requests_imported: usize,
    pub environments_imported: usize,
    pub variables_imported: usize,
    pub environment_id: Option<String>,
    pub message: String,
}

// ==================== EXPORT TO POSTMAN v2.1 ====================

pub fn export_project_to_postman_v21(
    project: &Project,
    folders: &[Folder],
    requests: &[SavedRequest],
    environments: &[Environment],
) -> Result<String, String> {
    let mut variables = Vec::new();
    let chosen_env = project
        .active_environment_id
        .as_ref()
        .and_then(|id| environments.iter().find(|e| &e.id == id))
        .or_else(|| environments.first());

    if let Some(env) = chosen_env {
        for v in &env.variables {
            variables.push(PostmanVariable {
                key: v.key.clone(),
                value: Value::String(v.value.clone()),
                var_type: "string".to_string(),
                disabled: !v.enabled,
            });
        }
    }

    let items = build_folder_tree(None, folders, requests);

    let collection = PostmanCollection {
        info: PostmanInfo {
            postman_id: project.id.clone(),
            name: project.name.clone(),
            description: project.description.clone(),
            schema: POSTMAN_SCHEMA_V2_1.to_string(),
        },
        item: items,
        variable: variables,
        auth: None,
    };

    serde_json::to_string_pretty(&collection)
        .map_err(|e| format!("Failed to serialize Postman Collection v2.1 JSON: {}", e))
}

fn build_folder_tree(
    parent_id: Option<&str>,
    folders: &[Folder],
    requests: &[SavedRequest],
) -> Vec<PostmanItem> {
    let mut items = Vec::new();

    let mut child_folders: Vec<&Folder> = folders
        .iter()
        .filter(|f| f.parent_id.as_deref() == parent_id)
        .collect();
    child_folders.sort_by_key(|f| f.sort_order);

    for folder in child_folders {
        let nested_items = build_folder_tree(Some(&folder.id), folders, requests);
        items.push(PostmanItem {
            name: folder.name.clone(),
            item: Some(nested_items),
            request: None,
            response: Vec::new(),
        });
    }

    let mut child_requests: Vec<&SavedRequest> = requests
        .iter()
        .filter(|r| r.folder_id.as_deref() == parent_id)
        .collect();
    child_requests.sort_by_key(|r| r.sort_order);

    for req in child_requests {
        items.push(convert_request_to_postman_item(req));
    }

    items
}

fn convert_request_to_postman_item(req: &SavedRequest) -> PostmanItem {
    let headers: Vec<PostmanKeyValue> = req
        .headers
        .iter()
        .filter(|h| !h.key.trim().is_empty())
        .map(|h| PostmanKeyValue {
            key: h.key.clone(),
            value: Some(h.value.clone()),
            description: h.description.clone(),
            disabled: !h.enabled,
            field_type: Some("text".to_string()),
            src: None,
        })
        .collect();

    let query: Vec<PostmanKeyValue> = req
        .params
        .iter()
        .filter(|p| !p.key.trim().is_empty())
        .map(|p| PostmanKeyValue {
            key: p.key.clone(),
            value: Some(p.value.clone()),
            description: p.description.clone(),
            disabled: !p.enabled,
            field_type: None,
            src: None,
        })
        .collect();

    let url_object = build_postman_url_object(&req.url, query);

    let body = match req.body.mode.as_str() {
        "json" => Some(PostmanBody {
            mode: "raw".to_string(),
            raw: Some(req.body.raw.clone()),
            urlencoded: None,
            formdata: None,
            options: Some(json!({
                "raw": {
                    "language": "json"
                }
            })),
        }),
        "raw" => Some(PostmanBody {
            mode: "raw".to_string(),
            raw: Some(req.body.raw.clone()),
            urlencoded: None,
            formdata: None,
            options: Some(json!({
                "raw": {
                    "language": "text"
                }
            })),
        }),
        "urlencoded" => Some(PostmanBody {
            mode: "urlencoded".to_string(),
            raw: None,
            urlencoded: Some(
                req.body
                    .urlencoded
                    .iter()
                    .filter(|item| !item.key.trim().is_empty())
                    .map(|item| PostmanKeyValue {
                        key: item.key.clone(),
                        value: Some(item.value.clone()),
                        description: item.description.clone(),
                        disabled: !item.enabled,
                        field_type: Some("text".to_string()),
                        src: None,
                    })
                    .collect(),
            ),
            formdata: None,
            options: None,
        }),
        "formdata" => Some(PostmanBody {
            mode: "formdata".to_string(),
            raw: None,
            urlencoded: None,
            formdata: Some(
                req.body
                    .formdata
                    .iter()
                    .filter(|f| !f.key.trim().is_empty())
                    .map(|f| {
                        if f.field_type == "file" {
                            PostmanKeyValue {
                                key: f.key.clone(),
                                value: None,
                                description: String::new(),
                                disabled: !f.enabled,
                                field_type: Some("file".to_string()),
                                src: Some(Value::String(f.value.clone())),
                            }
                        } else {
                            PostmanKeyValue {
                                key: f.key.clone(),
                                value: Some(f.value.clone()),
                                description: String::new(),
                                disabled: !f.enabled,
                                field_type: Some("text".to_string()),
                                src: None,
                            }
                        }
                    })
                    .collect(),
            ),
            options: None,
        }),
        _ => None,
    };

    let auth = match req.auth.auth_type.as_str() {
        "bearer" => Some(PostmanAuth {
            auth_type: "bearer".to_string(),
            bearer: Some(vec![PostmanAuthAttribute {
                key: "token".to_string(),
                value: Value::String(req.auth.bearer_token.clone()),
                attr_type: "string".to_string(),
            }]),
            basic: None,
            apikey: None,
        }),
        "basic" => Some(PostmanAuth {
            auth_type: "basic".to_string(),
            bearer: None,
            basic: Some(vec![
                PostmanAuthAttribute {
                    key: "username".to_string(),
                    value: Value::String(req.auth.basic_username.clone()),
                    attr_type: "string".to_string(),
                },
                PostmanAuthAttribute {
                    key: "password".to_string(),
                    value: Value::String(req.auth.basic_password.clone()),
                    attr_type: "string".to_string(),
                },
            ]),
            apikey: None,
        }),
        "apikey" => Some(PostmanAuth {
            auth_type: "apikey".to_string(),
            bearer: None,
            basic: None,
            apikey: Some(vec![
                PostmanAuthAttribute {
                    key: "key".to_string(),
                    value: Value::String(req.auth.api_key_name.clone()),
                    attr_type: "string".to_string(),
                },
                PostmanAuthAttribute {
                    key: "value".to_string(),
                    value: Value::String(req.auth.api_key_value.clone()),
                    attr_type: "string".to_string(),
                },
                PostmanAuthAttribute {
                    key: "in".to_string(),
                    value: Value::String(req.auth.api_key_in.clone()),
                    attr_type: "string".to_string(),
                },
            ]),
        }),
        _ => Some(PostmanAuth {
            auth_type: "noauth".to_string(),
            bearer: None,
            basic: None,
            apikey: None,
        }),
    };

    PostmanItem {
        name: req.name.clone(),
        item: None,
        request: Some(PostmanRequest {
            method: req.method.clone(),
            header: headers,
            url: PostmanUrl::Structured(url_object),
            body,
            auth,
        }),
        response: Vec::new(),
    }
}

fn build_postman_url_object(base_url: &str, query: Vec<PostmanKeyValue>) -> PostmanUrlObject {
    let trimmed = base_url.trim();
    let enabled_queries: Vec<String> = query
        .iter()
        .filter(|q| !q.disabled && !q.key.is_empty())
        .map(|q| {
            let val = q.value.as_deref().unwrap_or("");
            format!("{}={}", q.key, val)
        })
        .collect();

    let raw_with_query = if enabled_queries.is_empty() {
        trimmed.to_string()
    } else if trimmed.contains('?') {
        format!("{}&{}", trimmed, enabled_queries.join("&"))
    } else {
        format!("{}?{}", trimmed, enabled_queries.join("&"))
    };

    let (protocol, remainder) = if let Some(idx) = trimmed.find("://") {
        (Some(trimmed[..idx].to_string()), &trimmed[idx + 3..])
    } else {
        (None, trimmed)
    };

    let without_query = remainder.split('?').next().unwrap_or(remainder);
    let mut segments = without_query.split('/');
    let host_port_part = segments.next().unwrap_or("");

    let (host_str, port) = if !host_port_part.starts_with("{{") && host_port_part.contains(':') {
        let mut hp = host_port_part.splitn(2, ':');
        (
            hp.next().unwrap_or("").to_string(),
            hp.next().map(|s| s.to_string()),
        )
    } else {
        (host_port_part.to_string(), None)
    };

    let host_parts: Vec<Value> = if host_str.is_empty() {
        vec![]
    } else if host_str.contains("{{") {
        vec![Value::String(host_str)]
    } else {
        host_str
            .split('.')
            .map(|s| Value::String(s.to_string()))
            .collect()
    };

    let path_parts: Vec<Value> = segments
        .filter(|s| !s.is_empty())
        .map(|s| Value::String(s.to_string()))
        .collect();

    PostmanUrlObject {
        raw: raw_with_query,
        protocol,
        host: if host_parts.is_empty() {
            None
        } else {
            Some(Value::Array(host_parts))
        },
        port,
        path: if path_parts.is_empty() {
            None
        } else {
            Some(Value::Array(path_parts))
        },
        query,
    }
}

// ==================== RESILIENT IMPORT ENGINE ====================

fn parse_postman_root(json_content: &str) -> Result<Value, String> {
    let clean = json_content.trim_start_matches('\u{feff}').trim();
    if clean.is_empty() {
        return Err("File JSON kosong.".to_string());
    }
    serde_json::from_str::<Value>(clean)
        .map_err(|e| format!("Format JSON tidak valid: {}", e))
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn extract_description(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(obj)) => obj
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn is_kv_enabled(obj: &Map<String, Value>, default_enabled: bool) -> bool {
    if let Some(disabled) = obj.get("disabled").and_then(Value::as_bool) {
        return !disabled;
    }
    if let Some(enabled) = obj.get("enabled").and_then(Value::as_bool) {
        return enabled;
    }
    default_enabled
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DetectedPostmanKind {
    CollectionV21,
    CollectionV20,
    Environment,
    Globals,
    Dump,
}

impl DetectedPostmanKind {
    fn as_str(&self) -> &'static str {
        match self {
            DetectedPostmanKind::CollectionV21 => "collection_v21",
            DetectedPostmanKind::CollectionV20 => "collection_v20",
            DetectedPostmanKind::Environment => "environment",
            DetectedPostmanKind::Globals => "globals",
            DetectedPostmanKind::Dump => "dump",
        }
    }
}

fn detect_postman_kind(root: &Value) -> Result<DetectedPostmanKind, String> {
    let obj = root.as_object().ok_or_else(|| {
        "Struktur JSON tidak dikenali sebagai file Postman (root harus berupa objek JSON)."
            .to_string()
    })?;

    // Postman Data Dump (.postman_dump.json)
    if obj.get("collections").and_then(Value::as_array).is_some()
        || obj.get("environments").and_then(Value::as_array).is_some()
    {
        return Ok(DetectedPostmanKind::Dump);
    }

    // Postman Collection v2.0 / v2.1
    if obj.contains_key("info") || obj.get("item").and_then(Value::as_array).is_some() {
        let schema = obj
            .get("info")
            .and_then(Value::as_object)
            .and_then(|i| i.get("schema"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if schema.contains("v2.0") {
            return Ok(DetectedPostmanKind::CollectionV20);
        }
        return Ok(DetectedPostmanKind::CollectionV21);
    }

    // Postman Environment / Globals (.postman_environment.json / .postman_globals.json)
    if obj.get("values").and_then(Value::as_array).is_some() {
        let scope = obj
            .get("_postman_variable_scope")
            .and_then(Value::as_str)
            .unwrap_or("");
        if scope.eq_ignore_ascii_case("globals") {
            return Ok(DetectedPostmanKind::Globals);
        }
        return Ok(DetectedPostmanKind::Environment);
    }

    Err(
        "File JSON ini bukan format Postman Collection (v2.0/v2.1), Postman Environment, Globals, atau Postman Dump yang valid."
            .to_string(),
    )
}

fn count_collection_items(items: &[Value], folders: &mut usize, requests: &mut usize) {
    for item in items {
        let Some(obj) = item.as_object() else {
            continue;
        };
        if let Some(Value::Array(children)) = obj.get("item") {
            *folders += 1;
            count_collection_items(children, folders, requests);
        } else if obj.get("request").is_some() && !obj.get("request").unwrap().is_null() {
            *requests += 1;
        }
    }
}

pub fn inspect_postman_json(json_content: &str) -> Result<PostmanImportPreview, String> {
    let root = parse_postman_root(json_content)?;
    let kind = detect_postman_kind(&root)?;
    let obj = root.as_object().ok_or("Invalid JSON object")?;

    match kind {
        DetectedPostmanKind::CollectionV21 | DetectedPostmanKind::CollectionV20 => {
            let info = obj.get("info").and_then(Value::as_object);
            let name = info
                .and_then(|i| i.get("name"))
                .map(value_to_string)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Imported Collection".to_string());
            let description = extract_description(info.and_then(|i| i.get("description")));
            let items = obj
                .get("item")
                .and_then(Value::as_array)
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            let mut folder_count = 0usize;
            let mut request_count = 0usize;
            count_collection_items(items, &mut folder_count, &mut request_count);

            let variable_count = obj
                .get("variable")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter(|v| {
                            v.as_object()
                                .and_then(|m| m.get("key"))
                                .map(value_to_string)
                                .map(|k| !k.trim().is_empty())
                                .unwrap_or(false)
                        })
                        .count()
                })
                .unwrap_or(0);

            Ok(PostmanImportPreview {
                kind: kind.as_str().to_string(),
                name: name.clone(),
                description,
                folder_count,
                request_count,
                variable_count,
                environment_count: if variable_count > 0 { 1 } else { 0 },
                collection_count: 1,
                environment_names: vec![],
                collection_names: vec![name],
            })
        }
        DetectedPostmanKind::Environment | DetectedPostmanKind::Globals => {
            let default_name = if kind == DetectedPostmanKind::Globals {
                "Postman Globals"
            } else {
                "Postman Environment"
            };
            let name = obj
                .get("name")
                .map(value_to_string)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| default_name.to_string());

            let variable_count = obj
                .get("values")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter(|v| {
                            v.as_object()
                                .and_then(|m| m.get("key"))
                                .map(value_to_string)
                                .map(|k| !k.trim().is_empty())
                                .unwrap_or(false)
                        })
                        .count()
                })
                .unwrap_or(0);

            Ok(PostmanImportPreview {
                kind: kind.as_str().to_string(),
                name: name.clone(),
                description: String::new(),
                folder_count: 0,
                request_count: 0,
                variable_count,
                environment_count: 1,
                collection_count: 0,
                environment_names: vec![name],
                collection_names: vec![],
            })
        }
        DetectedPostmanKind::Dump => {
            let collections = obj
                .get("collections")
                .and_then(Value::as_array)
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            let environments = obj
                .get("environments")
                .and_then(Value::as_array)
                .map(|v| v.as_slice())
                .unwrap_or(&[]);

            let mut folder_count = 0usize;
            let mut request_count = 0usize;
            let mut variable_count = 0usize;
            let mut collection_names = Vec::new();
            let mut environment_names = Vec::new();

            for col in collections {
                if let Some(cobj) = col.as_object() {
                    let cname = cobj
                        .get("info")
                        .and_then(Value::as_object)
                        .and_then(|i| i.get("name"))
                        .or_else(|| cobj.get("name"))
                        .map(value_to_string)
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "Imported Collection".to_string());
                    collection_names.push(cname);
                    if let Some(Value::Array(items)) = cobj.get("item") {
                        count_collection_items(items, &mut folder_count, &mut request_count);
                    }
                    if let Some(Value::Array(vars)) = cobj.get("variable") {
                        variable_count += vars.len();
                    }
                }
            }

            for env in environments {
                if let Some(eobj) = env.as_object() {
                    let ename = eobj
                        .get("name")
                        .map(value_to_string)
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "Imported Environment".to_string());
                    environment_names.push(ename);
                    if let Some(Value::Array(vals)) = eobj.get("values") {
                        variable_count += vals.len();
                    }
                }
            }

            let has_globals = obj
                .get("globals")
                .map(|g| match g {
                    Value::Array(a) => !a.is_empty(),
                    Value::Object(m) => m
                        .get("values")
                        .and_then(Value::as_array)
                        .map(|a| !a.is_empty())
                        .unwrap_or(false),
                    _ => false,
                })
                .unwrap_or(false);

            if has_globals {
                environment_names.push("Postman Globals".to_string());
            }

            Ok(PostmanImportPreview {
                kind: kind.as_str().to_string(),
                name: "Postman Data Dump".to_string(),
                description: String::new(),
                folder_count,
                request_count,
                variable_count,
                environment_count: environment_names.len(),
                collection_count: collections.len(),
                environment_names,
                collection_names,
            })
        }
    }
}

pub fn import_postman_collection(db: &Database, json_content: &str) -> Result<Project, String> {
    let result = import_postman_file(db, json_content, None, None, true)?;
    Ok(result.project)
}

pub fn import_postman_file(
    db: &Database,
    json_content: &str,
    target_project_id: Option<&str>,
    name_override: Option<&str>,
    set_env_active: bool,
) -> Result<PostmanImportResult, String> {
    let root = parse_postman_root(json_content)?;
    let kind = detect_postman_kind(&root)?;

    match kind {
        DetectedPostmanKind::CollectionV21 | DetectedPostmanKind::CollectionV20 => {
            import_collection_value(
                db,
                &root,
                kind,
                target_project_id,
                name_override,
                set_env_active,
            )
        }
        DetectedPostmanKind::Environment | DetectedPostmanKind::Globals => {
            import_environment_value(db, &root, kind, target_project_id, name_override, set_env_active)
        }
        DetectedPostmanKind::Dump => {
            import_dump_value(db, &root, target_project_id, set_env_active)
        }
    }
}

fn import_collection_value(
    db: &Database,
    col_val: &Value,
    kind: DetectedPostmanKind,
    target_project_id: Option<&str>,
    name_override: Option<&str>,
    set_env_active: bool,
) -> Result<PostmanImportResult, String> {
    let obj = col_val
        .as_object()
        .ok_or("Invalid Postman collection object")?;
    let info = obj.get("info").and_then(Value::as_object);

    let raw_name = info
        .and_then(|i| i.get("name"))
        .or_else(|| obj.get("name"))
        .map(value_to_string)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Imported Collection".to_string());

    let chosen_name = name_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| raw_name.clone());

    let description = extract_description(info.and_then(|i| i.get("description")));
    let now = Utc::now().to_rfc3339();

    let (project, merging_existing) = match target_project_id {
        Some(pid) => (db.get_project(pid)?, true),
        None => (db.create_project(&chosen_name, &description)?, false),
    };

    let imported_vars = extract_variables_from_array(obj.get("variable").and_then(Value::as_array), false);
    let variables_imported = imported_vars.len();
    let mut environments_imported = 0usize;
    let mut imported_env_id: Option<String> = None;

    if !imported_vars.is_empty() {
        if merging_existing {
            let env = Environment {
                id: Uuid::new_v4().to_string(),
                project_id: project.id.clone(),
                name: format!("{} Env", chosen_name),
                variables: imported_vars,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            let saved_env = db.save_environment(&env)?;
            imported_env_id = Some(saved_env.id.clone());
            environments_imported = 1;
            if set_env_active {
                db.update_project(
                    &project.id,
                    &project.name,
                    &project.description,
                    Some(saved_env.id),
                )?;
            }
        } else {
            let envs = db.list_environments(&project.id)?;
            if let Some(first_env) = envs.first() {
                let updated_env = Environment {
                    id: first_env.id.clone(),
                    project_id: project.id.clone(),
                    name: "Collection Environment".to_string(),
                    variables: imported_vars,
                    created_at: first_env.created_at.clone(),
                    updated_at: now.clone(),
                };
                let saved_env = db.save_environment(&updated_env)?;
                imported_env_id = Some(saved_env.id);
                environments_imported = 1;
            }
        }
    }

    let collection_auth = extract_postman_auth(obj.get("auth")).unwrap_or_default();
    let items = obj
        .get("item")
        .and_then(Value::as_array)
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let existing_max_order = if merging_existing {
        db.list_requests(&project.id)?
            .iter()
            .map(|r| r.sort_order)
            .max()
            .unwrap_or(-1)
            + 1
    } else {
        0
    };

    let mut sort_counter = existing_max_order;
    let mut folders_imported = 0usize;
    let mut requests_imported = 0usize;

    import_items_recursive(
        db,
        &project.id,
        None,
        items,
        &collection_auth,
        &mut sort_counter,
        &mut folders_imported,
        &mut requests_imported,
    )?;

    let final_project = db.get_project(&project.id)?;
    let message = if merging_existing {
        format!(
            "Imported {} requests & {} folders into \"{}\"",
            requests_imported, folders_imported, final_project.name
        )
    } else {
        format!(
            "Imported collection \"{}\" ({} requests, {} folders)",
            final_project.name, requests_imported, folders_imported
        )
    };

    Ok(PostmanImportResult {
        kind: kind.as_str().to_string(),
        project: final_project,
        folders_imported,
        requests_imported,
        environments_imported,
        variables_imported,
        environment_id: imported_env_id,
        message,
    })
}

fn import_environment_value(
    db: &Database,
    env_val: &Value,
    kind: DetectedPostmanKind,
    target_project_id: Option<&str>,
    name_override: Option<&str>,
    set_env_active: bool,
) -> Result<PostmanImportResult, String> {
    let obj = env_val
        .as_object()
        .ok_or("Invalid Postman environment JSON object")?;

    let default_name = if kind == DetectedPostmanKind::Globals {
        "Postman Globals"
    } else {
        "Imported Environment"
    };

    let raw_name = obj
        .get("name")
        .map(value_to_string)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_name.to_string());

    let chosen_name = name_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(raw_name);

    let project = match target_project_id {
        Some(pid) => db.get_project(pid)?,
        None => {
            let projects = db.list_projects()?;
            if let Some(first) = projects.into_iter().next() {
                first
            } else {
                db.create_project("Imported Workspace", "")?
            }
        }
    };

    let variables = extract_variables_from_array(obj.get("values").and_then(Value::as_array), true);
    let variables_imported = variables.len();
    let now = Utc::now().to_rfc3339();

    let new_env = Environment {
        id: Uuid::new_v4().to_string(),
        project_id: project.id.clone(),
        name: chosen_name.clone(),
        variables,
        created_at: now.clone(),
        updated_at: now,
    };

    let saved_env = db.save_environment(&new_env)?;
    if set_env_active {
        db.update_project(
            &project.id,
            &project.name,
            &project.description,
            Some(saved_env.id.clone()),
        )?;
    }

    let final_project = db.get_project(&project.id)?;
    Ok(PostmanImportResult {
        kind: kind.as_str().to_string(),
        project: final_project,
        folders_imported: 0,
        requests_imported: 0,
        environments_imported: 1,
        variables_imported,
        environment_id: Some(saved_env.id),
        message: format!(
            "Imported environment \"{}\" ({} variables)",
            saved_env.name, variables_imported
        ),
    })
}

fn import_dump_value(
    db: &Database,
    dump_val: &Value,
    target_project_id: Option<&str>,
    set_env_active: bool,
) -> Result<PostmanImportResult, String> {
    let obj = dump_val
        .as_object()
        .ok_or("Invalid Postman data dump object")?;

    let collections = obj
        .get("collections")
        .and_then(Value::as_array)
        .map(|v| v.as_slice())
        .unwrap_or(&[]);
    let environments = obj
        .get("environments")
        .and_then(Value::as_array)
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let mut folders_imported = 0usize;
    let mut requests_imported = 0usize;
    let mut environments_imported = 0usize;
    let mut variables_imported = 0usize;
    let mut primary_project: Option<Project> = None;
    let mut last_env_id: Option<String> = None;

    for col in collections {
        if col.is_object() {
            let res = import_collection_value(
                db,
                col,
                DetectedPostmanKind::CollectionV21,
                None,
                None,
                true,
            )?;
            folders_imported += res.folders_imported;
            requests_imported += res.requests_imported;
            environments_imported += res.environments_imported;
            variables_imported += res.variables_imported;
            if primary_project.is_none() {
                primary_project = Some(res.project);
            }
        }
    }

    let mut env_target_project_id: Option<String> = primary_project
        .as_ref()
        .map(|p| p.id.clone())
        .or_else(|| target_project_id.map(str::to_string));

    for (idx, env) in environments.iter().enumerate() {
        if env.is_object() {
            let res = import_environment_value(
                db,
                env,
                DetectedPostmanKind::Environment,
                env_target_project_id.as_deref(),
                None,
                set_env_active && idx == 0,
            )?;
            environments_imported += 1;
            variables_imported += res.variables_imported;
            last_env_id = res.environment_id;
            if primary_project.is_none() {
                env_target_project_id = Some(res.project.id.clone());
                primary_project = Some(res.project);
            }
        }
    }

    if let Some(globals_val) = obj.get("globals") {
        let globals_array = match globals_val {
            Value::Array(arr) => Some(arr),
            Value::Object(m) => m.get("values").and_then(Value::as_array),
            _ => None,
        };
        if let Some(arr) = globals_array {
            if !arr.is_empty() {
                let synthetic = json!({
                    "name": "Postman Globals",
                    "values": arr
                });
                let res = import_environment_value(
                    db,
                    &synthetic,
                    DetectedPostmanKind::Globals,
                    env_target_project_id.as_deref(),
                    None,
                    false,
                )?;
                environments_imported += 1;
                variables_imported += res.variables_imported;
                if last_env_id.is_none() {
                    last_env_id = res.environment_id;
                }
                if primary_project.is_none() {
                    primary_project = Some(res.project);
                }
            }
        }
    }

    let final_project = match primary_project {
        Some(p) => db.get_project(&p.id)?,
        None => match target_project_id {
            Some(pid) => db.get_project(pid)?,
            None => {
                let projects = db.list_projects()?;
                projects
                    .into_iter()
                    .next()
                    .ok_or("No projects available in workspace")?
            }
        },
    };

    Ok(PostmanImportResult {
        kind: DetectedPostmanKind::Dump.as_str().to_string(),
        project: final_project,
        folders_imported,
        requests_imported,
        environments_imported,
        variables_imported,
        environment_id: last_env_id,
        message: format!(
            "Imported dump: {} collections, {} requests, {} environments",
            collections.len(),
            requests_imported,
            environments_imported
        ),
    })
}

fn extract_variables_from_array(
    arr_opt: Option<&Vec<Value>>,
    default_enabled: bool,
) -> Vec<EnvironmentVariable> {
    let Some(arr) = arr_opt else {
        return Vec::new();
    };
    let mut vars = Vec::new();
    for item in arr {
        let Some(obj) = item.as_object() else {
            continue;
        };
        let key = obj
            .get("key")
            .map(value_to_string)
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        if key.is_empty() {
            continue;
        }
        let val = obj
            .get("value")
            .map(value_to_string)
            .unwrap_or_default();
        let enabled = is_kv_enabled(obj, default_enabled);
        vars.push(EnvironmentVariable {
            id: Uuid::new_v4().to_string(),
            key,
            value: val,
            enabled,
        });
    }
    vars
}

fn import_items_recursive(
    db: &Database,
    project_id: &str,
    parent_folder_id: Option<String>,
    items: &[Value],
    inherited_auth: &AuthConfig,
    sort_counter: &mut i64,
    folders_imported: &mut usize,
    requests_imported: &mut usize,
) -> Result<(), String> {
    for item in items {
        let Some(obj) = item.as_object() else {
            continue;
        };
        let name = obj
            .get("name")
            .map(value_to_string)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Untitled".to_string());

        if let Some(Value::Array(children)) = obj.get("item") {
            let folder = db.create_folder(project_id, parent_folder_id.clone(), &name)?;
            *folders_imported += 1;
            let folder_auth = extract_postman_auth(obj.get("auth"))
                .unwrap_or_else(|| inherited_auth.clone());
            import_items_recursive(
                db,
                project_id,
                Some(folder.id),
                children,
                &folder_auth,
                sort_counter,
                folders_imported,
                requests_imported,
            )?;
        } else if let Some(req_val) = obj.get("request") {
            if req_val.is_null() {
                continue;
            }
            let saved = convert_postman_request_value(
                project_id,
                parent_folder_id.clone(),
                &name,
                req_val,
                inherited_auth,
                *sort_counter,
            );
            *sort_counter += 1;
            *requests_imported += 1;
            db.save_request(&saved)?;
        }
    }
    Ok(())
}

fn convert_postman_request_value(
    project_id: &str,
    folder_id: Option<String>,
    name: &str,
    req_val: &Value,
    inherited_auth: &AuthConfig,
    sort_order: i64,
) -> SavedRequest {
    let now = Utc::now().to_rfc3339();

    if let Some(url_str) = req_val.as_str() {
        let (base_url, params) = split_raw_url_and_query(url_str);
        return SavedRequest {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            folder_id,
            name: name.to_string(),
            method: "GET".to_string(),
            url: base_url,
            params,
            headers: Vec::new(),
            body: RequestBody::default(),
            auth: inherited_auth.clone(),
            timeout_ms: 30000,
            ssl_verify: false,
            sort_order,
            created_at: now.clone(),
            updated_at: now,
        };
    }

    let empty_map = Map::new();
    let req_obj = req_val.as_object().unwrap_or(&empty_map);

    let method = req_obj
        .get("method")
        .map(value_to_string)
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "GET".to_string());

    let (base_url, params) = extract_url_and_params_value(req_obj.get("url"));

    let headers: Vec<KeyValueItem> = req_obj
        .get("header")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|h| h.as_object())
                .filter_map(|h| {
                    let key = h
                        .get("key")
                        .map(value_to_string)
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default();
                    if key.is_empty() {
                        return None;
                    }
                    Some(KeyValueItem {
                        id: Uuid::new_v4().to_string(),
                        key,
                        value: h.get("value").map(value_to_string).unwrap_or_default(),
                        description: extract_description(h.get("description")),
                        enabled: is_kv_enabled(h, true),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let body = convert_postman_body_value(req_obj.get("body"), &headers);

    let auth = extract_postman_auth(req_obj.get("auth"))
        .unwrap_or_else(|| inherited_auth.clone());

    SavedRequest {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.to_string(),
        folder_id,
        name: if name.trim().is_empty() {
            "Untitled Request".to_string()
        } else {
            name.trim().to_string()
        },
        method,
        url: base_url,
        params,
        headers,
        body,
        auth,
        timeout_ms: 30000,
        ssl_verify: false,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    }
}

fn extract_url_and_params_value(url_opt: Option<&Value>) -> (String, Vec<KeyValueItem>) {
    let Some(url_val) = url_opt else {
        return (String::new(), Vec::new());
    };
    if url_val.is_null() {
        return (String::new(), Vec::new());
    }
    if let Some(raw) = url_val.as_str() {
        return split_raw_url_and_query(raw);
    }
    let Some(obj) = url_val.as_object() else {
        return (String::new(), Vec::new());
    };

    let mut params: Vec<KeyValueItem> = obj
        .get("query")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|q| q.as_object())
                .filter_map(|q| {
                    let key = q
                        .get("key")
                        .map(value_to_string)
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default();
                    if key.is_empty() {
                        return None;
                    }
                    Some(KeyValueItem {
                        id: Uuid::new_v4().to_string(),
                        key,
                        value: q.get("value").map(value_to_string).unwrap_or_default(),
                        description: extract_description(q.get("description")),
                        enabled: is_kv_enabled(q, true),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let raw_str = obj
        .get("raw")
        .map(value_to_string)
        .unwrap_or_default();

    if !raw_str.trim().is_empty() {
        let (clean_base, raw_params) = split_raw_url_and_query(&raw_str);
        if params.is_empty() {
            params = raw_params;
        }
        return (clean_base, params);
    }

    let mut built = String::new();
    if let Some(proto) = obj
        .get("protocol")
        .map(value_to_string)
        .filter(|s| !s.is_empty())
    {
        built.push_str(&proto);
        built.push_str("://");
    }

    if let Some(host_val) = obj.get("host") {
        match host_val {
            Value::String(s) => built.push_str(s),
            Value::Array(arr) => {
                let parts: Vec<String> = arr
                    .iter()
                    .filter_map(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        Value::Object(m) => m.get("value").and_then(Value::as_str).map(|s| s.to_string()),
                        _ => None,
                    })
                    .collect();
                built.push_str(&parts.join("."));
            }
            _ => {}
        }
    }

    if let Some(port_val) = obj.get("port") {
        let port_str = value_to_string(port_val);
        if !port_str.trim().is_empty() {
            built.push(':');
            built.push_str(port_str.trim());
        }
    }

    if let Some(path_val) = obj.get("path") {
        match path_val {
            Value::String(s) if !s.is_empty() => {
                if !s.starts_with('/') {
                    built.push('/');
                }
                built.push_str(s);
            }
            Value::Array(arr) => {
                let parts: Vec<String> = arr
                    .iter()
                    .filter_map(|v| match v {
                        Value::String(s) if !s.is_empty() => Some(s.clone()),
                        Value::Object(m) => m
                            .get("value")
                            .map(value_to_string)
                            .filter(|s| !s.is_empty()),
                        _ => None,
                    })
                    .collect();
                if !parts.is_empty() {
                    built.push('/');
                    built.push_str(&parts.join("/"));
                }
            }
            _ => {}
        }
    }

    (built, params)
}

fn split_raw_url_and_query(raw: &str) -> (String, Vec<KeyValueItem>) {
    let trimmed = raw.trim();
    let Some(q_idx) = trimmed.find('?') else {
        return (trimmed.to_string(), Vec::new());
    };
    let base = trimmed[..q_idx].to_string();
    let query_str = &trimmed[q_idx + 1..];
    // Strip optional URL hash fragment from query if present
    let query_part = query_str.split('#').next().unwrap_or(query_str);
    let mut params = Vec::new();
    for pair in query_part.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut kv = pair.splitn(2, '=');
        let key = kv.next().unwrap_or("").to_string();
        let value = kv.next().unwrap_or("").to_string();
        if !key.is_empty() {
            params.push(KeyValueItem {
                id: Uuid::new_v4().to_string(),
                key,
                value,
                description: String::new(),
                enabled: true,
            });
        }
    }
    (base, params)
}

fn convert_postman_body_value(body_opt: Option<&Value>, headers: &[KeyValueItem]) -> RequestBody {
    let Some(body_val) = body_opt else {
        return RequestBody::default();
    };
    let Some(obj) = body_val.as_object() else {
        return RequestBody::default();
    };

    let mode = obj
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();

    match mode.as_str() {
        "raw" => {
            let raw_text = obj.get("raw").map(value_to_string).unwrap_or_default();
            let lang_is_json = obj
                .get("options")
                .and_then(|o| o.get("raw"))
                .and_then(|r| r.get("language"))
                .and_then(Value::as_str)
                .map(|l| l.eq_ignore_ascii_case("json"))
                .unwrap_or(false);

            let header_is_json = headers.iter().any(|h| {
                h.key.eq_ignore_ascii_case("content-type")
                    && h.value.to_lowercase().contains("json")
            });

            let looks_like_json = {
                let t = raw_text.trim();
                (t.starts_with('{') && t.ends_with('}'))
                    || (t.starts_with('[') && t.ends_with(']'))
            };

            let target_mode = if lang_is_json || header_is_json || looks_like_json {
                "json"
            } else {
                "raw"
            };

            RequestBody {
                mode: target_mode.to_string(),
                raw: raw_text,
                urlencoded: Vec::new(),
                formdata: Vec::new(),
            }
        }
        "graphql" => {
            let gql = obj.get("graphql").and_then(Value::as_object);
            let query = gql
                .and_then(|g| g.get("query"))
                .map(value_to_string)
                .unwrap_or_default();
            let vars_val = gql.and_then(|g| g.get("variables")).map(|v| match v {
                Value::String(s) if !s.trim().is_empty() => {
                    serde_json::from_str::<Value>(s).unwrap_or_else(|_| Value::String(s.clone()))
                }
                Value::String(_) | Value::Null => json!({}),
                other => other.clone(),
            });
            let payload = match vars_val {
                Some(vars) => json!({ "query": query, "variables": vars }),
                None => json!({ "query": query }),
            };
            RequestBody {
                mode: "json".to_string(),
                raw: serde_json::to_string_pretty(&payload).unwrap_or_default(),
                urlencoded: Vec::new(),
                formdata: Vec::new(),
            }
        }
        "urlencoded" => {
            let items = obj
                .get("urlencoded")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .filter_map(|kv| kv.as_object())
                        .map(|kv| KeyValueItem {
                            id: Uuid::new_v4().to_string(),
                            key: kv.get("key").map(value_to_string).unwrap_or_default(),
                            value: kv.get("value").map(value_to_string).unwrap_or_default(),
                            description: extract_description(kv.get("description")),
                            enabled: is_kv_enabled(kv, true),
                        })
                        .collect()
                })
                .unwrap_or_default();

            RequestBody {
                mode: "urlencoded".to_string(),
                raw: String::new(),
                urlencoded: items,
                formdata: Vec::new(),
            }
        }
        "formdata" => {
            let fields = obj
                .get("formdata")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .filter_map(|kv| kv.as_object())
                        .map(|kv| {
                            let ftype = kv
                                .get("type")
                                .and_then(Value::as_str)
                                .map(|s| if s == "file" { "file" } else { "text" })
                                .unwrap_or("text")
                                .to_string();

                            let (val, file_name) = if ftype == "file" {
                                let src_path = match kv.get("src") {
                                    Some(Value::String(s)) => s.clone(),
                                    Some(Value::Array(arr)) => arr
                                        .first()
                                        .map(value_to_string)
                                        .unwrap_or_default(),
                                    _ => kv.get("value").map(value_to_string).unwrap_or_default(),
                                };
                                let fname = if !src_path.trim().is_empty() {
                                    Path::new(&src_path)
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                } else {
                                    None
                                };
                                (src_path, fname)
                            } else {
                                (
                                    kv.get("value").map(value_to_string).unwrap_or_default(),
                                    None,
                                )
                            };

                            MultipartField {
                                id: Uuid::new_v4().to_string(),
                                key: kv.get("key").map(value_to_string).unwrap_or_default(),
                                value: val,
                                field_type: ftype,
                                file_name,
                                enabled: is_kv_enabled(kv, true),
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();

            RequestBody {
                mode: "formdata".to_string(),
                raw: String::new(),
                urlencoded: Vec::new(),
                formdata: fields,
            }
        }
        _ => RequestBody::default(),
    }
}

fn extract_postman_auth(auth_opt: Option<&Value>) -> Option<AuthConfig> {
    let auth_val = auth_opt?;
    if auth_val.is_null() {
        return None;
    }
    let obj = auth_val.as_object()?;
    let auth_type = obj
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();

    let find_auth_attr = |block_name: &str, target_key: &str| -> String {
        match obj.get(block_name) {
            // Postman v2.1 array: [{ "key": "token", "value": "..." }]
            Some(Value::Array(list)) => list
                .iter()
                .filter_map(|item| item.as_object())
                .find(|m| m.get("key").and_then(Value::as_str) == Some(target_key))
                .and_then(|m| m.get("value"))
                .map(value_to_string)
                .unwrap_or_default(),
            // Postman v2.0 object: { "token": "..." }
            Some(Value::Object(map)) => map
                .get(target_key)
                .map(value_to_string)
                .unwrap_or_default(),
            _ => String::new(),
        }
    };

    match auth_type.as_str() {
        "bearer" => Some(AuthConfig {
            auth_type: "bearer".to_string(),
            bearer_token: find_auth_attr("bearer", "token"),
            ..Default::default()
        }),
        "basic" => Some(AuthConfig {
            auth_type: "basic".to_string(),
            basic_username: find_auth_attr("basic", "username"),
            basic_password: find_auth_attr("basic", "password"),
            ..Default::default()
        }),
        "apikey" => {
            let in_where = find_auth_attr("apikey", "in");
            Some(AuthConfig {
                auth_type: "apikey".to_string(),
                api_key_name: find_auth_attr("apikey", "key"),
                api_key_value: find_auth_attr("apikey", "value"),
                api_key_in: if in_where == "query" {
                    "query".to_string()
                } else {
                    "header".to_string()
                },
                ..Default::default()
            })
        }
        "noauth" => Some(AuthConfig::default()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_postman_v21_roundtrip() {
        let db = Database::new_in_memory().expect("in memory db");
        let projects = db.list_projects().expect("projects");
        let first = &projects[0];
        let ws = db.load_project_workspace(&first.id).expect("workspace");

        let exported_json = export_project_to_postman_v21(
            &ws.project,
            &ws.folders,
            &ws.requests,
            &ws.environments,
        )
        .expect("export should succeed");

        assert!(exported_json.contains("https://schema.getpostman.com/json/collection/v2.1.0/collection.json"));
        assert!(exported_json.contains("Get User Profile"));
        assert!(exported_json.contains("{{BASE_URL}}"));

        let imported = import_postman_collection(&db, &exported_json).expect("import should succeed");
        let imported_ws = db.load_project_workspace(&imported.id).expect("imported workspace");

        assert_eq!(imported_ws.project.name, ws.project.name);
        assert_eq!(imported_ws.folders.len(), ws.folders.len());
        assert_eq!(imported_ws.requests.len(), ws.requests.len());
        assert!(!imported_ws.environments[0].variables.is_empty());
    }

    #[test]
    fn test_postman_quirky_v20_and_v21_import() {
        let db = Database::new_in_memory().expect("in memory db");
        let raw_json = r#"
        {
          "info": {
            "name": "Quirky Service API",
            "description": { "content": "Markdown description", "type": "text/markdown" },
            "schema": "https://schema.getpostman.com/json/collection/v2.0.0/collection.json"
          },
          "auth": {
            "type": "bearer",
            "bearer": { "token": "{{GLOBAL_TOKEN}}" }
          },
          "item": [
            {
              "name": "Auth Folder",
              "auth": {
                "type": "basic",
                "basic": [{ "key": "username", "value": "admin" }, { "key": "password", "value": "secret" }]
              },
              "item": [
                {
                  "name": "Nested Folder",
                  "item": [
                    {
                      "name": "Login GQL",
                      "request": {
                        "method": "post",
                        "header": [
                          { "key": "X-Debug", "value": "1", "description": null, "disabled": null }
                        ],
                        "url": {
                          "protocol": "https",
                          "host": ["api", "example", "com"],
                          "port": 8443,
                          "path": ["v1", "graphql"],
                          "query": null
                        },
                        "body": {
                          "mode": "graphql",
                          "graphql": {
                            "query": "query { me { id } }",
                            "variables": "{\"id\": 1}"
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            },
            {
              "name": "Empty Body Ping",
              "request": {
                "method": "GET",
                "url": "https://httpbin.org/get?foo=bar",
                "body": {}
              }
            }
          ],
          "variable": [
            { "key": "GLOBAL_TOKEN", "value": 12345, "disabled": false }
          ]
        }"#;

        let preview = inspect_postman_json(raw_json).expect("preview should work");
        assert_eq!(preview.kind, "collection_v20");
        assert_eq!(preview.folder_count, 2);
        assert_eq!(preview.request_count, 2);
        assert_eq!(preview.variable_count, 1);

        let result = import_postman_file(&db, raw_json, None, None, true).expect("import should succeed");
        assert_eq!(result.folders_imported, 2);
        assert_eq!(result.requests_imported, 2);

        let ws = db.load_project_workspace(&result.project.id).expect("ws");
        let gql_req = ws.requests.iter().find(|r| r.name == "Login GQL").expect("gql req");
        assert_eq!(gql_req.method, "POST");
        assert_eq!(gql_req.url, "https://api.example.com:8443/v1/graphql");
        assert_eq!(gql_req.auth.auth_type, "basic");
        assert_eq!(gql_req.auth.basic_username, "admin");
        assert_eq!(gql_req.body.mode, "json");
        assert!(gql_req.body.raw.contains("query { me { id } }"));
    }

    #[test]
    fn test_postman_environment_and_merge_import() {
        let db = Database::new_in_memory().expect("in memory db");
        let existing_project = db.list_projects().expect("projects")[0].clone();

        let env_json = r#"{
          "id": "env-123",
          "name": "Staging Environment",
          "values": [
            { "key": "BASE_URL", "value": "https://staging.api.local", "enabled": true },
            { "key": "DISABLED_VAR", "value": "skip", "enabled": false }
          ],
          "_postman_variable_scope": "environment"
        }"#;

        let preview = inspect_postman_json(env_json).expect("env preview");
        assert_eq!(preview.kind, "environment");
        assert_eq!(preview.variable_count, 2);

        let result = import_postman_file(
            &db,
            env_json,
            Some(&existing_project.id),
            None,
            true,
        )
        .expect("env import");

        assert_eq!(result.environments_imported, 1);
        assert_eq!(result.variables_imported, 2);
        let ws = db.load_project_workspace(&existing_project.id).expect("ws");
        let imported_env = ws
            .environments
            .iter()
            .find(|e| e.name == "Staging Environment")
            .expect("env saved");
        assert_eq!(imported_env.variables.len(), 2);
        assert!(!imported_env.variables[1].enabled);
        assert_eq!(ws.project.active_environment_id, Some(imported_env.id.clone()));
    }

    #[test]
    fn test_postman_dump_and_recursive_folder_delete() {
        let db = Database::new_in_memory().expect("in memory db");
        let dump_json = r#"{
          "version": 1,
          "collections": [
            {
              "info": { "name": "Dump Service" },
              "item": [
                {
                  "name": "Parent",
                  "item": [
                    {
                      "name": "Child",
                      "item": [
                        { "name": "Nested Endpoint", "request": "https://example.com/nested" }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          "environments": [
            {
              "name": "Dump QA Env",
              "values": [{ "key": "HOST", "value": "qa.local", "enabled": true }]
            }
          ],
          "globals": [
            { "key": "GLOBAL_KEY", "value": "g1", "enabled": true }
          ]
        }"#;

        let preview = inspect_postman_json(dump_json).expect("dump preview");
        assert_eq!(preview.kind, "dump");
        assert_eq!(preview.collection_count, 1);
        assert_eq!(preview.folder_count, 2);
        assert_eq!(preview.request_count, 1);

        let res = import_postman_file(&db, dump_json, None, None, true).expect("dump import");
        assert_eq!(res.folders_imported, 2);
        assert_eq!(res.requests_imported, 1);
        assert_eq!(res.environments_imported, 2);

        let ws = db.load_project_workspace(&res.project.id).expect("ws");
        let parent_folder = ws.folders.iter().find(|f| f.name == "Parent").expect("parent");
        db.delete_folder(&parent_folder.id).expect("recursive delete");

        let ws_after = db.load_project_workspace(&res.project.id).expect("ws after");
        assert_eq!(ws_after.folders.len(), 0);
        assert_eq!(ws_after.requests.len(), 0);
    }
}
