# Architecture frames (ADR-1…4) — summary

Full text (Dutch) lives on the Notion page *LIMS — Architectuurbeslissingen & beslislog*. Requirements are **fixed in story ACs**; the mechanism is yours — choose at build time, within the frame, and log it in `decision-log.md`.

## ADR-1 — Tenancy
Requirements fixed in: US-A1 AC 13 · US-A2 AC 2 + 8–10 · US-A7 AC 3. Decide **at the first database schema**: isolation mechanism (advice: shared DB + `organisation_id` + row-level security; schema/db-per-tenant acceptable), DB flavour (Azure SQL vs Azure Database for PostgreSQL — both do RLS), subdomain vs path routing. Design rules that always hold: `organisation_id` on every table; no cross-tenant joins; ID sequences per organisation + lab (+ reset period); tenant-separated storage prefixes.

## ADR-2 — Result model
Requirements land in US-D4/D5/D6 (written): one append-only measurement table for client **and** QC results; `entered` → `valid`/`rejected`/`superseded`; supersede + mandatory reason; value types numeric / censored (`<`/`>` + boundary; org-configurable extra qualifiers, default incl. "n.b.") / text / no-result+reason; "current result" is a derived view, never a mutable column; post-completion replacement = LM/Admin + reason + §7.8.8 flag (US-D6 AC 8). Decide: event structure (advice: status on record + transitions in audit) and numeric storage (decimal, never float).

## ADR-3 — Raw data & attachments
Requirements fixed in: US-B1 AC 6 · US-B2 AC 2 · US-B3 AC 3 · US-C1 AC 6 · US-D4 AC 9 · US-D5 AC 8. One attachment facility: immutable files (replace = new version), SHA-256 checksum, tenant-separated prefixes, polymorphic link, download follows role/lab scoping, upload = audit event. Mandatory capture: import source file (before any record), completed worksheet before review, certificates. Retention follows the parent record. Decide **at US-B1** (first file-storing story): storage mechanism (advice: Azure Blob — immutability + versioning built in).

## ADR-4 — Excel strategy & numeric notation
Phase 1 (MVP): Excel is the calculation medium — template versioned + checksummed (US-B1 AC 6), completed worksheet stored per batch, only final results enter the model. Notation: canonical storage with decimal point at full precision; display per locale; import separator **declared per configuration, never auto-detected**; ambiguous = rejected; thousands separators forbidden; rounding only at reporting, **round half up** system-wide. Phase 2 (post first paying customer): embedded in-app worksheet via an embeddable spreadsheet SDK (candidate: Univer, Apache-2.0). Decide at US-D5: parser approach + import-event snapshot shape.
