//! Verifies that entity type templates are stored, validated, and guarded.
//!
//! Templates used to be read from JSON embedded in the binary, so the type
//! designer could edit one in memory but nothing was ever written back. They
//! are rows now, which makes the write path worth pinning: the built-ins must
//! seed exactly once, an operator's edits must survive a restart, and a type
//! that entities still use must not be deletable.

#[cfg(test)]
mod tests {
    use crate::commands::entities::{
        builtin_entity_types, encode_qualities, entity_type_delete_guard,
        insert_entity_default_qualities, normalize_entity_type_description,
        validate_default_qualities, validate_entity_type_input, validate_entity_type_patch,
        EntityType, EntityTypeQuality,
    };
    use crate::database::migrations::get_migrations;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;
    use tauri_plugin_sql::MigrationKind;

    /// Runs every `Up` migration in version order, the way the SQL plugin does.
    async fn migrated_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite");

        let mut migrations = get_migrations();
        migrations.sort_by_key(|m| m.version);

        for migration in migrations {
            if !matches!(migration.kind, MigrationKind::Up) {
                continue;
            }
            for statement in split_statements(migration.sql) {
                sqlx::query(&statement)
                    .execute(&pool)
                    .await
                    .unwrap_or_else(|e| {
                        panic!(
                            "migration {} ({}) failed on: {}\n{}",
                            migration.version, migration.description, statement, e
                        )
                    });
            }
        }

        pool
    }

    /// Splits a migration body into individual statements.
    ///
    /// Triggers contain semicolons inside `BEGIN ... END`, so splitting on `;`
    /// alone would tear them apart. This tracks block depth instead.
    fn split_statements(sql: &str) -> Vec<String> {
        let mut statements = Vec::new();
        let mut current = String::new();
        let mut in_trigger = false;

        for line in sql.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("--") {
                continue;
            }

            let upper = trimmed.to_uppercase();
            if upper.starts_with("CREATE TRIGGER") {
                in_trigger = true;
            }

            current.push_str(line);
            current.push('\n');

            let ends_block = in_trigger && upper == "END;";
            if ends_block {
                in_trigger = false;
                statements.push(std::mem::take(&mut current));
            } else if !in_trigger && trimmed.ends_with(';') {
                statements.push(std::mem::take(&mut current));
            }
        }

        if !current.trim().is_empty() {
            statements.push(current);
        }

        statements
    }

    /// Mirrors `seed_builtin_entity_types` without an `AppHandle`.
    async fn seed_builtins(pool: &sqlx::SqlitePool) {
        for builtin in builtin_entity_types().expect("built-ins parse") {
            let qualities = encode_qualities(&builtin.default_qualities).expect("encode");
            sqlx::query(
                "INSERT OR IGNORE INTO entity_types \
                 (id, name, description, default_qualities, is_builtin, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            )
            .bind(&builtin.id)
            .bind(&builtin.name)
            .bind(&builtin.description)
            .bind(&qualities)
            .execute(pool)
            .await
            .expect("seed built-in");
        }
    }

    fn quality(name: &str, kind: &str) -> EntityTypeQuality {
        EntityTypeQuality {
            name: name.to_string(),
            r#type: kind.to_string(),
            required: false,
        }
    }

    fn template(id: &str, name: &str, is_builtin: bool) -> EntityType {
        EntityType {
            id: id.to_string(),
            name: name.to_string(),
            description: None,
            default_qualities: vec![quality("Name", "string")],
            is_builtin,
        }
    }

    // --- Seeding ---

    #[tokio::test]
    async fn builtins_seed_on_first_use() {
        let pool = migrated_pool().await;
        seed_builtins(&pool).await;

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM entity_types WHERE is_builtin = 1")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(
            count,
            builtin_entity_types().expect("built-ins parse").len() as i64,
            "every embedded template must be seeded"
        );
    }

    #[tokio::test]
    async fn seeding_twice_does_not_duplicate_builtins() {
        let pool = migrated_pool().await;
        seed_builtins(&pool).await;
        seed_builtins(&pool).await;

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM entity_types")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(
            count,
            builtin_entity_types().expect("built-ins parse").len() as i64,
            "a restart must not duplicate the built-ins"
        );
    }

    #[tokio::test]
    async fn seeding_does_not_overwrite_an_edited_builtin() {
        let pool = migrated_pool().await;
        seed_builtins(&pool).await;

        // The operator renames a built-in type.
        sqlx::query("UPDATE entity_types SET name = 'Human' WHERE id = 'person'")
            .execute(&pool)
            .await
            .unwrap();

        // A restart re-runs the seed.
        seed_builtins(&pool).await;

        let name: String = sqlx::query_scalar("SELECT name FROM entity_types WHERE id = 'person'")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(name, "Human", "the seed must not clobber an edit");
    }

    #[tokio::test]
    async fn builtins_are_flagged_and_custom_types_are_not() {
        let pool = migrated_pool().await;
        seed_builtins(&pool).await;

        sqlx::query(
            "INSERT INTO entity_types (id, name, default_qualities, is_builtin) \
             VALUES ('custom', 'Custom', '[]', 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let builtin: i64 =
            sqlx::query_scalar("SELECT is_builtin FROM entity_types WHERE id = 'person'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let custom: i64 =
            sqlx::query_scalar("SELECT is_builtin FROM entity_types WHERE id = 'custom'")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(builtin, 1);
        assert_eq!(custom, 0);
    }

    // --- Validation ---

    #[test]
    fn a_well_formed_type_is_accepted() {
        let qualities = vec![quality("Name", "string"), quality("Born", "date")];

        let (id, name) =
            validate_entity_type_input("vehicle", "Vehicle", &qualities).expect("valid input");

        assert_eq!(id, "vehicle");
        assert_eq!(name, "Vehicle");
    }

    #[test]
    fn a_type_id_must_be_a_lowercase_slug() {
        for bad in [
            "",
            "   ",
            "Person",
            "Person Name",
            "person!",
            "person.name",
            "pérson",
        ] {
            let result = validate_entity_type_input(bad, "Person", &[]);
            assert!(result.is_err(), "type id {bad:?} must be rejected");
        }
    }

    #[test]
    fn a_type_id_may_contain_digits_hyphens_and_underscores() {
        for good in ["person", "person-2", "person_2", "a1-b2_c3"] {
            let result = validate_entity_type_input(good, "Person", &[]);
            assert!(result.is_ok(), "type id {good:?} must be accepted");
        }
    }

    #[test]
    fn an_overlong_type_id_is_rejected() {
        let long = "a".repeat(65);
        assert!(validate_entity_type_input(&long, "Person", &[]).is_err());

        let at_limit = "a".repeat(64);
        assert!(validate_entity_type_input(&at_limit, "Person", &[]).is_ok());
    }

    #[test]
    fn a_type_name_is_required() {
        assert!(validate_entity_type_input("person", "", &[]).is_err());
        assert!(validate_entity_type_input("person", "   ", &[]).is_err());
        assert!(validate_entity_type_input("person", " Person ", &[]).is_ok());
    }

    #[test]
    fn a_default_quality_needs_a_name_and_a_known_type() {
        assert!(validate_default_qualities(&[quality("", "string")]).is_err());
        assert!(validate_default_qualities(&[quality("Name", "unreal")]).is_err());
        assert!(validate_default_qualities(&[quality("Name", "string")]).is_ok());
    }

    #[test]
    fn duplicate_default_quality_names_are_rejected() {
        let duplicates = vec![quality("Name", "string"), quality("Name", "date")];

        let error = validate_default_qualities(&duplicates).expect_err("duplicates must fail");
        assert!(error.contains("Duplicate"), "unexpected message: {error}");
    }

    #[test]
    fn a_type_cannot_define_multiple_reliability_qualities() {
        let duplicates = vec![
            quality("Primary Rating", "reliability"),
            quality("Secondary Rating", "reliability"),
        ];

        let error = validate_default_qualities(&duplicates)
            .expect_err("multiple reliability qualities are ambiguous");
        assert!(error.contains("at most one"), "unexpected message: {error}");
    }

    #[test]
    fn a_template_may_have_no_default_qualities() {
        assert!(validate_entity_type_input("person", "Person", &[]).is_ok());
    }

    // --- Patching ---

    #[test]
    fn an_omitted_field_keeps_the_existing_value() {
        let existing = template("person", "Person", true);

        let (name, qualities) =
            validate_entity_type_patch(&existing, None, None).expect("empty patch is valid");

        assert_eq!(name, "Person");
        assert_eq!(qualities, existing.default_qualities);
    }

    #[test]
    fn a_supplied_field_replaces_the_existing_value() {
        let existing = template("person", "Person", true);
        let replacement = vec![quality("Alias", "string")];

        let (name, qualities) =
            validate_entity_type_patch(&existing, Some("Human"), Some(&replacement))
                .expect("valid patch");

        assert_eq!(name, "Human");
        assert_eq!(qualities, replacement);
    }

    #[test]
    fn an_invalid_patch_is_rejected_before_anything_is_written() {
        let existing = template("person", "Person", true);

        assert!(validate_entity_type_patch(&existing, Some("  "), None).is_err());
        assert!(
            validate_entity_type_patch(&existing, None, Some(&[quality("Name", "unreal")]))
                .is_err()
        );
        assert!(validate_entity_type_patch(
            &existing,
            None,
            Some(&[quality("Name", "string"), quality("Name", "date")])
        )
        .is_err());
    }

    #[test]
    fn an_empty_description_patch_clears_the_existing_description() {
        assert_eq!(
            normalize_entity_type_description(Some("  ".to_string())),
            Some(None)
        );
        assert_eq!(
            normalize_entity_type_description(Some("  A person  ".to_string())),
            Some(Some("A person".to_string()))
        );
        assert_eq!(normalize_entity_type_description(None), None);
    }

    // --- Delete guards ---

    #[test]
    fn a_builtin_type_cannot_be_deleted() {
        let existing = template("person", "Person", true);

        let message = entity_type_delete_guard(&existing, false)
            .expect("a built-in must be protected even when unused");

        assert!(
            message.contains("built-in"),
            "unexpected message: {message}"
        );
    }

    #[test]
    fn a_type_in_use_cannot_be_deleted() {
        let existing = template("custom", "Custom", false);

        let message =
            entity_type_delete_guard(&existing, true).expect("an in-use type must be protected");

        assert!(
            message.contains("still used"),
            "unexpected message: {message}"
        );
    }

    #[test]
    fn an_unused_custom_type_can_be_deleted() {
        let existing = template("custom", "Custom", false);

        assert!(entity_type_delete_guard(&existing, false).is_none());
    }

    // --- Round trip ---

    #[tokio::test]
    async fn a_template_round_trips_through_the_table() {
        let pool = migrated_pool().await;
        seed_builtins(&pool).await;

        let qualities = vec![quality("Callsign", "string"), quality("Operator", "string")];
        let encoded = encode_qualities(&qualities).expect("encode");

        sqlx::query(
            "INSERT INTO entity_types (id, name, description, default_qualities, is_builtin) \
             VALUES ('aircraft', 'Aircraft', 'An aircraft', ?, 0)",
        )
        .bind(&encoded)
        .execute(&pool)
        .await
        .unwrap();

        let row = sqlx::query(
            "SELECT name, description, default_qualities, is_builtin FROM entity_types WHERE id = 'aircraft'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.get::<String, _>("name"), "Aircraft");
        assert_eq!(
            row.get::<Option<String>, _>("description"),
            Some("An aircraft".to_string())
        );
        assert_eq!(row.get::<i64, _>("is_builtin"), 0);

        let stored: String = row.get("default_qualities");
        let decoded: Vec<EntityTypeQuality> =
            serde_json::from_str(&stored).expect("stored qualities must parse back");
        assert_eq!(decoded, qualities);
    }

    #[tokio::test]
    async fn default_qualities_are_created_as_blank_rows_for_new_entities() {
        let pool = migrated_pool().await;
        sqlx::query(
            "INSERT INTO entities (id, entity_type, name, is_global) \
             VALUES ('e1', 'custom', 'Test Entity', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let qualities = vec![quality("Callsign", "string"), quality("Active", "boolean")];
        let mut connection = pool.acquire().await.unwrap();
        insert_entity_default_qualities(&mut connection, "e1", &qualities, "2026-01-01T00:00:00Z")
            .await
            .expect("template qualities should be copied");
        drop(connection);

        let rows = sqlx::query(
            "SELECT quality_name, quality_type, value_string, value_boolean \
             FROM entity_qualities WHERE entity_id = 'e1' ORDER BY quality_name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].get::<String, _>("quality_name"), "Active");
        assert_eq!(rows[0].get::<String, _>("quality_type"), "boolean");
        assert_eq!(rows[0].get::<Option<i64>, _>("value_boolean"), None);
        assert_eq!(rows[1].get::<String, _>("quality_name"), "Callsign");
        assert_eq!(rows[1].get::<String, _>("quality_type"), "string");
        assert_eq!(rows[1].get::<Option<String>, _>("value_string"), None);
    }

    #[tokio::test]
    async fn deleting_an_entity_type_leaves_entities_alone() {
        let pool = migrated_pool().await;
        seed_builtins(&pool).await;

        sqlx::query("INSERT INTO cases (id, title, kind) VALUES ('c1', 'Case', 'case')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO entities (id, entity_type, name, case_id, is_global) \
             VALUES ('e1', 'person', 'John Doe', 'c1', 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        // The guard refuses the delete, so the entity keeps its type.
        let in_use = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM entities WHERE entity_type = 'person'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(in_use, 1);

        let existing = template("person", "Person", false);
        assert!(entity_type_delete_guard(&existing, in_use > 0).is_some());
    }
}
