# Material inventory v2 (staging only)

Additive administrator module; does not migrate, update, or auto-deduct existing inventory or orders.

## Data model
- Separate `stock2_items`, `stock2_recipes`, `stock2_events`; raw / semi / product classifications.
- Unknown actual stock is NULL, not zero. Counts are integers; mass is kg.
- Recipes remain draft until reviewed. Semi-to-semi recipes supported with cycle rejection.
- Purchase units convert into base units; approximate factors are marked estimated.
- Set actual count, receive, manually reserve, issue, and produce. Production records actual consumed quantities and output atomically; no inferred loss.
- Admin-only RLS and RPC. Idempotency keys and version checks reject duplicate or stale updates.

## Capacity
Immediate additional assembly uses existing component stock minus manual reservations. Shared components aggregate in the planner. Capacities per product cannot be added together. The pure planner supports multi-product demands and recursive production, but the first UI deliberately shows immediate assembly only. It is not a shipping promise and does not infer reservations from orders.

## Deployment gate
1. Review SQL and verify admin authorization on a staging project.
2. Apply `supabase/material_inventory_v2.sql`, then `supabase/material_production_plans.sql` to an isolated staging database before publishing `admin.html` and the two scripts.
3. Browser-test authorized/non-admin sessions, navigation/modal saves, mobile view, purchase conversion, production rollback, retry, and stock count entry.
4. Import a private, reviewed catalog only through authorized paths; never commit recipe data or real customer information to this public repository.
5. Start with blank counts and draft recipes. Enter real counts and confirm recipes before relying on capacity.
6. Verify old orders and stock remain unchanged.

Not deployed: local PostgreSQL-compatible checks are not a replacement for authenticated staging/browser QA. Local Chromium launch was blocked by environment socket policy.

## Tests
- `node tests/inventory_planner.test.cjs` (19 cases)
- `node tests/material_inventory_lifecycle.test.cjs` (3 mocked-DOM cases)
- `PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/material_inventory_db.test.cjs` (33 checks)
- `node tests/material_inventory_ui.test.cjs` requires Playwright and Chromium; currently not executed successfully.
- Existing order materials/documents/workflow/backguard regressions pass.

## Rollback
Remove the materials menu, route, and script includes to hide the module. Preserve new tables/events for audit; do not drop or rewrite legacy inventory. No order triggers are installed.


## Date-based production plans (test branch only)
- A plan stores a Korea-local calendar date, one or more semi/product targets, new-production quantities, a short memo, and planned/cancelled state.
- Plan save/edit/cancel has NO inventory effect. Production completion remains a separate actual-use transaction. There is no automatic order linkage, stock reservation or completion based on the plan.
- Daily calculation combines all loaded planned rows for one date and shares one component stock ledger. Target finished stock is ignored because the user is specifying new production, not a delivery demand.
- Immediate mode uses existing raw/semi stock only. Optional recursive mode produces missing semi items using confirmed recipes. Missing stock/recipes are explicitly unknown; no hidden assumption of zero stock.
- Current saved recipes are used each time, with whole batches and no inferred loss. Results are not a historical recipe snapshot or shipment promise. Other days' plans and outstanding orders are NOT automatically deducted; manual reservations are deducted.
- Query is filtered by date server-side. At 1,000 rows the UI refuses aggregate calculation instead of showing a potentially incomplete total.
- Admin-only read/RPC; optimistic version checks prevent overwrites. Request IDs make exact retries idempotent; a changed payload after an ambiguous network response is blocked.
- New SQL is a reviewable draft setup script, NOT applied to any hosted database. No actual recipes or customer records are seeded.

## Verification update
- Production-plan DB suite: 34 checks passed in isolated PGlite (admin/non-admin/no-identity access, dates, quantities, duplicate targets, exact retries, stale edits, cancellation and unchanged inventory).
- Production-plan DOM suite: 40 checks passed in JSDOM (create/edit/cancel, date query, shared materials, recursive option, unknowns, cap, escaping, ambiguous retry, unchanged stock).
- Existing local DB suite: rerun separately before release. UI and lifecycle/pure suites remain required.
- Chromium could not start due `socket() failed: Operation not permitted` even with a temporary home. This is NOT a real-browser or visual QA pass. Authenticated Supabase/PostgREST integration also remains untested.
- SQL checks now fail closed when `private.is_admin()` is NULL, rather than allowing a no-identity authenticated role past the write guard.

Test dependencies may be installed outside the repository. Run with `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite` and `JSDOM_MODULE=/absolute/path/to/jsdom` for the respective suites. Never point tests at production credentials.

## Excel stocktake (schema v1)
- Deploy `supabase/material_inventory_excel.sql` before publishing the UI.
- `재고입력` sheet, first-row headers: `품목ID | 분류 | 품목명 | 기준단위 | 현재재고 | 실재고 | 메모 | 버전`.
- Download fetches fresh active inventory, not the filtered table. Only actual-stock and event-note columns are editable. Additional instruction/print sheets are ignored.
- Blank actual-stock skips the item; zero replaces stock with zero. This is stocktake, not additive receipt. Legacy inventory/orders, reservations and recipes are not modified.
- Maximum 5MB .xlsx / 2,000 item rows; no formulas/links in input sheet; kg ≤6 decimals, count units integers. Validate stable ID, kind/name/unit, duplicates and optimistic version. Partial files accepted, unknown rows rejected.
- Upload preview performs no writes. Confirmation sends one admin-only RPC; shared inventory advisory lock serializes changes. Any row failure rolls back the whole batch. Request UUID and exact payload ensure safe retries. One batch audit event records every item's before/after and notes; UI expands the event detail.
- A stale file is rejected, never automatically rebased. Download again after edits. A network-uncertain save must retry the same payload/request; do not issue a new request without checking history.
- No production stock edits are required to deploy or test. Tests use anonymous fixtures and isolated PGlite/JSDOM.
