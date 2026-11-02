use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: r#"
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS cases (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS case_notes (
                    id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL UNIQUE,
                    content TEXT DEFAULT '',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source_type TEXT DEFAULT 'URL',
                    url TEXT,
                    raw_text TEXT,
                    reliability_code CHAR(1) CHECK (reliability_code IN ('A','B','C','D','E','F')),
                    credibility_code INT CHECK (credibility_code BETWEEN 1 AND 6),
                    custom_metadata TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS source_attachments (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    mime_type TEXT,
                    file_size INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_sources_case_id ON sources(case_id);
                CREATE INDEX IF NOT EXISTS idx_source_attachments_source_id ON source_attachments(source_id);
                CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON cases(updated_at DESC);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
