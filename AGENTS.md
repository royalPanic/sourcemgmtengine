# AGENTS.md — Development Guidelines for OSINT Case Manager

This document establishes the architecture, design principles, and coding standards for AI agents contributing to the OSINT Case & Source Manager codebase.

---

## 1. Project Overview & Premise

The **OSINT Case & Source Manager** is a modern, local-first Windows application built for managing intelligence cases, structured source evaluation, narrative case notes, and media evidence attachments.

### Core Intent
* **Local-First, Zero Cloud Dependencies:** All database records, user notes, and media attachments live entirely within local user directories. No background telemetry, sync, or cloud accounts exist; outbound network requests happen only when explicitly triggered by the user (Media Download via the `yt-dlp` sidecar, or OpenTimestamps proof stamping/verification).
* **Granular Intelligence Evaluation:** Native integration of NATO Admiralty System ratings (Source Reliability A–F, Information Credibility 1–6), typed reusable entities with provenance-tracked qualities, and expandable key-value metadata for specialized OSINT workflows.
* **Modern Desktop Aesthetic:** Responsive, high-contrast, dark-mode-first UI tailored for multi-monitor desktop analysis.

---

## 2. Technical Stack & Standards

| Component | Technology | Primary Role |
| :--- | :--- | :--- |
| **Desktop Shell** | Tauri v2 (Rust backend) | Native OS integration, secure filesystem operations, SQLite bindings |
| **Frontend Framework** | React 18+ (TypeScript) | Declarative UI, state management, component architecture |
| **Styling** | Tailwind CSS | Utility-first styling, design system tokens, native dark mode |
| **Data Layer** | SQLite (`tauri-plugin-sql` / `sqlx`) | Local relational storage, versioned migrations (v1–v11), and transaction handling |
| **Rich Text / Notes** | TipTap v3 | Rich text / Markdown-compatible case note editor with debounced auto-save |

---

## 3. Architecture & Data Schema Rules

AI agents generating backend code or database migrations must strictly maintain relational integrity and support schema expansion.

### SQLite Database Blueprint (`schema.sql`)

```sql
-- Core Cases Entity
CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Case Notes Entity (Rich Text / Markdown)
CREATE TABLE IF NOT EXISTS case_notes (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL UNIQUE,
    content TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- OSINT Intelligence Sources Entity
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT DEFAULT 'URL', -- e.g., 'URL', 'Document', 'Social Media', 'Image'
    url TEXT,
    raw_text TEXT,
    -- NATO Admiralty Rating System
    reliability_code CHAR(1) CHECK (reliability_code IN ('A','B','C','D','E','F')),
    credibility_code INT CHECK (credibility_code BETWEEN 1 AND 6),
    stance TEXT CHECK (stance IN ('supports','refutes','neutral')),
    source_date TEXT,
    source_time TEXT,
    reference_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    reference_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
    custom_metadata TEXT DEFAULT '{}', -- Valid JSON string for dynamic user fields
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- Media & Document Evidence Attachments
CREATE TABLE IF NOT EXISTS source_attachments (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    relative_path TEXT NOT NULL, -- Path inside the local app data folder
    mime_type TEXT,
    file_size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

-- OpenTimestamps Cryptographic Proofs (1:1 per attachment)
CREATE TABLE IF NOT EXISTS source_timestamp (
    id TEXT PRIMARY KEY,
    source_attachment_id TEXT NOT NULL UNIQUE,
    ots_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    block_height INTEGER,
    block_time TEXT,
    verification_notes TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (source_attachment_id) REFERENCES source_attachments(id) ON DELETE CASCADE
);

-- Editable Entity Type Templates (seeded from bundled JSON on first launch)
CREATE TABLE IF NOT EXISTS entity_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    default_qualities TEXT NOT NULL DEFAULT '[]',
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Global or Case-Scoped Typed Entities (people, organizations, vehicles, etc.)
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    is_global INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Typed Entity Qualities (including at most one 'reliability' quality per entity)
CREATE TABLE IF NOT EXISTS entity_qualities (
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

-- Optional Source Provenance Links for Entity Qualities
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
```

`cases` also carries `kind`, `event_date`, and `event_time`. The full migration chain (`src-tauri/src/database/migrations.rs`) spans v1–v11: `meta_sources` and `sources.reference_meta_source_id` were superseded by entities in v7 and dropped in v10, and editable `entity_types` were added in v11.

#### Schema Rules for AI Agents
- Never Hardcode Dynamic Metadata: Dynamic or expandable parameters (e.g., TLP ratings, coordinates, social handles) must be stored inside the `custom_metadata` JSON column.

- Cascading Deletes: Foreign keys must retain `ON DELETE CASCADE` so deleting a Case purges all related notes, sources, case-scoped entities, and media references.

- Reference Deletes Are SET NULL: `reference_source_id` and `reference_entity_id` use `ON DELETE SET NULL`. A citing source must survive its reference being deleted, keeping the rating it inherited; only the link is cleared.

- Relative File Paths: Store relative paths inside `source_attachments.relative_path` and `source_timestamp.ots_path` rather than absolute system paths to preserve workspace portability across machines.

### OpenTimestamps Proofs
The timestamping subsystem is in `src-tauri/src/opentimestamps/`. It is consensus-critical, so treat the
format as fixed rather than "cleanable".

- **The format is not ours to change.** `serialize.rs`, `op.rs`, `attestation.rs`, and `timestamp.rs` implement
  the OpenTimestamps proof format. Tags, LEB128 varuints, node ordering, and the magic header must match
  `python-opentimestamps` byte-for-byte. Proofs written with different rules cannot be verified by any `ots`
  client. `timestamp.rs` pins byte-for-byte against reference proofs; keep those vectors.

- **Calendar responses are binary.** `POST <calendar>/digest` takes the raw 32-byte digest as the body and
  returns a serialized `Timestamp` subtree. Never decode a calendar response as text — that silently corrupts
  the attestation. The response is merged into the proof with `Timestamp::merge`, not stored verbatim.

- **A calendar 200 is not a confirmation.** A proof is `confirmed` only after a `BitcoinBlockHeaderAttestation`
  is checked against the real block header (`bitcoin.rs`) and the attested commitment matches that block's
  merkle root. `verify_timestamp` leaves a proof `pending` whenever that check did not actually pass.

- **Proofs live at `<relative_path>.ots`.** The suffix keeps `photo.png` and `photo.jpg` from colliding.
  Deleting an attachment removes its proof; `record_timestamp` upserts so an unreadable proof can be replaced.

### Entities, Entity Types, and Source References
These features are coupled; changing one means checking the others.

- **Entities & Entity Types:** An **entity** is a typed object (person, organization, government, nation, vehicle, or custom type) defined by a template in `entity_types`. Built-in types ship as JSON under `src-tauri/entity-types/` and are seeded on first launch (`is_builtin = 1`, editable but not deletable); operators can create, edit, and delete custom types in `EntityTypeDesigner`. Entities can be global (`is_global = 1, case_id = NULL`) or scoped to a single case (`is_global = 0, case_id = <case_id>`).

- **Entity Qualities & Provenance:** Each entity stores typed attributes (`string`, `boolean`, `integer`, `date`, `coordinates`, `address`, `reliability`) in `entity_qualities`, with optional source provenance in `quality_source_refs`. An entity may have at most one `reliability` quality (Admiralty A–F).

- **Source References:** A source reference points at either a sibling source in the same case or an entity — never both, never itself, never across cases, and never in a cycle. `commands/references.rs` owns this validation; SQLite triggers back up the mutual-exclusivity invariant.

- **Rating inheritance is live.** Citing a sibling source inherits both `reliability_code` and `credibility_code`. Citing an entity inherits only `reliability_code` (from the entity's `reliability` quality), keeping `credibility_code` independently editable per source. `propagate_rating` and `propagate_entity_rating` push changes down the entire citation graph (including source-to-source chains rooted at entity-citing sources). Any new write path that changes a source rating or an entity's reliability quality must call them, or citations silently drift.

- **Only a *source* reference locks the stance.** Citing a sibling source duplicates one piece of evidence, so the stance is forced to none and the source is excluded from every case dashboard statistic (`isReferenceLinked` in `utils/analytics.ts`). Citing an **entity** keeps the stance editable and the source countable, because one entity (e.g., a wire service) can express several viewpoints across different captures. `ReferenceInput::locks_stance` (Rust) and `locksStance` / `referenceSupplies` in `ReferenceSelect.tsx` are the shared predicates — use them rather than re-deriving the conditions.

## 4. UI / UX Design System & Component Guidelines
### Dark Mode & Visual Styling
- Default Theme: Dark mode is mandatory. Use Tailwind's dark: classes or set standard dark background surfaces (bg-slate-900, bg-zinc-950, bg-slate-800/50).

- Accent Colors: Use tactical/neutral color palettes (Slate/Zinc with subtle accents like Amber/Emerald for reliability badges). Avoid high-saturation neon backgrounds.

- Component Layout Structure: Maintain a Master-Detail Layout:

    - Sidebar: Fixed width (w-64), collapsing list of Cases, global search, and global Entities view toggle.

    - Main Content Area: Tabbed view containing (1) Case Notes Editor, (2) Workspace (Sources Data Grid + Entities Panel & Type Designer), and (3) Analytics Dashboard (with Source Map).

    - Detail Drawers: Slide-over panels for inspecting/editing individual Sources (Admiralty ratings, provenance, coordinates, media previews, OpenTimestamps proofs) and Entities (qualities, provenance links).

## 5. Instructions for Coding Agents
When editing or generating code for this repository:

1. Type Safety: Always write strict TypeScript (.tsx / .ts). Avoid any types for SQLite query results or dynamic metadata objects.

2. Local File Operations: Perform all file reads/writes for media attachments through Tauri's FS API (@tauri-apps/plugin-fs) or custom Rust commands. Do not write direct browser-level file handlers.

3. State Synchronization: Ensure the Case Note editor auto-saves using debounced writes (500ms–1000ms delay) directly to the local SQLite database.

4. NATO Admiralty System Consistency: Ensure form controls for Source Reliability (A to F) and Information Credibility (1 to 6) include explicit tooltips explaining their definition per NATO STANAG 2064 standards.