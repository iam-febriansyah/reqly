use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::str::FromStr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, USER_AGENT};
use reqwest::Method;
use tokio::sync::watch;
use url::Url;

use crate::models::{
    EnvironmentVariable, HttpResponseData, RemoteFileCheckResult, ResponseHeader, SavedRequest,
};
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
    let raw = err.to_string();
    if err.is_timeout() {
        return "Request timed out while waiting for server response.".to_string();
    }
    let raw_lower = raw.to_lowercase();
    if raw_lower.contains("certificate")
        || raw_lower.contains("unknownissuer")
        || raw_lower.contains("invaliddigest")
        || raw_lower.contains("certexpired")
        || raw_lower.contains("handshake")
        || raw_lower.contains("tls")
        || raw_lower.contains("ssl")
    {
        return format!(
            "SSL/TLS Certificate Error: {}\nTip: Turn off 'SSL Verify' in the request header to connect to internal or self-signed servers.",
            raw
        );
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

/// Detects whether a multipart file value is a remote HTTP/HTTPS URL (using IP or Domain)
/// vs a local filesystem path.
pub fn parse_remote_file_url(raw: &str) -> Option<Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return None;
    }

    let lower = trimmed.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        let parsed = Url::parse(trimmed).ok()?;
        return if parsed.host_str().is_some() {
            Some(parsed)
        } else {
            None
        };
    }

    // Clearly local filesystem / UNC paths
    if trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || trimmed.starts_with("./")
        || trimmed.starts_with("../")
        || trimmed.starts_with("~/")
        || trimmed.contains('\\')
    {
        return None;
    }
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return None;
    }

    // Check bare IP / localhost / domain with slash or port (e.g. 192.168.1.50:8080/a.png, domain.com/b.pdf)
    let first_seg = trimmed.split('/').next().unwrap_or("");
    if first_seg.is_empty() {
        return None;
    }

    // Strip port if not IPv6 bracket without port
    let (host_only, has_port) = if first_seg.starts_with('[') {
        if let Some(end_bracket) = first_seg.find(']') {
            let inside = &first_seg[1..end_bracket];
            let rest = &first_seg[end_bracket + 1..];
            (inside, rest.starts_with(':'))
        } else {
            return None;
        }
    } else if let Some(colon_idx) = first_seg.rfind(':') {
        let port_part = &first_seg[colon_idx + 1..];
        if !port_part.is_empty() && port_part.chars().all(|c| c.is_ascii_digit()) {
            (&first_seg[..colon_idx], true)
        } else {
            (first_seg, false)
        }
    } else {
        (first_seg, false)
    };

    let has_slash = trimmed.contains('/');
    let is_ip = host_only.parse::<IpAddr>().is_ok();
    let is_localhost = host_only.eq_ignore_ascii_case("localhost");
    let is_domain = if !is_ip && !is_localhost && has_slash && host_only.contains('.') {
        let labels: Vec<&str> = host_only.split('.').collect();
        let valid_labels = labels
            .iter()
            .all(|l| !l.is_empty() && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        let tld_alpha = labels
            .last()
            .map(|tld| tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()))
            .unwrap_or(false);
        valid_labels && tld_alpha
    } else {
        false
    };

    if is_ip || (is_localhost && (has_port || has_slash)) || is_domain {
        let candidate = format!("http://{}", trimmed);
        let parsed = Url::parse(&candidate).ok()?;
        return if parsed.host_str().is_some() {
            Some(parsed)
        } else {
            None
        };
    }

    None
}

fn guess_mime_from_extension(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "pdf" => Some("application/pdf"),
        "json" => Some("application/json"),
        "txt" | "log" => Some("text/plain"),
        "csv" => Some("text/csv"),
        "xml" => Some("application/xml"),
        "html" | "htm" => Some("text/html"),
        "zip" => Some("application/zip"),
        "doc" => Some("application/msword"),
        "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "xls" => Some("application/vnd.ms-excel"),
        "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "mp4" => Some("video/mp4"),
        "mp3" => Some("audio/mpeg"),
        _ => None,
    }
}

fn extension_from_content_type(ct: &str) -> Option<&'static str> {
    let mime = ct.split(';').next()?.trim().to_ascii_lowercase();
    match mime.as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "application/pdf" => Some("pdf"),
        "application/json" => Some("json"),
        "text/plain" => Some("txt"),
        "text/csv" => Some("csv"),
        "application/xml" | "text/xml" => Some("xml"),
        "application/zip" => Some("zip"),
        _ => None,
    }
}

fn extract_filename_from_url(url: &Url) -> Option<String> {
    let seg = url
        .path_segments()?
        .filter(|s| !s.trim().is_empty())
        .next_back()?;
    let decoded = seg.trim().to_string();
    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

fn extract_filename_from_content_disposition(headers: &HeaderMap) -> Option<String> {
    let raw = headers
        .get(reqwest::header::CONTENT_DISPOSITION)?
        .to_str()
        .ok()?;
    for part in raw.split(';') {
        let p = part.trim();
        if let Some(rest) = p.strip_prefix("filename=") {
            let cleaned = rest.trim().trim_matches('"').trim_matches('\'');
            if !cleaned.is_empty() {
                return Some(cleaned.to_string());
            }
        }
        if let Some(rest) = p.strip_prefix("filename*=") {
            if let Some((_, name)) = rest.split_once("''") {
                let cleaned = name.trim().trim_matches('"');
                if !cleaned.is_empty() {
                    return Some(cleaned.to_string());
                }
            }
        }
    }
    None
}

async fn resolve_host_dns(host: &str, port: u16) -> Result<String, String> {
    let resolved_addrs: Vec<SocketAddr> =
        match tokio::time::timeout(Duration::from_secs(4), tokio::net::lookup_host((host, port)))
            .await
        {
            Ok(Ok(iter)) => iter.collect(),
            Ok(Err(e)) => {
                return Err(format!("DNS gagal resolve host '{}': {}", host, e));
            }
            Err(_) => {
                return Err(format!("DNS lookup timeout untuk host '{}'", host));
            }
        };

    resolved_addrs
        .first()
        .map(|a| a.ip().to_string())
        .ok_or_else(|| format!("Tidak ditemukan alamat IP untuk host '{}'", host))
}

pub async fn check_remote_file_connection(
    raw_input: &str,
    ssl_verify: bool,
) -> RemoteFileCheckResult {
    let Some(parsed_url) = parse_remote_file_url(raw_input) else {
        return RemoteFileCheckResult {
            reachable: false,
            ok: false,
            status: None,
            host: String::new(),
            resolved_ip: None,
            resolved_url: raw_input.trim().to_string(),
            content_type: None,
            content_length: None,
            file_name: None,
            latency_ms: 0,
            message: "Format URL tidak valid (gunakan http:// atau https:// dengan IP/Domain)."
                .to_string(),
        };
    };

    let host = parsed_url.host_str().unwrap_or("").to_string();
    let port = parsed_url.port_or_known_default().unwrap_or(80);
    let host_display = if let Some(explicit_port) = parsed_url.port() {
        format!("{}:{}", host, explicit_port)
    } else {
        host.clone()
    };

    let started = Instant::now();
    let dns_ip = match resolve_host_dns(&host, port).await {
        Ok(ip) => ip,
        Err(msg) => {
            return RemoteFileCheckResult {
                reachable: false,
                ok: false,
                status: None,
                host: host_display,
                resolved_ip: None,
                resolved_url: parsed_url.to_string(),
                content_type: None,
                content_length: None,
                file_name: extract_filename_from_url(&parsed_url),
                latency_ms: started.elapsed().as_millis() as u64,
                message: msg,
            };
        }
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(5))
        .danger_accept_invalid_certs(!ssl_verify)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return RemoteFileCheckResult {
                reachable: false,
                ok: false,
                status: None,
                host: host_display,
                resolved_ip: Some(dns_ip),
                resolved_url: parsed_url.to_string(),
                content_type: None,
                content_length: None,
                file_name: extract_filename_from_url(&parsed_url),
                latency_ms: started.elapsed().as_millis() as u64,
                message: format!("Gagal inisialisasi HTTP client: {}", e),
            };
        }
    };

    let mut resp_res = client
        .head(parsed_url.clone())
        .header(USER_AGENT, "Reqly/1.0")
        .send()
        .await;

    // Fallback to partial GET if server rejects HEAD (405 Method Not Allowed / 501 / 403)
    if let Ok(ref resp) = resp_res {
        let code = resp.status().as_u16();
        if code == 405 || code == 501 || code == 403 {
            resp_res = client
                .get(parsed_url.clone())
                .header(USER_AGENT, "Reqly/1.0")
                .header(reqwest::header::RANGE, "bytes=0-0")
                .send()
                .await;
        }
    }

    let latency_ms = started.elapsed().as_millis() as u64;

    match resp_res {
        Ok(resp) => {
            let status_code = resp.status().as_u16();
            let reason = resp.status().canonical_reason().unwrap_or("");
            let is_ok = resp.status().is_success();
            let peer_ip = resp
                .remote_addr()
                .map(|a| a.ip().to_string())
                .unwrap_or(dns_ip);

            let content_type = resp
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.split(';').next().unwrap_or(s).trim().to_string());

            let content_length = resp
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split('/').next_back())
                .and_then(|tot| tot.trim().parse::<u64>().ok())
                .or_else(|| {
                    resp.headers()
                        .get(reqwest::header::CONTENT_LENGTH)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.trim().parse::<u64>().ok())
                })
                .or_else(|| resp.content_length().filter(|&n| n > 0));

            let file_name = extract_filename_from_content_disposition(resp.headers())
                .or_else(|| extract_filename_from_url(&parsed_url));

            let msg = if is_ok {
                format!(
                    "Terhubung ke {} ({}) • HTTP {} {}",
                    host_display, peer_ip, status_code, reason
                )
            } else {
                format!(
                    "Host {} ({}) terhubung, namun server merespon HTTP {} {}",
                    host_display, peer_ip, status_code, reason
                )
            };

            RemoteFileCheckResult {
                reachable: true,
                ok: is_ok,
                status: Some(status_code),
                host: host_display,
                resolved_ip: Some(peer_ip),
                resolved_url: parsed_url.to_string(),
                content_type,
                content_length,
                file_name,
                latency_ms,
                message: msg,
            }
        }
        Err(e) => RemoteFileCheckResult {
            reachable: false,
            ok: false,
            status: None,
            host: host_display,
            resolved_ip: Some(dns_ip),
            resolved_url: parsed_url.to_string(),
            content_type: None,
            content_length: None,
            file_name: extract_filename_from_url(&parsed_url),
            latency_ms,
            message: sanitize_error_message(&e),
        },
    }
}

fn build_multipart_part(
    bytes: Vec<u8>,
    fname: String,
    mime_opt: Option<&str>,
) -> reqwest::multipart::Part {
    if let Some(mime) = mime_opt {
        if let Ok(part) = reqwest::multipart::Part::bytes(bytes.clone())
            .file_name(fname.clone())
            .mime_str(mime)
        {
            return part;
        }
    }
    reqwest::multipart::Part::bytes(bytes).file_name(fname)
}

async fn fetch_remote_multipart_part(
    client: &reqwest::Client,
    url: &Url,
    explicit_file_name: Option<&str>,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<reqwest::multipart::Part, String> {
    let host = url.host_str().unwrap_or("");
    let port = url.port_or_known_default().unwrap_or(80);

    tokio::select! {
        res = resolve_host_dns(host, port) => {
            res.map_err(|err| format!("Multipart file URL check failed for '{}': {}", url, err))?;
        }
        _ = cancel_rx.changed() => {
            return Err("Request cancelled while checking remote multipart file DNS.".to_string());
        }
    }

    let resp = tokio::select! {
        res = client.get(url.clone()).header(USER_AGENT, "Reqly/1.0").send() => {
            res.map_err(|e| format!("Failed to fetch multipart file from '{}': {}", url, sanitize_error_message(&e)))?
        }
        _ = cancel_rx.changed() => {
            return Err("Request cancelled while downloading multipart file URL.".to_string());
        }
    };

    if !resp.status().is_success() {
        return Err(format!(
            "Failed to fetch multipart file from '{}': server returned HTTP {}",
            url,
            resp.status()
        ));
    }

    let mime_str = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string());

    let disposition_name = extract_filename_from_content_disposition(resp.headers());

    let bytes = tokio::select! {
        res = resp.bytes() => res.map_err(|e| format!("Failed reading remote file bytes from '{}': {}", url, e))?,
        _ = cancel_rx.changed() => {
            return Err("Request cancelled while reading remote multipart file.".to_string());
        }
    };

    let fallback_name = if let Some(ext) = mime_str.as_deref().and_then(extension_from_content_type)
    {
        format!("upload.{}", ext)
    } else {
        "upload.bin".to_string()
    };

    let fname = explicit_file_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or(disposition_name)
        .or_else(|| extract_filename_from_url(url))
        .unwrap_or(fallback_name);

    let part = build_multipart_part(bytes.to_vec(), fname, mime_str.as_deref());
    Ok(part)
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
        .danger_accept_invalid_certs(!resolved.ssl_verify)
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
                    let raw_val = field.value.trim();
                    if raw_val.is_empty() {
                        return Err(format!(
                            "Multipart file field '{}' cannot be empty.",
                            field.key.trim()
                        ));
                    }
                    let part = if let Some(remote_url) = parse_remote_file_url(raw_val) {
                        fetch_remote_multipart_part(
                            &client,
                            &remote_url,
                            field.file_name.as_deref(),
                            &mut cancel_rx,
                        )
                        .await?
                    } else {
                        let file_path = Path::new(raw_val);
                        let bytes = tokio::fs::read(file_path).await.map_err(|e| {
                            format!("Failed to read multipart file '{}': {}", raw_val, e)
                        })?;
                        let fname = field
                            .file_name
                            .clone()
                            .filter(|s| !s.trim().is_empty())
                            .or_else(|| {
                                file_path
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .map(|s| s.to_string())
                            })
                            .unwrap_or_else(|| "upload.bin".to_string());
                        let mime = guess_mime_from_extension(file_path);
                        build_multipart_part(bytes, fname, mime)
                    };
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
            ssl_verify: false,
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

    #[test]
    fn test_parse_remote_file_url_distinction() {
        // Local paths must return None
        assert!(parse_remote_file_url("/path/to/file.png").is_none());
        assert!(parse_remote_file_url("C:\\Users\\test\\image.png").is_none());
        assert!(parse_remote_file_url("D:/uploads/doc.pdf").is_none());
        assert!(parse_remote_file_url("\\\\192.168.1.5\\share\\doc.pdf").is_none());
        assert!(parse_remote_file_url("./relative/img.png").is_none());
        assert!(parse_remote_file_url("photo.png").is_none());

        // Remote URLs (Domain & IP) must resolve
        let u1 = parse_remote_file_url("https://cdn.example.com/files/doc.pdf").unwrap();
        assert_eq!(u1.host_str(), Some("cdn.example.com"));

        let u2 = parse_remote_file_url("http://192.168.1.50:8080/sample.png").unwrap();
        assert_eq!(u2.host_str(), Some("192.168.1.50"));
        assert_eq!(u2.port(), Some(8080));

        let u3 = parse_remote_file_url("192.168.1.50/uploads/file.png").unwrap();
        assert_eq!(u3.as_str(), "http://192.168.1.50/uploads/file.png");

        let u4 = parse_remote_file_url("files.domain.co.id/a.jpg").unwrap();
        assert_eq!(u4.as_str(), "http://files.domain.co.id/a.jpg");
    }

    #[tokio::test]
    async fn test_check_and_upload_remote_multipart_file() {
        use crate::models::MultipartField;

        // Spawn mock file server + upload receiver server
        let file_listener = TcpListener::bind("127.0.0.1:0").await.expect("bind file");
        let file_addr = file_listener.local_addr().expect("file addr");

        tokio::spawn(async move {
            loop {
                match file_listener.accept().await {
                    Ok((mut stream, _)) => {
                        let mut buf = vec![0u8; 2048];
                        let n = stream.read(&mut buf).await.unwrap_or(0);
                        let req = String::from_utf8_lossy(&buf[..n]);
                        let content = b"PNGDATA_TEST_123";
                        if req.starts_with("HEAD ") {
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\n\r\n",
                                content.len()
                            );
                            let _ = stream.write_all(resp.as_bytes()).await;
                        } else {
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\n\r\n",
                                content.len()
                            );
                            let _ = stream.write_all(resp.as_bytes()).await;
                            let _ = stream.write_all(content).await;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let remote_url = format!("http://{}/sample_logo.png", file_addr);
        let check_ok = check_remote_file_connection(&remote_url, false).await;
        assert!(check_ok.reachable);
        assert!(check_ok.ok);
        assert_eq!(check_ok.status, Some(200));
        assert_eq!(check_ok.file_name.as_deref(), Some("sample_logo.png"));
        assert_eq!(check_ok.content_length, Some(16));

        // Find an unreachable closed port
        let dead_listener = TcpListener::bind("127.0.0.1:0").await.expect("bind dead");
        let dead_addr = dead_listener.local_addr().expect("dead addr");
        drop(dead_listener);
        let dead_url = format!("http://{}/missing.png", dead_addr);
        let check_dead = check_remote_file_connection(&dead_url, false).await;
        assert!(!check_dead.reachable);
        assert!(!check_dead.ok);

        // Now test sending multipart formdata with remote URL
        let upload_listener = TcpListener::bind("127.0.0.1:0").await.expect("bind upload");
        let upload_addr = upload_listener.local_addr().expect("upload addr");
        tokio::spawn(async move {
            if let Ok((mut stream, _)) = upload_listener.accept().await {
                let mut buf = vec![0u8; 8192];
                let mut total = Vec::new();
                // Read enough to capture multipart body
                for _ in 0..5 {
                    match tokio::time::timeout(
                        Duration::from_millis(200),
                        stream.read(&mut buf),
                    )
                    .await
                    {
                        Ok(Ok(0)) | Err(_) => break,
                        Ok(Ok(n)) => {
                            total.extend_from_slice(&buf[..n]);
                            if total.windows(b"PNGDATA_TEST_123".len()).any(|w| w == b"PNGDATA_TEST_123") {
                                break;
                            }
                        }
                        _ => break,
                    }
                }
                let captured = String::from_utf8_lossy(&total).to_string();
                let resp_body = serde_json::json!({ "captured": captured }).to_string();
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                    resp_body.len(),
                    resp_body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }
        });

        let req = SavedRequest {
            id: "req-mp".to_string(),
            project_id: "proj-1".to_string(),
            folder_id: None,
            name: "Upload Remote".to_string(),
            method: "POST".to_string(),
            url: format!("http://{}/upload", upload_addr),
            params: vec![],
            headers: vec![],
            body: RequestBody {
                mode: "formdata".to_string(),
                raw: String::new(),
                urlencoded: vec![],
                formdata: vec![MultipartField {
                    id: "f1".to_string(),
                    key: "uploadFiles".to_string(),
                    value: remote_url,
                    field_type: "file".to_string(),
                    file_name: None,
                    enabled: true,
                }],
            },
            auth: AuthConfig::default(),
            timeout_ms: 5000,
            ssl_verify: false,
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        };

        let (_tx, rx) = watch::channel(false);
        let resp = execute_http_request(&req, &[], rx)
            .await
            .expect("upload with remote url should succeed");
        assert_eq!(resp.status, 200);
        assert!(resp.body.contains("sample_logo.png"));
        assert!(resp.body.contains("PNGDATA_TEST_123"));
    }
}

