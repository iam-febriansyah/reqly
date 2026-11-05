use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use crate::database::Database;
use crate::models::{HistoryEntry, SavedRequest};

const MAX_HISTORY_ENTRIES_PER_PROJECT: i64 = 150;

pub fn record_history_entry(
    db: &Database,
    project_id: &str,
    method: &str,
    url: &str,
    status_code: Option<u16>,
    duration_ms: u64,
    response_size: usize,
    request_snapshot: &SavedRequest,
) -> Result<HistoryEntry, String> {
    let id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let snapshot_json = serde_json::to_string(request_snapshot).map_err(|e| e.to_string())?;

    let conn = db
        .conn
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;

    conn.execute(
        "INSERT INTO history (
            id, project_id, method, url, status_code, duration_ms, response_size, timestamp, request_snapshot_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            project_id,
            method,
            url,
            status_code.map(|s| s as i64),
            duration_ms as i64,
            response_size as i64,
            timestamp,
            snapshot_json
        ],
    )
    .map_err(|e| e.to_string())?;

    // Keep history bounded per project so local database remains lightweight
    conn.execute(
        "DELETE FROM history
         WHERE project_id = ?1
           AND id NOT IN (
               SELECT id FROM history
               WHERE project_id = ?1
               ORDER BY timestamp DESC
               LIMIT ?2
           )",
        params![project_id, MAX_HISTORY_ENTRIES_PER_PROJECT],
    )
    .map_err(|e| e.to_string())?;

    Ok(HistoryEntry {
        id,
        project_id: project_id.to_string(),
        method: method.to_string(),
        url: url.to_string(),
        status_code,
        duration_ms,
        response_size,
        timestamp,
        request_snapshot: request_snapshot.clone(),
    })
}

pub fn clear_project_history(db: &Database, project_id: &str) -> Result<(), String> {
    let conn = db
        .conn
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "DELETE FROM history WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_history_entry(db: &Database, entry_id: &str) -> Result<(), String> {
    let conn = db
        .conn
        .lock()
        .map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute("DELETE FROM history WHERE id = ?1", params![entry_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

