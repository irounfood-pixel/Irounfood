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
2. Apply additive SQL before publishing `admin.html` and the two scripts.
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
