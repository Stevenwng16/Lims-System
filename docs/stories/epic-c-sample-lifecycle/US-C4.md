# US-C4 — Barcode printing

*Status: written with Opus 4.8 — reviewed with Fable 5 & approved 1 Jul 2026 (no changes) · build: phase 2*
> **User story**
> As a lab user, I want to print barcode labels for samples, so that every sample is physically labelled with its unique ID and can be scanned and tracked through the lab.

*Scope note: printing is a physical bench action that creates no job/sample data; it reads the immutable sample ID from US-C1. Label appearance (symbology, size, fields) is configured in Settings (US-A7, Identifiers & labels section).*
**Acceptance criteria**
1. A barcode is generated for each sample from its **immutable sample ID** (US-C1). The barcode encodes exactly that ID, so a scan resolves to one unique sample.
2. The barcode **symbology is configurable in Settings** (US-A7), defaulting to **Code 128**. Changing the symbology affects newly printed labels only; it never changes a sample's ID.
3. Printing is available from the job detail **Samples tab** (US-C3): a **print button per sample** and a **Print all** button for the whole job.
4. **Print all** produces one print job containing a label for every active (non-voided) sample in the job, in sample-ID order.
5. **Label content is configurable in Settings (US-A7).** By default a label contains: the barcode, the **human-readable sample ID** beneath it, the customer, and the sample type. The default deliberately omits a standalone job number, since the sample ID already contains it; additional fields (e.g. standalone job number, receipt date) can be switched on per organisation. The human-readable sample ID is **always** printed and cannot be removed, so a label stays usable if the barcode is damaged.
6. Labels are formatted for **standard label-printer stationery**; the label size is configurable in Settings (default 50 × 25 mm), and the layout scales to the configured size.
7. Reprinting is always allowed and produces an identical label (same ID); reprinting does **not** generate a new ID or alter the sample.
8. A voided sample (US-C1 / US-C3) is excluded from *Print all* and shows no print action.
9. Each print action (single or batch, which samples, by whom, when) is written to the append-only audit log (organisation context).
10. If no label printer/output is configured, the system falls back to a printable PDF sheet of the labels so a lab can start without special hardware.
**Frontend (UI)**
```plain text
Print preview — Job MAIN26-00042                         [ Print ]  [ Cancel ]

  ┌───────────────────────────┐   ┌───────────────────────────┐
  │  ||| ||||| || ||||| |||    │   │  ||| ||||| || ||||| |||    │
  │  MAIN26-00042.001          │   │  MAIN26-00042.002          │
  │  Acme Water Authority      │   │  Acme Water Authority      │
  │  Water                     │   │  Water                     │
  └───────────────────────────┘   └───────────────────────────┘

  Symbology: Code 128 · Size: 50 × 25 mm · Fields: ID, customer, type   [ Settings ]
  3 labels (1 voided sample excluded)
```
**Authorization**
- **Admin / Lab manager** — print single and all labels for jobs within their lab(s).
- **Analyst** — print labels for samples within their lab(s). *(Printing a label is part of physically handling samples at the bench; it does not create or change job/sample data, so it sits within the analyst's role even though they cannot create jobs.)*
- **Read-only** — no printing.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Barcode encodes the exact, immutable sample ID; a scan resolves to the right sample.
- Configurable symbology (default Code 128), label size (default 50 × 25 mm) and label fields (default: ID + customer + type, no standalone job number) verified; changing them never alters IDs.
- Single and Print-all verified, in sample-ID order, with voided samples excluded.
- Human-readable sample ID always present and not removable.
- Reprint produces an identical label and never mints a new ID.
- PDF fallback works with no label printer configured.
- All print actions appear in the audit log (organisation context).
**ISO 17025 / compliance**
- **§7.4** — unique identification of test items: physical labelling with the unique ID is exactly what the clause requires for handling and traceability.
- **§7.5 / §8.4 / ALCOA+** — print actions are recorded in the audit trail.
**Later (Part 11 / growth)**
- Label templates with per-organisation branding (logo) — lands with the branding work in epic F.
- Optional 2D symbologies (DataMatrix / QR) for small containers.
- Reconciliation: scanning a label back in confirms receipt at each handling step (chain-of-custody events).

## Changelog vs v1 (was: US-C4)
- **Cross-references renumbered** to v2: sample ID + void → US-C1, Settings → US-A7, printing entry point → US-C3 Samples tab, roles → US-A4.
- **AC 5 — label fields now configurable (review decision):** the default label **omits the standalone job number**, because the sample ID already contains it (this resolves the "job number shown twice" point); additional fields can be switched on per organisation. The human-readable sample ID stays mandatory on every label.
- **Label config home:** symbology, label size and label fields live in Settings (US-A7, Identifiers & labels section) — a small addition to that section, to confirm.
- **Organisation isolation** added (invariant 5): print actions carry organisation context.
- **Carried over from the v1 rework (unchanged):** barcode encodes the immutable sample ID (reprint never mints a new ID); default Code 128 + 50 × 25 mm; voided samples excluded; **PDF fallback** so a lab can start without a label printer; analysts may print within their lab (physical bench task).
- **Fable 5 review (1 Jul 2026) — approved without changes.** The Settings-side counterpart this story asked for now formally exists: label configuration (symbology, size, fields) is anchored in the new US-A7 AC 9, together with the sample-type list.

---
# Epic D — Batch processing & data
