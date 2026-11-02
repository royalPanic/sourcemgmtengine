# OSINT Case Manager

A local-first desktop application for managing OSINT investigations: cases, structured source evaluation, narrative case notes, and media evidence attachments.

Everything lives on your machine. There is no account, no sync, and no third-party cloud dependency — the database and every attachment stay inside your OS application-data directory.

---

## Features

- **Case management** — create, rename, and delete cases; deleting a case removes its notes, sources, and attachment records.
- **Rich case notes** — a TipTap editor with headings, lists, task lists, tables, code blocks, links, highlights, and text alignment. Notes auto-save with an 800 ms debounce.
- **Structured source evaluation** — every source carries a type, URL, captured raw text, and a NATO Admiralty rating.
- **NATO Admiralty System** — Source Reliability (A–F) and Information Credibility (1–6), each with an inline definition drawn from NATO STANAG 2064 conventions.
- **Evidence attachments** — attach files to a source, open them in the system default application, or delete them. Files are stored under a per-source folder using relative paths so the workspace stays portable.
- **Expandable metadata** — arbitrary key/value pairs are stored as JSON in `sources.custom_metadata`, so specialised fields (TLP markings, coordinates, social handles) never require a schema migration.
- **Dark-mode-first UI** — a tactical zinc/amber palette built for multi-monitor analysis.

---

## Tech stack

| Layer | Technology |
| :--- | :--- |
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS 3 |
| Rich text | TipTap 3 (ProseMirror) |
| Database | SQLite via `tauri-plugin-sql`, queried with `sqlx` |
| Build | Vite 8 |

---

## Requirements

| Tool | Version |
| :--- | :--- |
| Node.js | `^20.19.0` or `>=22.12.0` |
| Rust | stable (edition 2021) |
| Platform deps | See [Tauri prerequisites](https://tauri.app/start/prerequisites/) |

On Windows you also need the **WebView2** runtime (preinstalled on Windows 11) and the MSVC build tools.

On Debian/Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libgtk-3-dev
```

> **macOS is not officially supported.** No macOS bundles are built or released. The codebase is not
> macOS-hostile, so you can build it yourself with `npm run tauri:build` if you have the
> [Tauri prerequisites](https://tauri.app/start/prerequisites/) installed — but it is untested and
> unsupported.

---

## Getting started

```bash
npm install
npm run tauri:dev
```

`npm run dev` alone starts only the Vite dev server on port 1420 — useful for UI work, but every `invoke` call will fail because there is no Rust backend attached.

### Production build

```bash
npm run tauri:build
```

Bundles land in `src-tauri/target/release/bundle/`:

| Platform | Output |
| :--- | :--- |
| Windows | `nsis/*-setup.exe` (per-user, no admin) and `msi/*.msi` (per-machine, admin) |
| Linux | `deb/*.deb` and `appimage/*.AppImage` |

### Other scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Vite dev server only |
| `npm run build` | Type-check, then build the frontend to `dist/` |
| `npm run preview` | Serve the built frontend |
| `npm run tauri:dev` | Full desktop app with hot reload |
| `npm run tauri:build` | Release bundle |
| `npm test` | Run the unit test suite |
| `npm run gen:world-outline` | Regenerate the map's land outlines from Natural Earth |

---

## Releasing

Releases are built by GitHub Actions and published as draft releases.

1. Bump the version in **all three** manifests — they must agree or the release job fails:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit, then tag and push:

   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```

3. The [release workflow](.github/workflows/release.yml) validates the tag against the manifests, builds
   Windows and Linux bundles, generates `SHA256SUMS.txt`, and opens a **draft** release.
4. Review the draft and publish it.

You can also trigger a build manually from the Actions tab with an existing tag.

### Installers are unsigned

No code-signing certificate is configured, so Windows SmartScreen will warn on first run. Users must
choose **More info → Run anyway**. To sign, add the certificate as repository secrets and wire up
`bundle.windows.certificateThumbprint` / `signCommand` in `tauri.conf.json`.

---

## Project layout

```
src/                        React frontend
  api/tauri.ts              Typed invoke() wrappers for every command
  components/               Sidebar, MainContent, CaseNotesEditor,
                            SourcesGrid, DetailDrawer
  hooks/                    useCases, useCaseNote, useSources, useDebounce
  types/index.ts            Domain types + Admiralty definition tables
  styles/globals.css        Design tokens and component classes

src-tauri/                  Rust backend
  src/lib.rs                Plugin registration and command handler
  src/commands/             cases.rs, sources.rs, files.rs
  src/database/             connection.rs, migrations.rs, pool.rs
  src/models/models.rs      Serde structs
  capabilities/default.json Tauri v2 permission set
  tauri.conf.json           App config
```

---

## Data storage

The database is created on first launch at:

| Platform | Path |
| :--- | :--- |
| Windows | `%APPDATA%\com.osint.casemanager\osint_case_manager.db` |
| Linux | `~/.config/com.osint.casemanager/` |

Attachments are written to `attachments/<source_id>/` inside the same directory. Only the **relative** path is stored in the database, so the folder can be moved between machines.

### Schema

```sql
cases              (id, title, description, created_at, updated_at)
case_notes         (id, case_id UNIQUE, content, updated_at)
sources            (id, case_id, title, source_type, url, raw_text,
                    reliability_code, credibility_code, custom_metadata,
                    created_at, updated_at)
source_attachments (id, source_id, file_name, relative_path,
                    mime_type, file_size, created_at)
```

Migrations are versioned through `tauri-plugin-sql` and tracked in `_sqlx_migrations`. Foreign keys declare `ON DELETE CASCADE`, and the delete commands also remove children explicitly so behaviour does not depend on the connection-level `PRAGMA foreign_keys` setting.

---

## NATO Admiralty ratings

**Source Reliability**

| Code | Meaning |
| :--- | :--- |
| A | Completely reliable |
| B | Usually reliable |
| C | Fairly reliable |
| D | Not usually reliable |
| E | Unreliable |
| F | Reliability cannot be judged |

**Information Credibility**

| Code | Meaning |
| :--- | :--- |
| 1 | Confirmed by other sources |
| 2 | Probably true |
| 3 | Possibly true |
| 4 | Doubtful |
| 5 | Improbable |
| 6 | Truth cannot be judged |

Full descriptions are shown as tooltips in the source form and inline in the detail drawer.

---

## Security notes

- **No network access.** The app makes no outbound requests; all data is local.
- **Path containment.** Attachment paths are resolved against the app-data directory and rejected if they are absolute, contain `..`, or canonicalise outside the root.
- **No shell interpolation.** Attachments open through the Tauri opener plugin rather than a shell command, so file names are never parsed as command-line arguments.
- **Parameterised SQL.** Every query uses bound parameters.

---

## Contributing

See [AGENTS.md](./AGENTS.md) for the architecture rules, schema conventions, and coding standards this codebase follows.

---

## License

To be determined.
