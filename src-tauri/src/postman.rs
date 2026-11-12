use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
    #[serde(rename = "_postman_id", default = " generate_uuid")]
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

// ==================== EXPORT TO POSTMAN v2.1 ====================

pub fn export_project_to_postman_v21(
    project: &Project,
    folders: &[Folder],
    requests: &[SavedRequest],
    environments: &[Environment],
) -> Result<String, String> {
    // Gather variables from active environment (or first environment)
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

    // Child folders
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

    // Requests in this folder level
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

// ==================== IMPORT FROM POSTMAN v2.1 ====================

pub fn import_postman_collection(db: &Database, json_content: &str) -> Result<Project, String> {
    let collection: PostmanCollection = serde_json::from_str(json_content).map_err(|e| {
        format!(
            "Invalid Postman Collection v2.1 JSON format: {}",
            e
        )
    })?;

    let now = Utc::now().to_rfc3339();
    let project_name = if collection.info.name.trim().is_empty() {
        "Imported Collection".to_string()
    } else {
        collection.info.name.trim().to_string()
    };

    let project = db.create_project(&project_name, &collection.info.description)?;

    // Import collection variables into the project's active environment
    if !collection.variable.is_empty() {
        let envs = db.list_environments(&project.id)?;
        if let Some(first_env) = envs.first() {
            let mut imported_vars: Vec<EnvironmentVariable> = Vec::new();
            for v in &collection.variable {
                if v.key.trim().is_empty() {
                    continue;
                }
                let val_str = match &v.value {
                    Value::String(s) => s.clone(),
                    Value::Null => String::new(),
                    other => other.to_string(),
                };
                imported_vars.push(EnvironmentVariable {
                    id: Uuid::new_v4().to_string(),
                    key: v.key.trim().to_string(),
                    value: val_str,
                    enabled: !v.disabled,
                });
            }
            let updated_env = Environment {
                id: first_env.id.clone(),
                project_id: project.id.clone(),
                name: "Collection Environment".to_string(),
                variables: imported_vars,
                created_at: first_env.created_at.clone(),
                updated_at: now.clone(),
            };
            db.save_environment(&updated_env)?;
        }
    }

    let collection_auth = collection
        .auth
        .as_ref()
        .map(convert_postman_auth)
        .unwrap_or_default();

    let mut sort_counter: i64 = 0;
    import_items_recursive(
        db,
        &project.id,
        None,
        &collection.item,
        &collection_auth,
        &mut sort_counter,
    )?;

    db.get_project(&project.id)
}

fn import_items_recursive(
    db: &Database,
    project_id: &str,
    parent_folder_id: Option<String>,
    items: &[PostmanItem],
    inherited_auth: &AuthConfig,
    sort_counter: &mut i64,
) -> Result<(), String> {
    for item in items {
        if let Some(children) = &item.item {
            // Folder node
            let folder = db.create_folder(project_id, parent_folder_id.clone(), &item.name)?;
            import_items_recursive(
                db,
                project_id,
                Some(folder.id),
                children,
                inherited_auth,
                sort_counter,
            )?;
        } else if let Some(pm_req) = &item.request {
            let saved = convert_postman_request(
                project_id,
                parent_folder_id.clone(),
                &item.name,
                pm_req,
                inherited_auth,
                *sort_counter,
            );
            *sort_counter += 1;
            db.save_request(&saved)?;
        }
    }
    Ok(())
}

fn convert_postman_request(
    project_id: &str,
    folder_id: Option<String>,
    name: &str,
    pm_req: &PostmanRequest,
    inherited_auth: &AuthConfig,
    sort_order: i64,
) -> SavedRequest {
    let now = Utc::now().to_rfc3339();
    let (base_url, params) = extract_url_and_params(&pm_req.url);

    let headers: Vec<KeyValueItem> = pm_req
        .header
        .iter()
        .filter(|h| !h.key.trim().is_empty())
        .map(|h| KeyValueItem {
            id: Uuid::new_v4().to_string(),
            key: h.key.trim().to_string(),
            value: h.value.clone().unwrap_or_default(),
            description: h.description.clone(),
            enabled: !h.disabled,
        })
        .collect();

    let body = pm_req
        .body
        .as_ref()
        .map(|b| convert_postman_body(b, &headers))
        .unwrap_or_default();

    let auth = pm_req
        .auth
        .as_ref()
        .map(convert_postman_auth)
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
        method: pm_req.method.trim().to_uppercase(),
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

fn extract_url_and_params(pm_url: &PostmanUrl) -> (String, Vec<KeyValueItem>) {
    match pm_url {
        PostmanUrl::Simple(raw) => split_raw_url_and_query(raw),
        PostmanUrl::Structured(obj) => {
            let mut params: Vec<KeyValueItem> = obj
                .query
                .iter()
                .filter(|q| !q.key.trim().is_empty())
                .map(|q| KeyValueItem {
                    id: Uuid::new_v4().to_string(),
                    key: q.key.trim().to_string(),
                    value: q.value.clone().unwrap_or_default(),
                    description: q.description.clone(),
                    enabled: !q.disabled,
                })
                .collect();

            if !obj.raw.trim().is_empty() {
                let (clean_base, raw_params) = split_raw_url_and_query(&obj.raw);
                if params.is_empty() {
                    params = raw_params;
                }
                return (clean_base, params);
            }

            // Reconstruct URL from protocol + host + port + path if `raw` was omitted
            let mut built = String::new();
            if let Some(proto) = &obj.protocol {
                built.push_str(proto);
                built.push_str("://");
            }
            if let Some(host_val) = &obj.host {
                match host_val {
                    Value::String(s) => built.push_str(s),
                    Value::Array(arr) => {
                        let parts: Vec<String> = arr
                            .iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect();
                        built.push_str(&parts.join("."));
                    }
                    _ => {}
                }
            }
            if let Some(port) = &obj.port {
                if !port.is_empty() {
                    built.push(':');
                    built.push_str(port);
                }
            }
            if let Some(path_val) = &obj.path {
                match path_val {
                    Value::String(s) => {
                        if !s.starts_with('/') {
                            built.push('/');
                        }
                        built.push_str(s);
                    }
                    Value::Array(arr) => {
                        let parts: Vec<String> = arr
                            .iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
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
    }
}

fn split_raw_url_and_query(raw: &str) -> (String, Vec<KeyValueItem>) {
    let trimmed = raw.trim();
    let Some(q_idx) = trimmed.find('?') else {
        return (trimmed.to_string(), Vec::new());
    };
    let base = trimmed[..q_idx].to_string();
    let query_str = &trimmed[q_idx + 1..];
    let mut params = Vec::new();
    for pair in query_str.split('&') {
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

fn convert_postman_body(pm_body: &PostmanBody, headers: &[KeyValueItem]) -> RequestBody {
    match pm_body.mode.as_str() {
        "raw" => {
            let raw_text = pm_body.raw.clone().unwrap_or_default();
            let lang_is_json = pm_body
                .options
                .as_ref()
                .and_then(|o| o.get("raw"))
                .and_then(|r| r.get("language"))
                .and_then(|l| l.as_str())
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

            let mode = if lang_is_json || header_is_json || looks_like_json {
                "json"
            } else {
                "raw"
            };

            RequestBody {
                mode: mode.to_string(),
                raw: raw_text,
                urlencoded: Vec::new(),
                formdata: Vec::new(),
            }
        }
        "urlencoded" => {
            let items = pm_body
                .urlencoded
                .as_ref()
                .map(|list| {
                    list.iter()
                        .map(|kv| KeyValueItem {
                            id: Uuid::new_v4().to_string(),
                            key: kv.key.clone(),
                            value: kv.value.clone().unwrap_or_default(),
                            description: kv.description.clone(),
                            enabled: !kv.disabled,
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
            let fields = pm_body
                .formdata
                .as_ref()
                .map(|list| {
                    list.iter()
                        .map(|kv| {
                            let ftype = kv
                                .field_type
                                .clone()
                                .unwrap_or_else(|| "text".to_string());
                            let val = if ftype == "file" {
                                kv.src
                                    .as_ref()
                                    .and_then(|s| s.as_str().map(|st| st.to_string()))
                                    .or_else(|| kv.value.clone())
                                    .unwrap_or_default()
                            } else {
                                kv.value.clone().unwrap_or_default()
                            };
                            MultipartField {
                                id: Uuid::new_v4().to_string(),
                                key: kv.key.clone(),
                                value: val,
                                field_type: ftype,
                                file_name: None,
                                enabled: !kv.disabled,
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

fn convert_postman_auth(pm_auth: &PostmanAuth) -> AuthConfig {
    let find_attr = |attrs: &Option<Vec<PostmanAuthAttribute>>, target_key: &str| -> String {
        attrs
            .as_ref()
            .and_then(|list| list.iter().find(|a| a.key == target_key))
            .map(|a| match &a.value {
                Value::String(s) => s.clone(),
                Value::Null => String::new(),
                other => other.to_string(),
            })
            .unwrap_or_default()
    };

    match pm_auth.auth_type.as_str() {
        "bearer" => AuthConfig {
            auth_type: "bearer".to_string(),
            bearer_token: find_attr(&pm_auth.bearer, "token"),
            ..Default::default()
        },
        "basic" => AuthConfig {
            auth_type: "basic".to_string(),
            basic_username: find_attr(&pm_auth.basic, "username"),
            basic_password: find_attr(&pm_auth.basic, "password"),
            ..Default::default()
        },
        "apikey" => {
            let in_where = find_attr(&pm_auth.apikey, "in");
            AuthConfig {
                auth_type: "apikey".to_string(),
                api_key_name: find_attr(&pm_auth.apikey, "key"),
                api_key_value: find_attr(&pm_auth.apikey, "value"),
                api_key_in: if in_where == "query" {
                    "query".to_string()
                } else {
                    "header".to_string()
                },
                ..Default::default()
            }
        }
        _ => AuthConfig::default(),
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
}

