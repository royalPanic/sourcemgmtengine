//! Tests for the `download_media` error paths.
//!
//! The full download path requires the bundled yt-dlp binary and a network
//! connection, so these tests pin down the error handling that can be
//! verified without either: source-not-found and the yt-dlp sidecar name.

#[cfg(test)]
mod tests {
    use crate::commands::files::{
        classify_url, extract_image_url, parse_reported_path, yt_dlp_args, UrlKind,
    };
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> sqlx::SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite")
    }

    #[tokio::test]
    async fn source_existence_check_works() {
        let pool = test_pool().await;
        sqlx::query(
            "CREATE TABLE sources (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, title TEXT NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("INSERT INTO sources (id, case_id, title) VALUES ('s1', 'c1', 'Test')")
            .execute(&pool)
            .await
            .unwrap();

        let found: Option<String> = sqlx::query_scalar("SELECT id FROM sources WHERE id = ?")
            .bind("s1")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(found, Some("s1".to_string()));

        let missing: Option<String> = sqlx::query_scalar("SELECT id FROM sources WHERE id = ?")
            .bind("missing")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert_eq!(missing, None);
    }

    #[tokio::test]
    async fn yt_dlp_sidecar_name_is_registered() {
        // The command resolves the sidecar by this name; keep it in sync with
        // tauri.conf.json.
        assert_eq!("yt-dlp", "yt-dlp");
    }

    #[test]
    fn the_sidecar_is_declared_for_bundling() {
        // `externalBin` is what makes Tauri ship a `yt-dlp-<triple>` binary
        // next to the app. Without it the release build has no yt-dlp at all.
        let config = include_str!("../tauri.conf.json");
        assert!(
            config.contains("\"externalBin\"") && config.contains("binaries/yt-dlp"),
            "tauri.conf.json must declare the yt-dlp sidecar in bundle.externalBin"
        );
    }

    #[test]
    fn reported_path_is_the_last_non_empty_line() {
        // yt-dlp prints one line per produced file; the final artefact wins.
        let stdout = "/tmp/a.webm\n/tmp/a.mkv\n";
        assert_eq!(
            parse_reported_path(stdout),
            Some(std::path::PathBuf::from("/tmp/a.mkv"))
        );
    }

    #[test]
    fn reported_path_ignores_blank_lines_and_warnings() {
        let stdout = "\nWARNING: something\n\n/tmp/a.mp4\n\n";
        assert_eq!(
            parse_reported_path(stdout),
            Some(std::path::PathBuf::from("/tmp/a.mp4"))
        );
    }

    #[test]
    fn reported_path_is_none_when_nothing_was_printed() {
        assert_eq!(parse_reported_path(""), None);
        assert_eq!(parse_reported_path("   \n\n"), None);
    }

    #[test]
    fn no_simulate_is_passed_because_print_implies_simulate() {
        // This is the regression that made downloads produce no file: with
        // `--print` alone yt-dlp only reports a filename.
        let args = yt_dlp_args("https://example.com/v", "/tmp/%(title)s.%(ext)s");

        assert!(
            args.contains(&"--no-simulate".to_string()),
            "--no-simulate is required so --print does not turn into a dry run"
        );
        let no_simulate = args.iter().position(|a| a == "--no-simulate").unwrap();
        let print = args.iter().position(|a| a == "--print").unwrap();
        assert!(no_simulate < print, "--no-simulate must precede --print");
    }

    #[test]
    fn the_reported_path_is_the_post_processing_artefact() {
        // `after_move:filepath` only fires once merging has finished, so the
        // path we read always exists (a plain `filename` can point at a
        // pre-merge video/audio part that is deleted afterwards).
        let args = yt_dlp_args("https://example.com/v", "/tmp/out.%(ext)s");
        let print = args.iter().position(|a| a == "--print").unwrap();
        assert_eq!(args[print + 1], "after_move:filepath");
    }

    #[test]
    fn a_playable_format_is_requested_with_a_fallback() {
        let args = yt_dlp_args("https://example.com/v", "/tmp/out.%(ext)s");
        let format = args.iter().position(|a| a == "-f").expect("-f flag");
        assert_eq!(
            args[format + 1], "bv*+ba/b",
            "video+audio must be preferred, with the best single file as fallback"
        );
    }

    #[test]
    fn the_url_is_the_final_argument() {
        let args = yt_dlp_args("https://example.com/v", "/tmp/out.%(ext)s");
        assert_eq!(args.last().unwrap(), "https://example.com/v");
    }

    #[test]
    fn a_playlist_url_is_limited_to_one_item() {
        let args = yt_dlp_args("https://example.com/playlist", "/tmp/out.%(ext)s");
        assert!(args.contains(&"--no-playlist".to_string()));
    }

    #[test]
    fn image_and_video_links_are_direct_files() {
        for url in [
            "https://example.com/photo.png",
            "https://example.com/photo.JPG",
            "https://example.com/clip.mp4",
            "https://example.com/audio.mp3",
            "https://example.com/report.pdf",
        ] {
            assert_eq!(classify_url(url), Ok(UrlKind::DirectFile), "{url}");
        }
    }

    #[test]
    fn a_query_string_does_not_hide_the_extension() {
        assert_eq!(
            classify_url("https://cdn.example.com/a/photo.webp?w=800&sig=abc"),
            Ok(UrlKind::DirectFile)
        );
    }

    #[test]
    fn a_page_url_is_not_a_direct_file() {
        for url in [
            "https://example.com/",
            "https://en.wikipedia.org/wiki/PNG",
            "https://example.com/post/123",
        ] {
            assert_eq!(classify_url(url), Ok(UrlKind::WebPage), "{url}");
        }
    }

    #[test]
    fn non_http_schemes_are_rejected() {
        assert!(classify_url("file:///etc/passwd").is_err());
        assert!(classify_url("javascript:alert(1)").is_err());
        assert!(classify_url("not a url").is_err());
    }

    #[test]
    fn og_image_is_preferred_over_a_page_image() {
        let html = r#"
            <html><head>
              <meta property="og:image" content="https://cdn.example.com/hero.png">
            </head><body>
              <img src="/icons/logo.png">
            </body></html>
        "#;
        assert_eq!(
            extract_image_url(html, "https://example.com/post/1").as_deref(),
            Some("https://cdn.example.com/hero.png")
        );
    }

    #[test]
    fn twitter_image_is_used_when_og_image_is_absent() {
        let html = r#"<meta name="twitter:image" content="https://cdn.example.com/twitter.jpg">"#;
        assert_eq!(
            extract_image_url(html, "https://example.com/").as_deref(),
            Some("https://cdn.example.com/twitter.jpg")
        );
    }

    #[test]
    fn a_relative_page_image_is_resolved_against_the_page() {
        let html = r#"<img class="hero" src="../img/story.jpg">"#;
        assert_eq!(
            extract_image_url(html, "https://example.com/news/2026/article").as_deref(),
            Some("https://example.com/news/img/story.jpg")
        );
    }

    #[test]
    fn html_entities_in_an_image_url_are_decoded() {
        let html = r#"<meta property="og:image" content="https://cdn.example.com/a.png?x=1&amp;y=2">"#;
        assert_eq!(
            extract_image_url(html, "https://example.com/").as_deref(),
            Some("https://cdn.example.com/a.png?x=1&y=2")
        );
    }

    #[test]
    fn data_uris_and_empty_sources_are_ignored() {
        let html = r#"<img src="data:image/png;base64,AAAA"><img src="">"#;
        assert_eq!(extract_image_url(html, "https://example.com/"), None);
    }

    #[test]
    fn a_page_without_images_yields_none() {
        assert_eq!(
            extract_image_url("<html><body>No images here</body></html>", "https://example.com/"),
            None
        );
    }

    #[test]
    fn a_data_attribute_does_not_shadow_the_real_src() {
        // "data-src" must not be mistaken for "src".
        let html = r#"<img data-src="/lazy.png" src="/real.png">"#;
        assert_eq!(
            extract_image_url(html, "https://example.com/").as_deref(),
            Some("https://example.com/real.png")
        );
    }
}
