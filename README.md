# Ubiqedge People & Structure

A private, database-backed organizational chart workspace. Supplied CSVs are normalized into the initial source document; the originals are not modified.

**Deploy from GitHub:** follow [GITHUB-TO-CASAOS.md](GITHUB-TO-CASAOS.md) for the first installation, private-repository access, Supabase setup and later updates. The guide also explains who approves and why business approvers do not need database-admin rights.

**Current CasaOS login setup:** [CLOUDFLARE-ACCESS.md](CLOUDFLARE-ACCESS.md) configures Cloudflare-only sign-in at `orgchart.dalvi.cloud` with server-enforced editor, HR, assigned-approver and viewer permissions. No new SQL migration or database-admin accounts are required. The old password remains active until `APP_AUTH_MODE=cloudflare` is deliberately configured with the correct team hostname/AUD.

## Using the tool

1. In Cloudflare mode, sign in with your permitted work email; the top bar shows your verified identity and role, and edits are automatically attributed to that email. Local/legacy password mode still uses a manually entered name.
2. Resolve the seven initial Data review items: four unspecified executive reporting lines, the Active/Intern records on the inactive tab, and the incomplete Ashish record.
3. Use **Import sheets** to select one or more CSV/XLSX files or workbook tabs together, including Active Emp, Inactive Emp, and Departments for oct changes. Preview all changes before one save. Employee IDs are stable keys; duplicate IDs across selected sheets are blocked. Absent rows are retained. Conflicting inactive-sheet statuses go to review. Department definitions can be saved as proposals (default) or current function descriptions, without moving employees or changing managers.
4. Click any employee to edit, add a joiner manually, change direct/functional managers, or mark an exit after reassigning active reports. Cycles and duplicate IDs are blocked.
5. Use Departments for functions. In Cloudflare mode, use **Review & approval** for HR validation, assigned stakeholder approval and review settings; editors have read-only access to this page. Local/legacy mode keeps the original records under **Change log → HR validation & approvals**. October functions remain proposals until explicitly applied; employee assignments are never guessed.
6. HR validates the exact version, then required stakeholders approve. In Cloudflare mode, a direct approval must match the signed-in email assigned to that stakeholder. HR can also record genuine external email/signature evidence, explicitly identified as an external record. Keep those originals in the official archive. No email requests are automatically sent; these are not qualified electronic signatures.
7. Download a JSON master backup and PDF/Word/PowerPoint/Excel/SVG exports. Structural changes create a new draft; historical evidence remains available. Restoring a backup creates a new draft and archives imported approval references.

## Persistence and access

For your own Supabase/CasaOS deployment, use [CLOUDFLARE-ACCESS.md](CLOUDFLARE-ACCESS.md) for the current login/roles setup or [SELF-HOSTING.md](SELF-HOSTING.md) for legacy password mode. The existing `npm run dev` preview continues to use its local D1 database and preserves your edits. The standalone `build:selfhost`/`start:selfhost` path uses Supabase and does not require Sites. Cloudflare mode validates Access JWTs server-side and never accepts the old app password as a fallback. Live CasaOS/Cloudflare activation is separate from building the source.

The selected backend (local/Sites D1 or self-hosted Supabase) is authoritative; browser storage contains only the editor-name preference. Every confirmed change uses a compare-and-swap revision check and saves a database snapshot. Multiple tabs cannot silently overwrite one another. Download a master backup for independent recovery and handover. The review date tracks the monthly due date but does not send reminders.

The old Sites deployment/local preview and explicit basic-password mode retain legacy full editing access and self-reported evidence; the new Cloudflare role enforcement applies only to the standalone CasaOS deployment. Do not publish or share the old preview as a role-restricted app. Backups from another source are historical references, not newly authenticated confirmations. Exact role email lists stay on the server and cannot be edited through a chart upload or the HR reviewer list.

## Export behavior

- PDF: vector, large-format full chart plus A4 paginated employee register, document control, functions, evidence, revision history and unresolved issues. Use digital zoom or poster printing for the full chart.
- Word: executive overview and paginated reporting-card images, plus editable, readable reporting and control tables. The diagram itself is not a Word-native shape group.
- PowerPoint: editable text, cards and connectors with control/history slides.
- Excel: employee data plus instructions, control, history, approval evidence, required approvers, functions, and October proposals. Re-import the Employees sheet for data changes. Full master restore uses JSON.
- SVG: vector chart only.
- JSON: complete current master, historical evidence references and change log. Separate older saved snapshots can be downloaded from Change log.

## Development and verification

Run `npm install`, then `npm run db:local` once and `npm run dev`. Build with `npm run build`. The local database configuration uses the same logical binding as the Sites scaffold. Hosted migrations are generated by Drizzle and packaged with the Sites hosting helper.

Run `npm test` with the development server running. Tests cover source counts, name resolution, import merges, row omissions, forward references, duplicate/cyclic reporting, source-status conflicts, approval gating and invalidation, nonoverlapping chart geometry, XLSX round-trip, PDF/DOCX/PPTX output structure, optimistic concurrency, and cross-origin write rejection.

For CasaOS, run `npm run build:selfhost`, `npm run test:selfhost`, and `npm run test:access`. The latter verifies cryptographic login checks, email roles, impersonation prevention, approval sequencing, protected endpoints, UI permissions and restore safety without touching a live Cloudflare account or database.

No interactive browser QA was requested. The optional WebMCP tools are feature-detected; they have not been validated in a supported WebMCP browser context. Their actions are read-summary and open-editor only; neither saves data.

Limits: CSV/XLSX up to 5 MB, 500 employees, and 1.5 MB per master save. XLS must first be saved as XLSX. Approval archive stores references, not attachment bytes. Exported documents and backups contain personal information; distribute them through approved internal channels.
