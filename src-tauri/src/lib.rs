pub mod commands;
pub mod database;
pub mod history;
pub mod http_client;
pub mod models;
pub mod postman;
pub mod variables;

use std::sync::Arc;
use tauri::Manager;

use commands::AppState;
use database::Database;
use http_client::CancellationRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
            let db_path = app_data_dir.join("reqly.db");
            let db = Database::new(&db_path)
                .expect("Failed to initialize Reqly local SQLite database");

            app.manage(AppState {
                db: Arc::new(db),
                cancellation: Arc::new(CancellationRegistry::new()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::load_project_workspace,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::create_folder,
            commands::rename_folder,
            commands::delete_folder,
            commands::save_request,
            commands::duplicate_request,
            commands::move_request,
            commands::reorder_requests,
            commands::delete_request,
            commands::save_environment,
            commands::delete_environment,
            commands::preview_resolved_request,
            commands::send_http_request,
            commands::cancel_http_request,
            commands::list_history,
            commands::clear_history,
            commands::remove_history_item,
            commands::export_postman_collection,
            commands::import_postman_collection_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reqly desktop application");
}

