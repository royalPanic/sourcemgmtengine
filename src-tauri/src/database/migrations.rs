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
        Migration {
            version: 4,
            description: "add_meta_sources_and_source_references",
            sql: r#"
                -- Meta sources are the people and organisations behind the
                -- reporting: a news agency, an official, a spokesperson. They
                -- are global rather than per-case, so one entity is described
                -- once and can be cited from any case or event.
                CREATE TABLE IF NOT EXISTS meta_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'organization'
                        CHECK (kind IN ('person','organization','other')),
                    description TEXT,
                    url TEXT,
                    reliability_code CHAR(1) CHECK (reliability_code IN ('A','B','C','D','E','F')),
                    credibility_code INT CHECK (credibility_code BETWEEN 1 AND 6),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                -- A source may cite either a sibling source in the same
                -- container or a global meta source. ON DELETE SET NULL keeps
                -- the citing source (and the rating it inherited) alive when
                -- the thing it cites is removed.
                ALTER TABLE sources ADD COLUMN reference_source_id TEXT
                    REFERENCES sources(id) ON DELETE SET NULL;
                ALTER TABLE sources ADD COLUMN reference_meta_source_id TEXT
                    REFERENCES meta_sources(id) ON DELETE SET NULL;

                -- SQLite cannot add a CHECK constraint with ALTER TABLE, so the
                -- "one reference, not both" rule is enforced with triggers.
                -- `update_source` also enforces it, but the schema is the last
                -- line of defence for any future writer.
                CREATE TRIGGER IF NOT EXISTS sources_reference_exclusive_insert
                BEFORE INSERT ON sources
                WHEN NEW.reference_source_id IS NOT NULL
                 AND NEW.reference_meta_source_id IS NOT NULL
                BEGIN
                    SELECT RAISE(ABORT, 'A source may reference a source or a meta source, not both');
                END;

                CREATE TRIGGER IF NOT EXISTS sources_reference_exclusive_update
                BEFORE UPDATE ON sources
                WHEN NEW.reference_source_id IS NOT NULL
                 AND NEW.reference_meta_source_id IS NOT NULL
                BEGIN
                    SELECT RAISE(ABORT, 'A source may reference a source or a meta source, not both');
                END;

                CREATE INDEX IF NOT EXISTS idx_sources_reference_source_id
                    ON sources(reference_source_id);
                CREATE INDEX IF NOT EXISTS idx_sources_reference_meta_source_id
                    ON sources(reference_meta_source_id);
                CREATE INDEX IF NOT EXISTS idx_meta_sources_name ON meta_sources(name);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_opentimestamps_records",
            sql: r#"
                -- OpenTimestamps chronological proofs for evidence attachments.
                -- Each attachment can have one timestamp proof (.ots file) stored
                -- alongside it, with a status tracking Bitcoin confirmation.
                CREATE TABLE IF NOT EXISTS source_timestamp (
                    id TEXT PRIMARY KEY,
                    source_attachment_id TEXT NOT NULL UNIQUE,
                    ots_path TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','failed')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    confirmed_at DATETIME,
                    FOREIGN KEY (source_attachment_id) REFERENCES source_attachments(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_source_timestamp_attachment
                    ON source_timestamp(source_attachment_id);
                CREATE INDEX IF NOT EXISTS idx_source_timestamp_status
                    ON source_timestamp(status);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_entities_and_qualities",
            sql: r#"
                -- Entities are typed, reusable objects (people, organizations,
                -- vehicles, nations, governments, etc.) that sit between
                -- cases/events and sources. They can be global (available to
                -- every container) or tied to a single case or event.
                CREATE TABLE IF NOT EXISTS entities (
                    id TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    case_id TEXT,
                    is_global INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );

                -- Qualities are user-defined attributes on an entity. Each
                -- quality has a name, a data type, and a typed value. A
                -- quality may reference one or more sources as provenance,
                -- and displays the referenced sources' Admiralty ratings.
                CREATE TABLE IF NOT EXISTS entity_qualities (
                    id TEXT PRIMARY KEY,
                    entity_id TEXT NOT NULL,
                    quality_name TEXT NOT NULL,
                    quality_type TEXT NOT NULL
                        CHECK (quality_type IN ('string','boolean','integer','date','coordinates','address')),
                    value_string TEXT,
                    value_integer INTEGER,
                    value_boolean INTEGER,
                    value_date TEXT,
                    value_coordinates TEXT,
                    value_address TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
                );

                -- Many-to-many link between qualities and sources as provenance.
                -- Each link carries the Admiralty rating the source had at the
                -- time it was cited, so the quality can show an average.
                CREATE TABLE IF NOT EXISTS quality_source_refs (
                    id TEXT PRIMARY KEY,
                    quality_id TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    reliability_code CHAR(1) CHECK (reliability_code IN ('A','B','C','D','E','F')),
                    credibility_code INT CHECK (credibility_code BETWEEN 1 AND 6),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (quality_id) REFERENCES entity_qualities(id) ON DELETE CASCADE,
                    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_entities_case_id ON entities(case_id);
                CREATE INDEX IF NOT EXISTS idx_entities_is_global ON entities(is_global);
                CREATE INDEX IF NOT EXISTS idx_entities_entity_type ON entities(entity_type);
                CREATE INDEX IF NOT EXISTS idx_entity_qualities_entity_id ON entity_qualities(entity_id);
                CREATE INDEX IF NOT EXISTS idx_quality_source_refs_quality_id ON quality_source_refs(quality_id);
                CREATE INDEX IF NOT EXISTS idx_quality_source_refs_source_id ON quality_source_refs(source_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "unify_meta_sources_into_entities",
            sql: r#"
                -- Sources may now reference an entity directly instead of a
                -- meta source. Entities are global and carry their own
                -- Admiralty reliability via a quality of type 'reliability'.
                ALTER TABLE sources ADD COLUMN reference_entity_id TEXT
                    REFERENCES entities(id) ON DELETE SET NULL;

                -- Allow 'reliability' as a quality type so an entity can
                -- expose an Admiralty rating that propagates to citing sources.
                -- SQLite cannot alter a CHECK constraint in place, so the
                -- constraint is effectively replaced by the new migration
                -- path; existing rows keep their current values.
                CREATE INDEX IF NOT EXISTS idx_sources_reference_entity_id
                    ON sources(reference_entity_id);

                -- Replace the old reference exclusivity triggers: a source may
                -- reference a source OR an entity, not both. Meta sources are
                -- gone, so reference_meta_source_id is no longer part of the
                -- rule (the column is left in place but unused).
                DROP TRIGGER IF EXISTS sources_reference_exclusive_insert;
                DROP TRIGGER IF EXISTS sources_reference_exclusive_update;

                CREATE TRIGGER IF NOT EXISTS sources_reference_exclusive_insert
                BEFORE INSERT ON sources
                WHEN NEW.reference_source_id IS NOT NULL
                 AND NEW.reference_entity_id IS NOT NULL
                BEGIN
                    SELECT RAISE(ABORT, 'A source may reference a source or an entity, not both');
                END;

                CREATE TRIGGER IF NOT EXISTS sources_reference_exclusive_update
                BEFORE UPDATE ON sources
                WHEN NEW.reference_source_id IS NOT NULL
                 AND NEW.reference_entity_id IS NOT NULL
                BEGIN
                    SELECT RAISE(ABORT, 'A source may reference a source or an entity, not both');
                END;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_reliability_quality_type",
            sql: r#"
                -- Allow 'reliability' as a quality type so an entity can
                -- expose an Admiralty rating that propagates to citing sources.
                -- SQLite cannot alter a CHECK constraint in place, so the
                -- entity_qualities table is recreated with the expanded
                -- constraint; existing rows keep their current values.
                CREATE TABLE IF NOT EXISTS entity_qualities_new (
                    id TEXT PRIMARY KEY,
                    entity_id TEXT NOT NULL,
                    quality_name TEXT NOT NULL,
                    quality_type TEXT NOT NULL
                        CHECK (quality_type IN ('string','boolean','integer','date','coordinates','address','reliability')),
                    value_string TEXT,
                    value_integer INTEGER,
                    value_boolean INTEGER,
                    value_date TEXT,
                    value_coordinates TEXT,
                    value_address TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
                );
                INSERT INTO entity_qualities_new
                    SELECT id, entity_id, quality_name, quality_type, value_string,
                           value_integer, value_boolean, value_date, value_coordinates,
                           value_address, created_at, updated_at
                    FROM entity_qualities;
                DROP TABLE entity_qualities;
                ALTER TABLE entity_qualities_new RENAME TO entity_qualities;
                CREATE INDEX IF NOT EXISTS idx_entity_qualities_entity_id
                    ON entity_qualities(entity_id);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_timestamp_verification_columns",
            sql: r#"
                -- Verification results were previously discarded after each
                -- check, so the UI could only ever show the stored status.
                -- Persisting them lets a proof that was verified on another
                -- machine (or by an earlier run) report what it proved.
                ALTER TABLE source_timestamp ADD COLUMN block_height INTEGER;
                ALTER TABLE source_timestamp ADD COLUMN block_time TEXT;
                ALTER TABLE source_timestamp ADD COLUMN verification_notes TEXT NOT NULL DEFAULT '[]';
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "drop_meta_sources_and_reference_meta_source_id",
            sql: r#"
                -- Meta sources were superseded by entities in v7. The table and
                -- the sources.reference_meta_source_id column have been dead
                -- ever since: nothing reads them, and the v7 triggers were
                -- rewritten to guard reference_entity_id instead.
                --
                -- SQLite cannot drop a column before 3.35 and the bundled
                -- version varies, so `sources` is rebuilt the same way v8
                -- rebuilt `entity_qualities`. The rebuild also gives the
                -- reference-exclusivity triggers a stable column set to guard.
                -- Dropping `sources` cascades to its dependent rows, so save
                -- them in temporary tables and restore them after the rebuild.
                CREATE TEMP TABLE source_attachments_v10_backup AS
                    SELECT * FROM source_attachments;
                CREATE TEMP TABLE source_timestamp_v10_backup AS
                    SELECT * FROM source_timestamp;
                CREATE TEMP TABLE quality_source_refs_v10_backup AS
                    SELECT * FROM quality_source_refs;
                CREATE TEMP TABLE source_references_v10_backup AS
                    SELECT id, reference_source_id FROM sources
                    WHERE reference_source_id IS NOT NULL;

                CREATE TABLE sources_new (
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
                    stance TEXT CHECK (stance IN ('supports','refutes','neutral')),
                    source_date TEXT,
                    source_time TEXT,
                    reference_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
                    reference_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
                    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
                );

                INSERT INTO sources_new (
                    id, case_id, title, source_type, url, raw_text, reliability_code,
                    credibility_code, custom_metadata, created_at, updated_at, stance,
                    source_date, source_time, reference_source_id, reference_entity_id
                )
                SELECT
                    id, case_id, title, source_type, url, raw_text, reliability_code,
                    credibility_code, custom_metadata, created_at, updated_at, stance,
                    source_date, source_time, reference_source_id, reference_entity_id
                FROM sources;

                DROP TABLE sources;
                ALTER TABLE sources_new RENAME TO sources;

                CREATE INDEX IF NOT EXISTS idx_sources_case_id ON sources(case_id);
                CREATE INDEX IF NOT EXISTS idx_sources_source_date ON sources(source_date);
                CREATE INDEX IF NOT EXISTS idx_sources_reference_source_id
                    ON sources(reference_source_id);
                CREATE INDEX IF NOT EXISTS idx_sources_reference_entity_id
                    ON sources(reference_entity_id);

                -- Recreate the exclusivity triggers against the rebuilt table.
                DROP TRIGGER IF EXISTS sources_reference_exclusive_insert;
                DROP TRIGGER IF EXISTS sources_reference_exclusive_update;

                CREATE TRIGGER sources_reference_exclusive_insert
                BEFORE INSERT ON sources
                WHEN NEW.reference_source_id IS NOT NULL
                 AND NEW.reference_entity_id IS NOT NULL
                BEGIN
                    SELECT RAISE(ABORT, 'A source may reference a source or an entity, not both');
                END;

                CREATE TRIGGER sources_reference_exclusive_update
                BEFORE UPDATE ON sources
                WHEN NEW.reference_source_id IS NOT NULL
                 AND NEW.reference_entity_id IS NOT NULL
                BEGIN
                    SELECT RAISE(ABORT, 'A source may reference a source or an entity, not both');
                END;

                -- While the old table is dropped, the new table's source
                -- references still point at it and are set to NULL. Restore
                -- those links now that the rebuilt table is in place.
                UPDATE sources
                SET reference_source_id = (
                    SELECT reference_source_id FROM source_references_v10_backup
                    WHERE source_references_v10_backup.id = sources.id
                )
                WHERE id IN (SELECT id FROM source_references_v10_backup);

                INSERT INTO source_attachments
                    SELECT * FROM source_attachments_v10_backup;
                INSERT INTO source_timestamp
                    SELECT * FROM source_timestamp_v10_backup;
                INSERT INTO quality_source_refs
                    SELECT * FROM quality_source_refs_v10_backup;

                DROP TABLE source_attachments_v10_backup;
                DROP TABLE source_timestamp_v10_backup;
                DROP TABLE quality_source_refs_v10_backup;
                DROP TABLE source_references_v10_backup;

                DROP TABLE IF EXISTS meta_sources;
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add_entity_types",
            sql: r#"
                -- Entity type templates used to be read from JSON files embedded
                -- in the binary at compile time, so the type designer could
                -- edit one in memory but nothing was ever written back. This
                -- table makes a template a first-class record.
                --
                -- `default_qualities` is a JSON array of
                -- {name, type, required} objects. It stays JSON rather than a
                -- child table because a template is always read and written
                -- whole, and the shape is fixed by the designer.
                CREATE TABLE IF NOT EXISTS entity_types (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    default_qualities TEXT NOT NULL DEFAULT '[]',
                    -- A built-in type ships with the app. It can be edited but
                    -- not deleted, so a workspace always has the core types.
                    is_builtin INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_entity_types_name
                    ON entity_types(name COLLATE NOCASE);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
