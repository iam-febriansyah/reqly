use std::path::Path;
use std::sync::Mutex;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::models::{
    AuthConfig, Environment, EnvironmentVariable, Folder, HistoryEntry, KeyValueItem, Project,
    ProjectWorkspaceData, RequestBody, SavedRequest,
};

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
        }
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn new_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to open in-memory database: {}", e))?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                active_environment_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                parent_id TEXT,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                folder_id TEXT,
                name TEXT NOT NULL,
                method TEXT NOT NULL DEFAULT 'GET',
                url TEXT NOT NULL DEFAULT '',
                params_json TEXT NOT NULL DEFAULT '[]',
                headers_json TEXT NOT NULL DEFAULT '[]',
                body_json TEXT NOT NULL DEFAULT '{\"mode\":\"none\"}',
                auth_json TEXT NOT NULL DEFAULT '{\"type\":\"none\"}',
                timeout_ms INTEGER NOT NULL DEFAULT 30000,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS environments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                variables_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                status_code INTEGER,
                duration_ms INTEGER NOT NULL,
                response_size INTEGER NOT NULL DEFAULT 0,
                timestamp TEXT NOT NULL,
                request_snapshot_json TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id, sort_order);
            CREATE INDEX IF NOT EXISTS idx_requests_project ON requests(project_id, sort_order);
            CREATE INDEX IF NOT EXISTS idx_envs_project ON environments(project_id);
            CREATE INDEX IF NOT EXISTS idx_history_project ON history(project_id, timestamp DESC);
            ",
        )
        .map_err(|e| format!("Failed to initialize SQLite schema: {}", e))?;
        Ok(())
    }

    fn seed_if_empty(&self) -> Result<(), String> {
        let count: i64 = {
            let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
            conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
                .map_err(|e| e.to_string())?
        };

        if count > 0 {
            return Ok(());
        }

        let now = Utc::now().to_rfc3339();
        let project_id = Uuid::new_v4().to_string();
        let prod_env_id = Uuid::new_v4().to_string();
        let dev_env_id = Uuid::new_v4().to_string();

        let prod_vars = vec![
            EnvironmentVariable {
                id: Uuid::new_v4().to_string(),
                key: "BASE_URL".to_string(),
                value: "https://jsonplaceholder.typicode.com".to_string(),
                enabled: true,
            },
            EnvironmentVariable {
                id: Uuid::new_v4().to_string(),
                key: "API_TOKEN".to_string(),
                value: "prod-demo-token-9001".to_string(),
                enabled: true,
            },
            EnvironmentVariable {
                id: Uuid::new_v4().to_string(),
                key: "USER_ID".to_string(),
                value: "1".to_string(),
                enabled: true,
            },
        ];

        let dev_vars = vec![
            EnvironmentVariable {
                id: Uuid::new_v4().to_string(),
                key: "BASE_URL".to_string(),
                value: "http://localhost:8000".to_string(),
                enabled: true,
            },
            EnvironmentVariable {
                id: Uuid::new_v4().to_string(),
                key: "API_TOKEN".to_string(),
                value: "dev-token-local".to_string(),
                enabled: true,
            },
            EnvironmentVariable {
                id: Uuid::new_v4().to_string(),
                key: "USER_ID".to_string(),
                value: "1001".to_string(),
                enabled: true,
            },
        ];

        let users_folder_id = Uuid::new_v4().to_string();
        let posts_folder_id = Uuid::new_v4().to_string();

        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "INSERT INTO projects (id, name, description, active_environment_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                project_id,
                "Core Platform API",
                "Starter workspace with sample endpoints and environments",
                prod_env_id,
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO environments (id, project_id, name, variables_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                prod_env_id,
                project_id,
                "Production (JSONPlaceholder)",
                serde_json::to_string(&prod_vars).unwrap_or_else(|_| "[]".to_string()),
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO environments (id, project_id, name, variables_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                dev_env_id,
                project_id,
                "Development (Localhost)",
                serde_json::to_string(&dev_vars).unwrap_or_else(|_| "[]".to_string()),
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_at)
             VALUES (?1, ?2, NULL, ?3, 0, ?4)",
            params![users_folder_id, project_id, "Users", now],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_at)
             VALUES (?1, ?2, NULL, ?3, 1, ?4)",
            params![posts_folder_id, project_id, "Posts", now],
        )
        .map_err(|e| e.to_string())?;

        drop(conn);

        // Seed sample requests
        let req1 = SavedRequest {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            folder_id: Some(users_folder_id.clone()),
            name: "Get User Profile".to_string(),
            method: "GET".to_string(),
            url: "{{BASE_URL}}/users/{{USER_ID}}".to_string(),
            params: vec![],
            headers: vec![KeyValueItem {
                id: Uuid::new_v4().to_string(),
                key: "Accept".to_string(),
                value: "application/json".to_string(),
                description: "JSON response format".to_string(),
                enabled: true,
            }],
            body: RequestBody::default(),
            auth: AuthConfig {
                auth_type: "bearer".to_string(),
                bearer_token: "{{API_TOKEN}}".to_string(),
                ..Default::default()
            },
            timeout_ms: 30000,
            sort_order: 0,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        let req2 = SavedRequest {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            folder_id: Some(users_folder_id.clone()),
            name: "Create User".to_string(),
            method: "POST".to_string(),
            url: "{{BASE_URL}}/users".to_string(),
            params: vec![],
            headers: vec![KeyValueItem {
                id: Uuid::new_v4().to_string(),
                key: "Content-Type".to_string(),
                value: "application/json".to_string(),
                description: "".to_string(),
                enabled: true,
            }],
            body: RequestBody {
                mode: "json".to_string(),
                raw: "{\n  \"name\": \"Ada Lovelace\",\n  \"username\": \"ada\",\n  \"email\": \"ada@analytical.engine\"\n}".to_string(),
                urlencoded: vec![],
                formdata: vec![],
            },
            auth: AuthConfig {
                auth_type: "bearer".to_string(),
                bearer_token: "{{API_TOKEN}}".to_string(),
                ..Default::default()
            },
            timeout_ms: 30000,
            sort_order: 1,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        let req3 = SavedRequest {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            folder_id: Some(posts_folder_id),
            name: "List Posts".to_string(),
            method: "GET".to_string(),
            url: "{{BASE_URL}}/posts".to_string(),
            params: vec![KeyValueItem {
                id: Uuid::new_v4().to_string(),
                key: "userId".to_string(),
                value: "{{USER_ID}}".to_string(),
                description: "Filter posts by user ID".to_string(),
                enabled: true,
            }],
            headers: vec![],
            body: RequestBody::default(),
            auth: AuthConfig::default(),
            timeout_ms: 30000,
            sort_order: 2,
            created_at: now.clone(),
            updated_at: now,
        };

        self.save_request(&req1)?;
        self.save_request(&req2)?;
        self.save_request(&req3)?;

        Ok(())
    }

    // ==================== PROJECTS ====================

    pub fn list_projects(&self) -> Result<Vec<Project>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, active_environment_id, created_at, updated_at
                 FROM projects ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    active_environment_id: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_project(&self, project_id: &str) -> Result<Project, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.query_row(
            "SELECT id, name, description, active_environment_id, created_at, updated_at
             FROM projects WHERE id = ?1",
            params![project_id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    active_environment_id: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Project not found: {}", e))
    }

    pub fn create_project(&self, name: &str, description: &str) -> Result<Project, String> {
        let now = Utc::now().to_rfc3339();
        let project_id = Uuid::new_v4().to_string();
        let env_id = Uuid::new_v4().to_string();

        let default_vars = vec![EnvironmentVariable {
            id: Uuid::new_v4().to_string(),
            key: "BASE_URL".to_string(),
            value: "http://localhost:8000".to_string(),
            enabled: true,
        }];

        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "INSERT INTO projects (id, name, description, active_environment_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![project_id, name.trim(), description.trim(), env_id, now, now],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO environments (id, project_id, name, variables_json, created_at, updated_at)
             VALUES (?1, ?2, 'Development', ?3, ?4, ?5)",
            params![
                env_id,
                project_id,
                serde_json::to_string(&default_vars).unwrap_or_else(|_| "[]".to_string()),
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(Project {
            id: project_id,
            name: name.trim().to_string(),
            description: description.trim().to_string(),
            active_environment_id: Some(env_id),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_project(
        &self,
        project_id: &str,
        name: &str,
        description: &str,
        active_environment_id: Option<String>,
    ) -> Result<Project, String> {
        let now = Utc::now().to_rfc3339();
        {
            let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
            conn.execute(
                "UPDATE projects
                 SET name = ?1, description = ?2, active_environment_id = ?3, updated_at = ?4
                 WHERE id = ?5",
                params![
                    name.trim(),
                    description.trim(),
                    active_environment_id,
                    now,
                    project_id
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        self.get_project(project_id)
    }

    pub fn delete_project(&self, project_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_project_workspace(&self, project_id: &str) -> Result<ProjectWorkspaceData, String> {
        let project = self.get_project(project_id)?;
        let folders = self.list_folders(project_id)?;
        let requests = self.list_requests(project_id)?;
        let environments = self.list_environments(project_id)?;
        let history = self.list_history(project_id, 100)?;
        Ok(ProjectWorkspaceData {
            project,
            folders,
            requests,
            environments,
            history,
        })
    }

    // ==================== FOLDERS ====================

    pub fn list_folders(&self, project_id: &str) -> Result<Vec<Folder>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, parent_id, name, sort_order, created_at
                 FROM folders WHERE project_id = ?1
                 ORDER BY sort_order ASC, created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    parent_id: row.get(2)?,
                    name: row.get(3)?,
                    sort_order: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn create_folder(
        &self,
        project_id: &str,
        parent_id: Option<String>,
        name: &str,
    ) -> Result<Folder, String> {
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;

        let max_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM folders WHERE project_id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let sort_order = max_order + 1;
        conn.execute(
            "INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, project_id, parent_id, name.trim(), sort_order, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(Folder {
            id,
            project_id: project_id.to_string(),
            parent_id,
            name: name.trim().to_string(),
            sort_order,
            created_at: now,
        })
    }

    pub fn rename_folder(&self, folder_id: &str, name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "UPDATE folders SET name = ?1 WHERE id = ?2",
            params![name.trim(), folder_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_folder(&self, folder_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        // Also delete requests directly inside the folder
        conn.execute(
            "DELETE FROM requests WHERE folder_id = ?1",
            params![folder_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ==================== REQUESTS ====================

    pub fn list_requests(&self, project_id: &str) -> Result<Vec<SavedRequest>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, folder_id, name, method, url,
                        params_json, headers_json, body_json, auth_json,
                        timeout_ms, sort_order, created_at, updated_at
                 FROM requests
                 WHERE project_id = ?1
                 ORDER BY sort_order ASC, created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                let params_str: String = row.get(6)?;
                let headers_str: String = row.get(7)?;
                let body_str: String = row.get(8)?;
                let auth_str: String = row.get(9)?;
                let timeout_i64: i64 = row.get(10)?;

                Ok(SavedRequest {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    folder_id: row.get(2)?,
                    name: row.get(3)?,
                    method: row.get(4)?,
                    url: row.get(5)?,
                    params: serde_json::from_str(&params_str).unwrap_or_default(),
                    headers: serde_json::from_str(&headers_str).unwrap_or_default(),
                    body: serde_json::from_str(&body_str).unwrap_or_default(),
                    auth: serde_json::from_str(&auth_str).unwrap_or_default(),
                    timeout_ms: timeout_i64.max(1000) as u64,
                    sort_order: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_request(&self, req: &SavedRequest) -> Result<SavedRequest, String> {
        let now = Utc::now().to_rfc3339();
        let params_json = serde_json::to_string(&req.params).map_err(|e| e.to_string())?;
        let headers_json = serde_json::to_string(&req.headers).map_err(|e| e.to_string())?;
        let body_json = serde_json::to_string(&req.body).map_err(|e| e.to_string())?;
        let auth_json = serde_json::to_string(&req.auth).map_err(|e| e.to_string())?;

        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM requests WHERE id = ?1",
                params![req.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let created_at = if exists.is_some() {
            req.created_at.clone()
        } else if req.created_at.is_empty() {
            now.clone()
        } else {
            req.created_at.clone()
        };

        conn.execute(
            "INSERT INTO requests (
                id, project_id, folder_id, name, method, url,
                params_json, headers_json, body_json, auth_json,
                timeout_ms, sort_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(id) DO UPDATE SET
                folder_id = excluded.folder_id,
                name = excluded.name,
                method = excluded.method,
                url = excluded.url,
                params_json = excluded.params_json,
                headers_json = excluded.headers_json,
                body_json = excluded.body_json,
                auth_json = excluded.auth_json,
                timeout_ms = excluded.timeout_ms,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at",
            params![
                req.id,
                req.project_id,
                req.folder_id,
                req.name,
                req.method,
                req.url,
                params_json,
                headers_json,
                body_json,
                auth_json,
                req.timeout_ms as i64,
                req.sort_order,
                created_at,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        let mut updated = req.clone();
        updated.created_at = created_at;
        updated.updated_at = now;
        Ok(updated)
    }

    pub fn duplicate_request(&self, request_id: &str) -> Result<SavedRequest, String> {
        let original = {
            let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
            conn.query_row(
                "SELECT id, project_id, folder_id, name, method, url,
                        params_json, headers_json, body_json, auth_json,
                        timeout_ms, sort_order, created_at, updated_at
                 FROM requests WHERE id = ?1",
                params![request_id],
                |row| {
                    let params_str: String = row.get(6)?;
                    let headers_str: String = row.get(7)?;
                    let body_str: String = row.get(8)?;
                    let auth_str: String = row.get(9)?;
                    let timeout_i64: i64 = row.get(10)?;
                    Ok(SavedRequest {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        folder_id: row.get(2)?,
                        name: row.get(3)?,
                        method: row.get(4)?,
                        url: row.get(5)?,
                        params: serde_json::from_str(&params_str).unwrap_or_default(),
                        headers: serde_json::from_str(&headers_str).unwrap_or_default(),
                        body: serde_json::from_str(&body_str).unwrap_or_default(),
                        auth: serde_json::from_str(&auth_str).unwrap_or_default(),
                        timeout_ms: timeout_i64.max(1000) as u64,
                        sort_order: row.get(11)?,
                        created_at: row.get(12)?,
                        updated_at: row.get(13)?,
                    })
                },
            )
            .map_err(|e| format!("Request not found: {}", e))?
        };

        let now = Utc::now().to_rfc3339();
        let copy = SavedRequest {
            id: Uuid::new_v4().to_string(),
            name: format!("{} Copy", original.name),
            sort_order: original.sort_order + 1,
            created_at: now.clone(),
            updated_at: now,
            ..original
        };

        self.save_request(&copy)
    }

    pub fn move_request(
        &self,
        request_id: &str,
        target_folder_id: Option<String>,
        sort_order: i64,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "UPDATE requests SET folder_id = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4",
            params![target_folder_id, sort_order, now, request_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn reorder_requests(&self, ordered_ids: &[String]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (idx, req_id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE requests SET sort_order = ?1 WHERE id = ?2",
                params![idx as i64, req_id],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_request(&self, request_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute("DELETE FROM requests WHERE id = ?1", params![request_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ==================== ENVIRONMENTS ====================

    pub fn list_environments(&self, project_id: &str) -> Result<Vec<Environment>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, variables_json, created_at, updated_at
                 FROM environments WHERE project_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                let vars_str: String = row.get(3)?;
                Ok(Environment {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    variables: serde_json::from_str(&vars_str).unwrap_or_default(),
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            list.push(item.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_active_environment_variables(
        &self,
        project_id: &str,
    ) -> Result<Vec<EnvironmentVariable>, String> {
        let project = self.get_project(project_id)?;
        let Some(env_id) = project.active_environment_id else {
            return Ok(vec![]);
        };
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let vars_json: Option<String> = conn
            .query_row(
                "SELECT variables_json FROM environments WHERE id = ?1 AND project_id = ?2",
                params![env_id, project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        match vars_json {
            Some(json) => Ok(serde_json::from_str(&json).unwrap_or_default()),
            None => Ok(vec![]),
        }
    }

    pub fn save_environment(&self, env: &Environment) -> Result<Environment, String> {
        let now = Utc::now().to_rfc3339();
        let vars_json = serde_json::to_string(&env.variables).map_err(|e| e.to_string())?;
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;

        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM environments WHERE id = ?1",
                params![env.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let created_at = if exists.is_some() {
            env.created_at.clone()
        } else if env.created_at.is_empty() {
            now.clone()
        } else {
            env.created_at.clone()
        };

        conn.execute(
            "INSERT INTO environments (id, project_id, name, variables_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                variables_json = excluded.variables_json,
                updated_at = excluded.updated_at",
            params![
                env.id,
                env.project_id,
                env.name.trim(),
                vars_json,
                created_at,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        let mut updated = env.clone();
        updated.name = env.name.trim().to_string();
        updated.created_at = created_at;
        updated.updated_at = now;
        Ok(updated)
    }

    pub fn delete_environment(&self, env_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        conn.execute(
            "UPDATE projects SET active_environment_id = NULL WHERE active_environment_id = ?1",
            params![env_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM environments WHERE id = ?1", params![env_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ==================== HISTORY ====================

    pub fn list_history(&self, project_id: &str, limit: usize) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.conn.lock().map_err(|_| "Database lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, method, url, status_code, duration_ms, response_size, timestamp, request_snapshot_json
                 FROM history
                 WHERE project_id = ?1
                 ORDER BY timestamp DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![project_id, limit as i64], |row| {
                let status_opt: Option<i64> = row.get(4)?;
                let duration_i64: i64 = row.get(5)?;
                let size_i64: i64 = row.get(6)?;
                let snapshot_str: String = row.get(8)?;
                let snapshot: SavedRequest = serde_json::from_str(&snapshot_str).map_err(|_| {
                    rusqlite::Error::InvalidColumnType(
                        8,
                        "request_snapshot_json".to_string(),
                        rusqlite::types::Type::Text,
                    )
                })?;

                Ok(HistoryEntry {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    method: row.get(2)?,
                    url: row.get(3)?,
                    status_code: status_opt.map(|s| s as u16),
                    duration_ms: duration_i64.max(0) as u64,
                    response_size: size_i64.max(0) as usize,
                    timestamp: row.get(7)?,
                    request_snapshot: snapshot,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for item in rows {
            if let Ok(entry) = item {
                list.push(entry);
            }
        }
        Ok(list)
    }
}
