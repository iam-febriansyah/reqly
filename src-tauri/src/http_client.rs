use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, USER_AGENT};
use reqwest::Method;
use tokio::sync::watch;
use url::Url;

use crate::models::{EnvironmentVariable, HttpResponseData, ResponseHeader, SavedRequest};
use crate::variables::resolve_request;

pub struct CancellationRegistry {
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
}

impl CancellationRegistry {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, request_id: &str) -> watch::Receiver<bool> {
        let (tx, rx) = watch::channel(false);
        if let Ok(mut map) = self.active.lock() {
            if let Some(prev) = map.insert(request_id.to_string(), tx) {
                let _ = prev.send(true);
            }
        }
        rx
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        if let Ok(mut map) = self.active.lock() {
            if let Some(tx) = map.remove(request_id) {
                let _ = tx.send(true);
                return true;
            }
        }
        false
    }

    pub fn unregister(&self, request_id: &str) {
        if let Ok(mut map) = self.active.lock() {
            map.remove(request_id);
        }
    }
}

fn sanitize_error_message(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        return "Request timed out while waiting for server response.".to_string();
    }
    if err.is_connect() {
        return format!(
            "Connection failed: unable to reach host ({})",
            err.url()
                .and_then(|u| u.host_str())
                .unwrap_or("target server")
        );
    }
    if err.is_builder() {
        return "Invalid request configuration or malformed URL/header.".to_string();
    }
    let raw = err.to_string();
    // Redact any accidental credential fragments in URLs
    if let Some(at_idx) = raw.find('@') {
        if let Some(scheme_idx) = raw[..at_idx].find("://") {
            let mut redacted = String::new();
            redacted.push_str(&raw[..scheme_idx + 3]);
            redacted.push_str("***@");
            redacted.push_str(&raw[at_idx + 1..]);
            return redacted;
        }
    }
    raw
}

pub async fn execute_http_request(
    request: &SavedRequest,
    env_vars: &[EnvironmentVariable],
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<HttpResponseData, String> {
    let (resolved, unresolved_variables) = resolve_request(request, env_vars);

    let raw_url = resolved.url.trim();
    if raw_url.is_empty() {
        return Err("Request URL cannot be empty.".to_string());
    }

    let normalized_url = if !raw_url.contains("://") && !raw_url.starts_with("http") {
        format!("http://{}", raw_url)
    } else {
        raw_url.to_string()
    };

    let mut parsed_url = Url::parse(&normalized_url)
        .map_err(|e| format!("Invalid URL \"{}\": {}", normalized_url, e))?;

    // Collect enabled query parameters and query API key before mutating URL
    let mut extra_queries: Vec<(String, String)> = Vec::new();
    for param in &resolved.params {
        if param.enabled && !param.key.trim().is_empty() {
            extra_queries.push((param.key.trim().to_string(), param.value.clone()));
        }
    }
    if resolved.auth.auth_type == "apikey"
        && resolved.auth.api_key_in == "query"
        && !resolved.auth.api_key_name.trim().is_empty()
    {
        extra_queries.push((
            resolved.auth.api_key_name.trim().to_string(),
            resolved.auth.api_key_value.clone(),
        ));
    }

    if !extra_queries.is_empty() {
        let mut query_pairs = parsed_url.query_pairs_mut();
        for (k, v) in &extra_queries {
            query_pairs.append_pair(k, v);
        }
    }

    let final_url_str = parsed_url.to_string();

    let method_str = resolved.method.trim().to_uppercase();
    if method_str.is_empty() {
        return Err("HTTP method cannot be empty.".to_string());
    }
    let method = Method::from_bytes(method_str.as_bytes())
        .map_err(|_| format!("Invalid HTTP method: {}", method_str))?;

    let timeout_ms = if resolved.timeout_ms == 0 {
        30_000
    } else {
        resolved.timeout_ms.clamp(500, 300_000)
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let mut header_map = HeaderMap::new();
    header_map.insert(USER_AGENT, HeaderValue::from_static("Reqly/1.0"));
    header_map.insert(reqwest::header::ACCEPT, HeaderValue::from_static("*/*"));

    for h in &resolved.headers {
        if h.enabled && !h.key.trim().is_empty() {
            let name = HeaderName::from_str(h.key.trim())
                .map_err(|_| format!("Invalid header name: '{}'", h.key.trim()))?;
            let val = HeaderValue::from_str(&h.value)
                .map_err(|_| format!("Invalid value for header '{}'", h.key.trim()))?;
            header_map.insert(name, val);
        }
    }

    // Apply Authentication headers (never log tokens)
    match resolved.auth.auth_type.as_str() {
        "bearer" => {
            let token = resolved.auth.bearer_token.trim();
            if !token.is_empty() {
                let header_val = format!("Bearer {}", token);
                let val = HeaderValue::from_str(&header_val)
                    .map_err(|_| "Invalid characters in Bearer Token.".to_string())?;
                header_map.insert(reqwest::header::AUTHORIZATION, val);
            }
        }
        "basic" => {
            let credentials = format!(
                "{}:{}",
                resolved.auth.basic_username, resolved.auth.basic_password
            );
            let encoded = BASE64_STANDARD.encode(credentials.as_bytes());
            let header_val = format!("Basic {}", encoded);
            if let Ok(val) = HeaderValue::from_str(&header_val) {
                header_map.insert(reqwest::header::AUTHORIZATION, val);
            }
        }
        "apikey" if resolved.auth.api_key_in != "query" => {
            let key_name = resolved.auth.api_key_name.trim();
            if !key_name.is_empty() {
                let name = HeaderName::from_str(key_name)
                    .map_err(|_| format!("Invalid API Key header name: '{}'", key_name))?;
                let val = HeaderValue::from_str(&resolved.auth.api_key_value)
                    .map_err(|_| "Invalid characters in API Key value.".to_string())?;
                header_map.insert(name, val);
            }
        }
        _ => {}
    }

    // Set default Content-Type in header_map only if not already specified by the user,
    // preventing reqwest RequestBuilder::header() from appending a duplicate Content-Type header.
    match resolved.body.mode.as_str() {
        "json" => {
            if (!resolved.body.raw.is_empty() || (method != Method::GET && method != Method::HEAD))
                && !header_map.contains_key(CONTENT_TYPE)
            {
                header_map.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            }
        }
        "raw" => {
            if (!resolved.body.raw.is_empty() || (method != Method::GET && method != Method::HEAD))
                && !header_map.contains_key(CONTENT_TYPE)
            {
                header_map.insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static("text/plain; charset=utf-8"),
                );
            }
        }
        _ => {}
    }

    let mut req_builder = client.request(method.clone(), parsed_url).headers(header_map);

    // Apply Request Body (skip for GET / HEAD if mode is "none")
    match resolved.body.mode.as_str() {
        "json" | "raw" => {
            if !resolved.body.raw.is_empty() || (method != Method::GET && method != Method::HEAD) {
                req_builder = req_builder.body(resolved.body.raw.clone());
            }
        }
        "urlencoded" => {
            let mut pairs = Vec::new();
            for item in &resolved.body.urlencoded {
                if item.enabled && !item.key.trim().is_empty() {
                    pairs.push((item.key.trim().to_string(), item.value.clone()));
                }
            }
            req_builder = req_builder.form(&pairs);
        }
        "formdata" => {
            let mut form = reqwest::multipart::Form::new();
            for field in &resolved.body.formdata {
                if !field.enabled || field.key.trim().is_empty() {
                    continue;
                }
                if field.field_type == "file" {
                    let file_path = std::path::Path::new(field.value.trim());
                    let bytes = tokio::fs::read(file_path).await.map_err(|e| {
                        format!(
                            "Failed to read multipart file '{}': {}",
                            field.value.trim(),
                            e
                        )
                    })?;
                    let fname = field
                        .file_name
                        .clone()
                        .or_else(|| {
                            file_path
                                .file_name()
                                .and_then(|n| n.to_str())
                                .map(|s| s.to_string())
                        })
                        .unwrap_or_else(|| "upload.bin".to_string());
                    let part = reqwest::multipart::Part::bytes(bytes).file_name(fname);
                    form = form.part(field.key.trim().to_string(), part);
                } else {
                    form = form.text(field.key.trim().to_string(), field.value.clone());
                }
            }
            req_builder = req_builder.multipart(form);
        }
        _ => {}
    }

    let started = Instant::now();

    let response_result = tokio::select! {
        res = req_builder.send() => res,
        _ = cancel_rx.changed() => {
            return Err("Request cancelled by user.".to_string());
        }
    };

    let response = response_result.map_err(|e| sanitize_error_message(&e))?;

    let status = response.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("OK").to_string();

    let mut headers = Vec::new();
    let mut content_type = String::new();
    for (k, v) in response.headers().iter() {
        let val_str = v.to_str().unwrap_or("<binary>").to_string();
        if k.as_str().eq_ignore_ascii_case("content-type") {
            content_type = val_str.clone();
        }
        headers.push(ResponseHeader {
            key: k.to_string(),
            value: val_str,
        });
    }

    let body_bytes_result = tokio::select! {
        bytes = response.bytes() => bytes,
        _ = cancel_rx.changed() => {
            return Err("Request cancelled while reading response body.".to_string());
        }
    };

    let bytes = body_bytes_result.map_err(|e| sanitize_error_message(&e))?;
    let duration_ms = started.elapsed().as_millis() as u64;
    let size_bytes = bytes.len();

    let lower_ct = content_type.to_lowercase();
    let is_image = lower_ct.starts_with("image/");

    let (body_text, image_base64) = if is_image {
        let mime = lower_ct
            .split(';')
            .next()
            .unwrap_or("image/png")
            .trim()
            .to_string();
        let b64 = BASE64_STANDARD.encode(&bytes);
        let data_uri = format!("data:{};base64,{}", mime, b64);
        (
            format!("[Binary Image Payload: {} ({} bytes)]", mime, size_bytes),
            Some(data_uri),
        )
    } else {
        let raw_text = String::from_utf8_lossy(&bytes).to_string();
        (raw_text, None)
    };

    Ok(HttpResponseData {
        status: status_code,
        status_text,
        duration_ms,
        size_bytes,
        headers,
        body: body_text,
        content_type,
        is_image,
        image_base64,
        resolved_url: final_url_str,
        unresolved_variables,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AuthConfig, KeyValueItem, RequestBody};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_http_client_execution_and_variable_resolution() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("local_addr");

        tokio::spawn(async move {
            if let Ok((mut stream, _)) = listener.accept().await {
                let mut buf = vec![0u8; 4096];
                let n = stream.read(&mut buf).await.unwrap_or(0);
                let req_str = String::from_utf8_lossy(&buf[..n]).to_string();

                let body = serde_json::json!({
                    "received": req_str,
                    "ok": true
                })
                .to_string();

                let resp = format!(
                    "HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: {}\r\nX-Custom-Echo: reqly-ok\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }
        });

        let env_vars = vec![
            EnvironmentVariable {
                id: "v1".to_string(),
                key: "HOST".to_string(),
                value: format!("http://{}", addr),
                enabled: true,
            },
            EnvironmentVariable {
                id: "v2".to_string(),
                key: "TOKEN".to_string(),
                value: "secret-jwt-123".to_string(),
                enabled: true,
            },
        ];

        let req = SavedRequest {
            id: "req-1".to_string(),
            project_id: "proj-1".to_string(),
            folder_id: None,
            name: "Create Resource".to_string(),
            method: "POST".to_string(),
            url: "{{HOST}}/v1/items".to_string(),
            params: vec![KeyValueItem {
                id: "p1".to_string(),
                key: "filter".to_string(),
                value: "active items".to_string(),
                description: String::new(),
                enabled: true,
            }],
            headers: vec![KeyValueItem {
                id: "h1".to_string(),
                key: "X-Client".to_string(),
                value: "Reqly".to_string(),
                description: String::new(),
                enabled: true,
            }],
            body: RequestBody {
                mode: "json".to_string(),
                raw: "{\"title\":\"hello\"}".to_string(),
                urlencoded: vec![],
                formdata: vec![],
            },
            auth: AuthConfig {
                auth_type: "bearer".to_string(),
                bearer_token: "{{TOKEN}}".to_string(),
                ..Default::default()
            },
            timeout_ms: 5000,
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        };

        let (_tx, rx) = watch::channel(false);
        let resp = execute_http_request(&req, &env_vars, rx)
            .await
            .expect("http execution should succeed");

        assert_eq!(resp.status, 201);
        assert!(resp.resolved_url.contains("filter=active+items"));
        assert!(resp.body.contains("Bearer secret-jwt-123"));
        assert!(resp.body.contains("x-client: Reqly") || resp.body.contains("X-Client: Reqly"));
        assert!(resp.unresolved_variables.is_empty());
    }
}

