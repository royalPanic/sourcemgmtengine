# AGENTS.md — Development Guidelines for OSINT Case Manager

This document establishes the architecture, design principles, and coding standards for AI agents contributing to the OSINT Case & Source Manager codebase.

---

## 1. Project Overview & Premise

The **OSINT Case & Source Manager** is a modern, local-first Windows application built for managing intelligence cases, structured source evaluation, narrative case notes, and media evidence attachments.

### Core Intent
* **Zero Third-Party Cloud Dependencies:** All database records, user notes, and media attachments must live entirely within local user directories.
* **Granular Intelligence Evaluation:** Native integration of NATO Admiralty System ratings (Source Reliability A–F, Information Credibility 1–6) and expandable key-value metadata for specialized OSINT workflows.
* **Modern Desktop Aesthetic:** Responsive, high-contrast, dark-mode-first UI tailored for multi-monitor desktop analysis.

---

## 2. Technical Stack & Standards

| Component | Technology | Primary Role |
| :--- | :--- | :--- |
| **Desktop Shell** | Tauri v2 (Rust backend) | Native OS integration, secure filesystem operations, SQLite bindings |
| **Frontend Framework** | React 18+ (TypeScript) | Declarative UI, state management, component architecture |
| **Styling** | Tailwind CSS | Utility-first styling, design system tokens, native dark mode |
| **Data Layer** | SQLite (`tauri-plugin-sql` / `rusqlite`) | Local relational storage and transaction handling |
| **Rich Text / Notes** | TipTap or Lexical | Markdown-compatible case note editor with local state syncing |

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

-- Global, reusable entities (people and organisations) that sources report on
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
```

`cases` also carries `kind`, `event_date`, and `event_time`; `sources` also carries
`stance`, `source_date`, `source_time`, `reference_source_id`, and
`reference_meta_source_id` (added in migrations v2–v4).

#### Schema Rules for AI Agents
- Never Hardcode Dynamic Metadata: Dynamic or expandable parameters (e.g., TLP ratings, coordinates, social handles) must be stored inside the custom_metadata JSON column.

- Cascading Deletes: Foreign keys must retain ON DELETE CASCADE so deleting a Case purges all related notes, sources, and media references.

- Reference Deletes Are SET NULL: `reference_source_id` and `reference_meta_source_id` use ON DELETE SET NULL. A citing source must survive its reference being deleted, keeping the rating it inherited; only the link is cleared.

- Relative File Paths: Store relative relative paths inside source_attachments.relative_path rather than absolute system paths to preserve workspace portability across machines.

### Meta Sources and Source References
These two features are coupled; changing one means checking the other.

- A **meta source** is a person or organisation (news agency, official, spokesperson) that persists across all cases and events. It carries its own Admiralty rating.

- A **source reference** points at either a sibling source in the same container or a meta source — never both, never itself, never across containers. `commands/references.rs` owns this validation; SQLite triggers back it up.

- **Rating inheritance is live.** A citing source mirrors its reference's rating, and `propagate_rating` / `propagate_meta_rating` push changes down the chain. Any new write path that changes a rating must call them, or citations silently drift.

- **A citing source never carries a stance.** This is intentional: repeated reporting of one core source must not read as independent corroboration. Reference-linked sources are excluded from every event dashboard statistic (`isReferenceLinked` in `utils/analytics.ts`).

## 4. UI / UX Design System & Component Guidelines
### Dark Mode & Visual Styling
- Default Theme: Dark mode is mandatory. Use Tailwind's dark: classes or set standard dark background surfaces (bg-slate-900, bg-zinc-950, bg-slate-800/50).

- Accent Colors: Use tactical/neutral color palettes (Slate/Zinc with subtle accents like Amber/Emerald for reliability badges). Avoid high-saturation neon backgrounds.

- Component Layout Structure: Maintain a Master-Detail Layout:

    - Sidebar: Fixed width (w-64), collapsing list of Cases, global search, and workspace settings.

    - Main Content Area: Split panel or tabbed view containing (1) Case Notes Editor and (2) Source Data Grid.

    - Detail Drawer: Slide-over modal or panel for inspecting individual Source parameters, Admiralty rating matrices, and media previews.

## 5. Instructions for Coding Agents
When editing or generating code for this repository:

1. Type Safety: Always write strict TypeScript (.tsx / .ts). Avoid any types for SQLite query results or dynamic metadata objects.

2. Local File Operations: Perform all file reads/writes for media attachments through Tauri's FS API (@tauri-apps/plugin-fs) or custom Rust commands. Do not write direct browser-level file handlers.

3. State Synchronization: Ensure the Case Note editor auto-saves using debounced writes (500ms–1000ms delay) directly to the local SQLite database.

4. NATO Admiralty System Consistency: Ensure form controls for Source Reliability (A to F) and Information Credibility (1 to 6) include explicit tooltips explaining their definition per NATO STANAG 2064 standards.