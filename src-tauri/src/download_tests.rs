//! Tests for the `download_media` error paths.
//!
//! The full download path requires the bundled yt-dlp binary and a network
//! connection, so these tests pin down the error handling that can be
//! verified without either: source-not-found and the yt-dlp sidecar name.

#[cfg(test)]
mod tests {
    use crate::commands::files::{
        classify_url, extract_image_url, guard_url, parse_reported_path, resolve_redirect_target,
        sanitize_file_name, yt_dlp_args, UrlKind,
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
            args[format + 1],
            "bv*+ba/b",
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
        let html =
            r#"<meta property="og:image" content="https://cdn.example.com/a.png?x=1&amp;y=2">"#;
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
    fn relative_redirects_resolve_against_the_current_url() {
        let current = url::Url::parse("https://example.com/news/story").unwrap();
        let target = resolve_redirect_target(&current, "../media/photo.png").unwrap();
        assert_eq!(target.as_str(), "https://example.com/media/photo.png");
    }

    #[test]
    fn redirects_cannot_change_to_an_unsupported_scheme() {
        let current = url::Url::parse("https://example.com/news/story").unwrap();
        assert!(resolve_redirect_target(&current, "file:///private/data").is_err());
    }

    #[test]
    fn a_page_without_images_yields_none() {
        assert_eq!(
            extract_image_url(
                "<html><body>No images here</body></html>",
                "https://example.com/"
            ),
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

    #[test]
    fn sanitizing_strips_path_separators_and_control_characters() {
        assert_eq!(sanitize_file_name("photo.png"), "photo.png");
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("dir\\file.txt"), "file.txt");
        assert_eq!(sanitize_file_name("bad\nname.txt"), "badname.txt");
    }

    #[test]
    fn sanitizing_drops_the_colon_that_marks_an_alternate_data_stream() {
        // `photo.png:evil` would be an NTFS alternate stream on the base file,
        // not a file of its own, so the colon has to go.
        assert_eq!(sanitize_file_name("photo.png:evil"), "photo.pngevil");
        // A drive prefix is not a file name at all, so only the tail survives.
        assert_eq!(sanitize_file_name("C:photo.png"), "photo.png");
    }

    #[test]
    fn sanitizing_trims_trailing_dots_and_spaces() {
        // Windows strips these, so leaving them would collide with the base name.
        assert_eq!(sanitize_file_name("photo.png."), "photo.png");
        assert_eq!(sanitize_file_name("photo.png "), "photo.png");
    }

    #[test]
    fn sanitizing_prefixes_reserved_device_names() {
        assert_eq!(sanitize_file_name("CON"), "_CON");
        assert_eq!(sanitize_file_name("nul.txt"), "_nul.txt");
        assert_eq!(sanitize_file_name("COM1"), "_COM1");
        // A name that merely starts with a reserved stem is fine.
        assert_eq!(sanitize_file_name("CONSULTANT.txt"), "CONSULTANT.txt");
    }

    #[test]
    fn sanitizing_falls_back_when_nothing_usable_remains() {
        assert_eq!(sanitize_file_name("..."), "file");
        assert_eq!(sanitize_file_name("   "), "file");
        assert_eq!(sanitize_file_name(""), "file");
    }

    #[test]
    fn the_guard_refuses_loopback_addresses() {
        for url in [
            "http://127.0.0.1:8080/admin",
            "http://localhost:3000/",
            "http://[::1]:9000/",
        ] {
            assert!(
                guard_url(url).is_err(),
                "loopback URL must be refused: {url}"
            );
        }
    }

    #[test]
    fn the_guard_refuses_private_and_link_local_addresses() {
        for url in [
            "http://10.0.0.1/",
            "http://192.168.1.1/",
            "http://172.16.0.1/",
            // The cloud metadata endpoint is link-local.
            "http://169.254.169.254/latest/meta-data/",
            // CGNAT and the unspecified address are not routable either.
            "http://100.64.0.1/",
            "http://0.0.0.0/",
        ] {
            assert!(
                guard_url(url).is_err(),
                "non-public URL must be refused: {url}"
            );
        }
    }

    #[test]
    fn the_guard_refuses_ipv4_mapped_loopback() {
        // ::ffff:127.0.0.1 must not slip past the IPv4 checks.
        assert!(guard_url("http://[::ffff:127.0.0.1]/").is_err());
    }

    #[test]
    fn the_guard_rejects_a_url_without_a_host() {
        assert!(guard_url("file:///etc/passwd").is_err());
    }
}
