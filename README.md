# OSINT Case Manager

A local-first desktop application for managing OSINT investigations: cases, structured source evaluation, narrative case notes, and media evidence attachments.

Everything lives on your machine. There is no account, no sync, and no third-party cloud dependency — the database and every attachment stay inside your OS application-data directory.

---

## Features

- **Case management** — create and delete cases. Every case can optionally carry a date and wall-clock time, so a case can double as a dated event. Deleting a container removes its notes, sources, qualities, and attachment records.
- **Rich case notes** — a TipTap editor with headings, lists, task lists, tables, links, highlights, and text alignment. Notes auto-save with an 800 ms debounce.
- **Dated cases** — any case can have an optional date and wall-clock time, both editable from the banner. Sources attached to a case can record a stance (supports / refutes / neutral).
- **Case dashboard** — per-stance Admiralty averages, a stance distribution, a map of geolocated sources, and a breakdown table.
- **Geolocation** — a source can carry coordinates (decimal, DMS, UTM, or MGRS) and a place name, stored in `custom_metadata`.
- **Structured source evaluation** — every source carries a type, URL, captured raw text, and a NATO Admiralty rating.
- **Sortable source timeline** — click the **Date** or **Updated** column header to reorder the source grid, and click again to flip between newest-first and oldest-first. Sources with no date stay at the top in either direction, so an undated capture is never buried at the bottom of the list. The chosen sort is remembered locally between sessions.
- **NATO Admiralty System** — Source Reliability (A–F) and Information Credibility (1–6), each with an inline definition drawn from NATO STANAG 2064 conventions.
- **Evidence attachments** — attach files to a source, open them in the system default application, or delete them. Files are stored under a per-source folder using relative paths so the workspace stays portable.
- **OpenTimestamps proofs** — every attachment can be cryptographically timestamped against the Bitcoin blockchain via public OpenTimestamps calendars, so its existence before a point in time is provable without trusting this application. Proofs are verified against real block headers, and an unverifiable proof never reports as confirmed.
- **Expandable metadata** — arbitrary key/value pairs are stored as JSON in `sources.custom_metadata`, so specialised fields (TLP markings, coordinates, social handles) never require a schema migration.
- **Entities** — typed, reusable objects (people, organizations, vehicles, nations, governments, etc.) that persist across every case. Entities carry user-defined qualities, including a dedicated **Reliability** quality (A–F).
- **Workspace tab** — a unified view combining sources, entities, and their relationships for the selected case, replacing separate tabs and panels.
- **Entity type templates** — pre-seeded types (person, organization, government, nation, vehicle) plus user-defined types, each with default qualities that new entities of that type start with.
- **Source references** — a source can cite another source in the same container, or an entity. The citing source inherits its reference's Admiralty rating; citing another *source* also locks the stance to none and excludes it from dashboard statistics, so repeated reporting never counts as independent corroboration.
- **Entity reliability propagation** — when an entity has a Reliability quality (A–F), every source that references that entity inherits that reliability as its own `reliability_code`. Editing the entity's reliability pushes the new rating down to every citing source, live. The source's reliability field is greyed out when it references an entity — the entity wins. Credibility remains independent and is set on the source directly.
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

### Media downloads (yt-dlp)

"Download Media" preserves an image or video from a source's URL as an attachment.

A **direct file link** — a URL ending in an image, video, audio, or `.pdf` extension — is fetched
with a plain HTTP GET and needs no extra tooling. This covers the common case of an image URL
copied straight out of a page.

Any other URL is treated as a **web page**. yt-dlp is used for video sites, and if that does not
produce a file the page's `og:image` / `twitter:image` is downloaded instead — so a link to an
article or post captures its representative image. If yt-dlp is not installed at all, the image
path still works.

Release bundles ship yt-dlp as a **sidecar**: `npm run tauri:build` first runs
`npm run fetch:yt-dlp`, which stages the binary at
`src-tauri/binaries/yt-dlp-<target-triple>` so Tauri bundles it next to the app.

For development (`npm run tauri:dev`) no sidecar is required — the app looks for a bundled
sidecar first and then falls back to `yt-dlp` on your `PATH`:

```bash
pip install yt-dlp        # or: winget install yt-dlp
```

**ffmpeg is required** when a video site serves video and audio separately, because yt-dlp needs it
to mux them into one playable file. It must likewise be on `PATH`.

The staged sidecar is a downloaded third-party binary and is git-ignored, so run
`npm run fetch:yt-dlp` once before your first release build.

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
| Linux | `deb/*.deb`, `rpm/*.rpm`, and `appimage/*.AppImage` |

`bundle.targets` is set to `"all"`, so the exact set depends on the host: each platform produces
only the formats it can build.

### Working on the UI without the backend

`npm run dev` starts the Vite dev server on port 1420. The shell renders, but every `invoke` call
fails — there is no Rust process and no database, so the case list stays empty and the app is
effectively read-only-blank. Use `npm run tauri:dev` for anything that touches data.

### Other scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Vite dev server only |
| `npm run build` | Type-check, then build the frontend to `dist/` |
| `npm run preview` | Serve the built frontend |
| `npm run tauri:dev` | Full desktop app with hot reload |
| `npm run tauri:build` | Release bundle |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run test:watch` | Re-run unit tests on change |
| `npm run gen:world-outline` | Regenerate the map's land outlines from Natural Earth |

---

## Releasing

Releases are built by GitHub Actions and published as draft releases.

### 1. Bump the version

A single version string is duplicated across five files, and CI fails if they disagree. Update all of
them together:

| File | Field | How |
| :--- | :--- | :--- |
| `package.json` | `version` | `npm version <ver> --no-git-tag-version` |
| `package-lock.json` | `version` + `packages[""].version` | updated by the `npm version` command above |
| `src-tauri/tauri.conf.json` | `version` | edit by hand |
| `src-tauri/Cargo.toml` | `[package] version` | edit by hand |
| `src-tauri/Cargo.lock` | `osint-case-manager` entry | `cargo update --workspace --offline` in `src-tauri/` |

For example, to go to `2.1.0`:

```bash
npm version 2.1.0 --no-git-tag-version
# edit src-tauri/tauri.conf.json and src-tauri/Cargo.toml
cd src-tauri && cargo update --workspace --offline
```

The lock files must move too: they carry the project's own version, and a stale `Cargo.lock` makes the
bundled binaries report the wrong version.

### 2. Tag and push

```bash
git tag v2.1.0
git push origin v2.1.0
```

### 3. Let CI build it

The [release workflow](.github/workflows/release.yml) validates the tag against all five manifests,
builds Windows and Linux bundles, generates `SHA256SUMS.txt`, and opens a **draft** release.

### 4. Review and publish

Check the draft, then publish it. You can also trigger a build manually from the Actions tab with an
existing tag.

The `Build` workflow also re-checks the manifests on every push and pull request against `main` and
`develop`, so a forgotten bump fails on the PR rather than at release time.

### Installers are unsigned

No code-signing certificate is configured, so Windows SmartScreen will warn on first run. Users must
choose **More info → Run anyway**. To sign, add the certificate as repository secrets and wire up
`bundle.windows.certificateThumbprint` / `signCommand` in `tauri.conf.json`.

---

## Project layout

```
src/                        React frontend
  api/tauri.ts              Typed invoke() wrappers for every command
  components/               Sidebar, MainContent, CaseNotesEditor, SourcesGrid,
                            DetailDrawer, Dashboard, SourceMap, WorkspaceTab,
                            ReferenceSelect, EntityDetailDrawer, EntityQualityEditor,
                            EntityTypeDesigner, EntityTypeSelector
  hooks/                    useCases, useCaseNote, useSources, useEntities,
                            useEntityQualities, useEntityTypes, useDebounce
  types/index.ts            Domain types + Admiralty definition tables
  utils/                    analytics, geo, coordinates, datetime (+ unit tests)
  styles/globals.css        Design tokens and component classes

src-tauri/                  Rust backend
  src/lib.rs                Plugin registration and command handler
  src/commands/             cases.rs, sources.rs, files.rs, entities.rs,
                            references.rs
  src/database/             connection.rs, migrations.rs, pool.rs
  src/models/models.rs      Serde structs
  capabilities/default.json Tauri v2 permissions
  entity-types/             Pre-seeded entity type JSON templates
    person.json, organization.json, government.json, nation.json, vehicle.json
```ission set
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
cases              (id, title, description, created_at, updated_at,
                    kind, event_date, event_time)
case_notes         (id, case_id UNIQUE, content, updated_at)
entities           (id, entity_type, name, description, case_id, is_global,
                    created_at, updated_at)
entity_qualities   (id, entity_id, quality_name, quality_type,
                    value_string, value_integer, value_boolean,
                    value_date, value_coordinates, value_address,
                    created_at, updated_at)
quality_source_refs(id, quality_id, source_id, reliability_code,
                    credibility_code, created_at)
sources            (id, case_id, title, source_type, url, raw_text,
                    reliability_code, credibility_code, stance,
                    reference_source_id, reference_entity_id,
                    source_date, source_time, custom_metadata,
                    created_at, updated_at)
source_attachments (id, source_id, file_name, relative_path,
                    mime_type, file_size, created_at)
source_timestamp   (id, source_attachment_id UNIQUE, ots_path, status,
                    created_at, confirmed_at)
```

Migrations are versioned through `tauri-plugin-sql` and tracked in `_sqlx_migrations`. Foreign keys declare `ON DELETE CASCADE`, and the delete commands also remove children explicitly so behaviour does not depend on the connection-level `PRAGMA foreign_keys` setting.

Reference columns instead use `ON DELETE SET NULL`: deleting a source or entity blanks the citation link but leaves the citing source — and the rating it inherited — intact.

---

## OpenTimestamps proofs

Every attachment can carry an **OpenTimestamps** proof proving the file existed before a point in time,
without trusting this application or any third party. Proofs are written next to the attachment as
`<file>.<ext>.ots` and recorded in `source_timestamp`.

The client is implemented directly in Rust (`src-tauri/src/opentimestamps/`), so the Python `ots` tool is
not required. The proof container and wire format are consensus-critical and follow
[`python-opentimestamps`](https://github.com/opentimestamps/python-opentimestamps) exactly; the tests pin
byte-for-byte against proofs and calendar responses produced by the reference implementation.

**Stamping** hashes the file with SHA-256 and submits the digest to the public OpenTimestamps calendars
(`POST <calendar>/digest`, raw 32-byte body). Each calendar returns a serialized commitment subtree, which is
merged into one proof. A freshly stamped proof is `pending`: the calendar holds the commitment but its
aggregation transaction is not mined yet.

**Verification** asks the calendars named in the proof's pending attestations for an upgrade. Once a
`BitcoinBlockHeaderAttestation` is available, the attested commitment is checked against the real block header
fetched from a public block explorer, and the block time is recorded. Only a proof that passes that check
becomes `confirmed`; anything else stays `pending`, because "the calendar returned HTTP 200" is not proof.

At least one calendar must accept the commitment. A stamping failure is reported to the operator rather than
silently swallowed.

Downloads are stamped automatically, and a failed automatic stamp never loses the attachment. A proof that
cannot be parsed — for example one written by an earlier build — is detected and can be replaced by
re-stamping, so existing evidence is not stranded.

---

## Entities and source references

An **entity** is a typed, reusable object — a person, organization, vehicle, nation, government, etc. — stored once and citable from any case. Entities carry user-defined qualities, including a dedicated **Reliability** quality (A–F).

A quality's **source provenance is optional**. A quality may cite one or more sources to show where it came from, and the cited sources' Admiralty ratings are averaged for display. Leaving it empty is valid and expected when work happens out of order — for example, recording a reliability assessment before the supporting capture exists. Provenance can be added later from the quality editor.

A source may **reference** exactly one of:

| Target | Rating | Stance | Analytics |
| :--- | :--- | :--- | :--- |
| Another source in the same container | Inherited | **Locked to none** | **Excluded** |
| An entity | Inherited from entity's Reliability quality | Editable | **Counted** |

The two rows differ because they mean different things. Citing a sibling source duplicates one piece of evidence, so it must not add a second corroboration. Citing an entity is a new capture of that entity's output — a wire service publishing many articles — so each capture is independent evidence and stays measurable.

Two rules follow from the intent of the feature and are enforced in the backend, not just the UI:

1. **The rating is inherited, and stays in sync.** A report of a statement does not change the reliability of the source or the credibility of the information, so a citing source mirrors its reference. Editing the entity's Reliability quality pushes the new rating down every citation, including citations of citations. A *source* reference supplies both codes; an *entity* reference supplies reliability only, so the citing source keeps its own credibility.
2. **A source that cites another source carries no stance.** Ten outlets repeating one core capture must not read as ten independent corroborations, so the stance is forced to none, the control is disabled, and the source is excluded from every case dashboard statistic.

Cycles (`A → B → A`) and cross-container references are rejected. The "at most one reference" rule is additionally enforced by SQLite triggers so it holds for any future writer.

---

## Entity reliability propagation

Entities can have a **Reliability** quality (type `reliability`, value `A`–`F`). When a source references that entity:

- The source's `reliability_code` is set to the entity's Reliability quality value
- The source's reliability field is greyed out in the UI — the entity wins
- Editing the entity's Reliability quality propagates the new rating to every citing source, live
- If the source's entity reference is cleared, the source can set its own reliability again

Credibility is **not** propagated — it remains independent and is set on the source directly.

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

- **No outbound data requests.** The app never fetches, uploads, or syncs. No HTTP client is a
  dependency in either the frontend or the Rust binary, and no code calls `fetch` or similar.
  (The only build-time network access is `npm run gen:world-outline`, a developer script that
  downloads Natural Earth GeoJSON and writes it into the source tree.)
- **CSP is disabled** (`app.security.csp` is `null` in `tauri.conf.json`). The UI renders only local
  content, but note that a source's `url` field is displayed as plain text and never rendered as
  HTML, so disabling the CSP does not open a script-injection path from stored data.
- **Path containment.** Attachment paths are resolved against the app-data directory and rejected if they are absolute, contain `..`, or canonicalise outside the root.
- **No shell interpolation.** Attachments open through the Tauri opener plugin rather than a shell command, so file names are never parsed as command-line arguments.
- **Parameterised SQL.** Every query uses bound parameters.

---

## Contributing

See [AGENTS.md](./AGENTS.md) for the architecture rules, schema conventions, and coding standards this codebase follows.

Two test suites live side by side and both must pass:

```bash
npm test                  # frontend (Vitest)
cd src-tauri && cargo test # backend (SQLite-backed)
```

---

## License

To be determined.
