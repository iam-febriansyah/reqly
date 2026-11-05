use std::sync::Arc;
use tauri::State;

use crate::database::Database;
use crate::history::{clear_project_history, delete_history_entry, record_history_entry};
use crate::http_client::{execute_http_request, CancellationRegistry};
use crate::models::{
    Environment, Folder, HistoryEntry, HttpResponseData, Project, ProjectWorkspaceData,
    SavedRequest,
};
use crate::postman::{export_project_to_postman_v21, import_postman_collection};
use crate::variables::resolve_request;

pub struct AppState {
    pub db: Arc<Database>,
    pub cancellation: Arc<CancellationRegistry>,
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    state.db.list_projects()
}

#[tauri::command]
pub fn load_project_workspace(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ProjectWorkspaceData, String> {
    state.db.load_project_workspace(&project_id)
}

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    name: String,
    description: String,
) -> Result<Project, String> {
    state.db.create_project(&name, &description)
}

#[tauri::command]
pub fn update_project(
    state: State<'_, AppState>,
    project_id: String,
    name: String,
    description: String,
    active_environment_id: Option<String>,
) -> Result<Project, String> {
    state
        .db
        .update_project(&project_id, &name, &description, active_environment_id)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    state.db.delete_project(&project_id)
}

#[tauri::command]
pub fn create_folder(
    state: State<'_, AppState>,
    project_id: String,
    parent_id: Option<String>,
    name: String,
) -> Result<Folder, String> {
    state.db.create_folder(&project_id, parent_id, &name)
}

#[tauri::command]
pub fn rename_folder(
    state: State<'_, AppState>,
    folder_id: String,
    name: String,
) -> Result<(), String> {
    state.db.rename_folder(&folder_id, &name)
}

#[tauri::command]
pub fn delete_folder(state: State<'_, AppState>, folder_id: String) -> Result<(), String> {
    state.db.delete_folder(&folder_id)
}

#[tauri::command]
pub fn save_request(
    state: State<'_, AppState>,
    request: SavedRequest,
) -> Result<SavedRequest, String> {
    state.db.save_request(&request)
}

#[tauri::command]
pub fn duplicate_request(
    state: State<'_, AppState>,
    request_id: String,
) -> Result<SavedRequest, String> {
    state.db.duplicate_request(&request_id)
}

#[tauri::command]
pub fn move_request(
    state: State<'_, AppState>,
    request_id: String,
    target_folder_id: Option<String>,
    sort_order: i64,
) -> Result<(), String> {
    state
        .db
        .move_request(&request_id, target_folder_id, sort_order)
}

#[tauri::command]
pub fn reorder_requests(
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    state.db.reorder_requests(&ordered_ids)
}

#[tauri::command]
pub fn delete_request(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    state.db.delete_request(&request_id)
}

#[tauri::command]
pub fn save_environment(
    state: State<'_, AppState>,
    environment: Environment,
) -> Result<Environment, String> {
    state.db.save_environment(&environment)
}

#[tauri::command]
pub fn delete_environment(state: State<'_, AppState>, environment_id: String) -> Result<(), String> {
    state.db.delete_environment(&environment_id)
}

#[tauri::command]
pub fn preview_resolved_request(
    state: State<'_, AppState>,
    project_id: String,
    request: SavedRequest,
) -> Result<(SavedRequest, Vec<String>), String> {
    let vars = state.db.get_active_environment_variables(&project_id)?;
    Ok(resolve_request(&request, &vars))
}

#[tauri::command]
pub async fn send_http_request(
    state: State<'_, AppState>,
    project_id: String,
    request: SavedRequest,
) -> Result<HttpResponseData, String> {
    let env_vars = state.db.get_active_environment_variables(&project_id)?;
    let cancel_rx = state.cancellation.register(&request.id);

    let result = execute_http_request(&request, &env_vars, cancel_rx).await;
    state.cancellation.unregister(&request.id);

    match &result {
        Ok(resp) => {
            let _ = record_history_entry(
                &state.db,
                &project_id,
                &request.method,
                &resp.resolved_url,
                Some(resp.status),
                resp.duration_ms,
                resp.size_bytes,
                &request,
            );
        }
        Err(err_msg) => {
            if !err_msg.contains("cancelled") {
                let (resolved, _) = resolve_request(&request, &env_vars);
                let _ = record_history_entry(
                    &state.db,
                    &project_id,
                    &request.method,
                    &resolved.url,
                    None,
                    0,
                    0,
                    &request,
                );
            }
        }
    }

    result
}

#[tauri::command]
pub fn cancel_http_request(state: State<'_, AppState>, request_id: String) -> Result<bool, String> {
    Ok(state.cancellation.cancel(&request_id))
}

#[tauri::command]
pub fn list_history(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<HistoryEntry>, String> {
    state.db.list_history(&project_id, 100)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    clear_project_history(&state.db, &project_id)
}

#[tauri::command]
pub fn remove_history_item(state: State<'_, AppState>, entry_id: String) -> Result<(), String> {
    delete_history_entry(&state.db, &entry_id)
}

#[tauri::command]
pub fn export_postman_collection(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    let ws = state.db.load_project_workspace(&project_id)?;
    export_project_to_postman_v21(&ws.project, &ws.folders, &ws.requests, &ws.environments)
}

#[tauri::command]
pub fn import_postman_collection_cmd(
    state: State<'_, AppState>,
    json_content: String,
) -> Result<Project, String> {
    import_postman_collection(&state.db, &json_content)
}

