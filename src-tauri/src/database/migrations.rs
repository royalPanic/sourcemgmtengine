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
        Migration {
            version: 2,
            description: "add_events_and_source_stance",
            sql: r#"
                -- A container is either a plain case or a dated event. Events reuse
                -- every case capability (notes, sources, attachments) and add a
                -- user-editable date/time plus per-source stance.
                ALTER TABLE cases ADD COLUMN kind TEXT NOT NULL DEFAULT 'case'
                    CHECK (kind IN ('case','event'));

                -- Calendar date (YYYY-MM-DD) and optional wall-clock time (HH:MM).
                -- Stored as text so they stay human-readable and timezone-free.
                ALTER TABLE cases ADD COLUMN event_date TEXT;
                ALTER TABLE cases ADD COLUMN event_time TEXT;

                -- How a source bears on its event. NULL means "none / not applicable",
                -- which is also the only valid value for sources on plain cases.
                ALTER TABLE sources ADD COLUMN stance TEXT
                    CHECK (stance IN ('supports','refutes','neutral'));

                CREATE INDEX IF NOT EXISTS idx_cases_kind ON cases(kind);
                CREATE INDEX IF NOT EXISTS idx_cases_event_date ON cases(event_date);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_source_date_time",
            sql: r#"
                -- Sources may carry their own optional date/time, independent of
                -- the container's event date. Same text shapes as `cases`:
                -- calendar date (YYYY-MM-DD) and wall-clock time (HH:MM).
                ALTER TABLE sources ADD COLUMN source_date TEXT;
                ALTER TABLE sources ADD COLUMN source_time TEXT;

                CREATE INDEX IF NOT EXISTS idx_sources_source_date ON sources(source_date);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
