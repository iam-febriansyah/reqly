use std::collections::{HashMap, HashSet};
use crate::models::{AuthConfig, EnvironmentVariable, KeyValueItem, MultipartField, RequestBody, SavedRequest};

/// Extracts all variable names referenced with `{{VAR_NAME}}` syntax in the given text.
pub fn extract_variables(input: &str) -> Vec<String> {
    let mut vars = Vec::new();
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i + 3 < len {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(end_offset) = input[i + 2..].find("}}") {
                let raw_name = input[i + 2..i + 2 + end_offset].trim();
                if !raw_name.is_empty() && !raw_name.contains('{') && !raw_name.contains('}') {
                    vars.push(raw_name.to_string());
                }
                i += 2 + end_offset + 2;
                continue;
            }
        }
        i += 1;
    }
    vars
}

/// Resolves `{{VAR_NAME}}` placeholders in `input` using enabled variables from `env_vars`.
/// Also records any unresolved variable names into `unresolved`.
pub fn resolve_string(
    input: &str,
    var_map: &HashMap<String, String>,
    unresolved: &mut HashSet<String>,
) -> String {
    let mut result = String::with_capacity(input.len());
    let mut rest = input;

    while let Some(start) = rest.find("{{") {
        result.push_str(&rest[..start]);
        let after_open = &rest[start + 2..];
        if let Some(end) = after_open.find("}}") {
            let token = &after_open[..end];
            let var_name = token.trim();
            if !var_name.is_empty() && !var_name.contains('{') && !var_name.contains('}') {
                if let Some(val) = var_map.get(var_name) {
                    result.push_str(val);
                } else {
                    unresolved.insert(var_name.to_string());
                    result.push_str("{{");
                    result.push_str(token);
                    result.push_str("}}");
                }
                rest = &after_open[end + 2..];
            } else {
                result.push_str("{{");
                rest = after_open;
            }
        } else {
            result.push_str(&rest[start..]);
            rest = "";
            break;
        }
    }
    result.push_str(rest);
    result
}

pub fn build_variable_map(variables: &[EnvironmentVariable]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for var in variables {
        if var.enabled && !var.key.trim().is_empty() {
            map.insert(var.key.trim().to_string(), var.value.clone());
        }
    }
    map
}

/// Returns a cloned `SavedRequest` with all `{{VARIABLE}}` placeholders resolved,
/// along with a sorted list of any unresolved variable names.
/// Never mutates the original saved request.
pub fn resolve_request(
    request: &SavedRequest,
    variables: &[EnvironmentVariable],
) -> (SavedRequest, Vec<String>) {
    let var_map = build_variable_map(variables);
    let mut unresolved_set = HashSet::new();

    let resolved_url = resolve_string(&request.url, &var_map, &mut unresolved_set);

    let resolved_params = request
        .params
        .iter()
        .map(|p| {
            if !p.enabled {
                return p.clone();
            }
            KeyValueItem {
                id: p.id.clone(),
                key: resolve_string(&p.key, &var_map, &mut unresolved_set),
                value: resolve_string(&p.value, &var_map, &mut unresolved_set),
                description: p.description.clone(),
                enabled: p.enabled,
            }
        })
        .collect();

    let resolved_headers = request
        .headers
        .iter()
        .map(|h| {
            if !h.enabled {
                return h.clone();
            }
            KeyValueItem {
                id: h.id.clone(),
                key: resolve_string(&h.key, &var_map, &mut unresolved_set),
                value: resolve_string(&h.value, &var_map, &mut unresolved_set),
                description: h.description.clone(),
                enabled: h.enabled,
            }
        })
        .collect();

    let resolved_body = RequestBody {
        mode: request.body.mode.clone(),
        raw: if request.body.mode == "json" || request.body.mode == "raw" {
            resolve_string(&request.body.raw, &var_map, &mut unresolved_set)
        } else {
            request.body.raw.clone()
        },
        urlencoded: request
            .body
            .urlencoded
            .iter()
            .map(|item| {
                if !item.enabled {
                    return item.clone();
                }
                KeyValueItem {
                    id: item.id.clone(),
                    key: resolve_string(&item.key, &var_map, &mut unresolved_set),
                    value: resolve_string(&item.value, &var_map, &mut unresolved_set),
                    description: item.description.clone(),
                    enabled: item.enabled,
                }
            })
            .collect(),
        formdata: request
            .body
            .formdata
            .iter()
            .map(|field| {
                if !field.enabled {
                    return field.clone();
                }
                MultipartField {
                    id: field.id.clone(),
                    key: resolve_string(&field.key, &var_map, &mut unresolved_set),
                    value: resolve_string(&field.value, &var_map, &mut unresolved_set),
                    field_type: field.field_type.clone(),
                    file_name: field.file_name.clone(),
                    enabled: field.enabled,
                }
            })
            .collect(),
    };

    let resolved_auth = match request.auth.auth_type.as_str() {
        "bearer" => AuthConfig {
            auth_type: "bearer".to_string(),
            bearer_token: resolve_string(&request.auth.bearer_token, &var_map, &mut unresolved_set),
            ..request.auth.clone()
        },
        "basic" => AuthConfig {
            auth_type: "basic".to_string(),
            basic_username: resolve_string(
                &request.auth.basic_username,
                &var_map,
                &mut unresolved_set,
            ),
            basic_password: resolve_string(
                &request.auth.basic_password,
                &var_map,
                &mut unresolved_set,
            ),
            ..request.auth.clone()
        },
        "apikey" => AuthConfig {
            auth_type: "apikey".to_string(),
            api_key_name: resolve_string(
                &request.auth.api_key_name,
                &var_map,
                &mut unresolved_set,
            ),
            api_key_value: resolve_string(
                &request.auth.api_key_value,
                &var_map,
                &mut unresolved_set,
            ),
            ..request.auth.clone()
        },
        _ => request.auth.clone(),
    };

    let mut unresolved: Vec<String> = unresolved_set.into_iter().collect();
    unresolved.sort();

    let resolved_req = SavedRequest {
        id: request.id.clone(),
        project_id: request.project_id.clone(),
        folder_id: request.folder_id.clone(),
        name: request.name.clone(),
        method: request.method.clone(),
        url: resolved_url,
        params: resolved_params,
        headers: resolved_headers,
        body: resolved_body,
        auth: resolved_auth,
        timeout_ms: request.timeout_ms,
        sort_order: request.sort_order,
        created_at: request.created_at.clone(),
        updated_at: request.updated_at.clone(),
    };

    (resolved_req, unresolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_and_resolve_variables() {
        let vars = vec![
            EnvironmentVariable {
                id: "1".to_string(),
                key: "BASE_URL".to_string(),
                value: "https://api.example.com".to_string(),
                enabled: true,
            },
            EnvironmentVariable {
                id: "2".to_string(),
                key: "USER_ID".to_string(),
                value: "42".to_string(),
                enabled: true,
            },
            EnvironmentVariable {
                id: "3".to_string(),
                key: "DISABLED_VAR".to_string(),
                value: "secret".to_string(),
                enabled: false,
            },
        ];

        let map = build_variable_map(&vars);
        let mut unresolved = HashSet::new();
        let output = resolve_string(
            "{{BASE_URL}}/v1/users/{{USER_ID}}?missing={{UNKNOWN}}&off={{DISABLED_VAR}}",
            &map,
            &mut unresolved,
        );

        assert_eq!(
            output,
            "https://api.example.com/v1/users/42?missing={{UNKNOWN}}&off={{DISABLED_VAR}}"
        );
        assert!(unresolved.contains("UNKNOWN"));
        assert!(unresolved.contains("DISABLED_VAR"));
        assert_eq!(unresolved.len(), 2);
    }
}

