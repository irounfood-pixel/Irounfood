# ML scope and photo export correction

## Files
- `supabase/ml_portal_direct_admin_orders.sql`: adds service-only scoped photo and hidden-source UID RPCs; direct order overflow becomes an explicit error rather than dropping old orders.
- `supabase/functions/partner-photo-export/{index.ts,core.mjs,gateway.mjs}`: validates then passes date/order filters to SQL before the 201-photo sentinel.
- `supabase/functions/partner-portal-manage/index.ts`: all successful responses omit hidden row metadata; stale UID mutations are rejected before execution.
- `tests/ml_scoped_manifest.test.mjs tests/ml_portal_scope_edge.test.mjs`: focused regression tests.

## Deployment order
1. Record existing function definitions, grants and Edge deployment versions. Production inspection found `partner-portal-manage` v8 and `partner-photo-export` v4, matching repository originals.
2. Apply the manifest SQL and `supabase/ml_portal_mutation_scope_guard.sql` in staging, check function execution is denied for PUBLIC/anon/authenticated, and verify sample results with service role.
3. Test pending/unlinked sheet rows remain available; linked deleted/cancelled/explicit non-ML rows are hidden; direct ML remains allowed; unclassified unlinked orders stay excluded. No name-based exposure.
4. Apply the reviewed SQL in production. It modifies no order, shipping, photo, inventory or partner row data.
5. Deploy photo Edge with all three files, preserving existing verify_jwt=false and the existing bearer-hash check. Deploy portal Edge preserving its token-checked RPC flow. Never expose service-role keys.
6. Apply companion Apps Script hidden_uids filtering and redeploy existing webapp, preserving its fixed URL. SQL and Edge alone do not hide raw spreadsheet rows.
7. Check target 260075 after separately approved classification change, 260077/260080, linked 260073/260076, date filtering and both Excel modes. Verify no duplicate orders, cross-partner data or cancellation leakage.

## Bounded behavior
- At most 200 photo references per response; 201 means explicit HTTP 413, not a partial successful response.
- At most 20,000 selected source rows; 20,001 produces a failure rather than partial results.
- Direct order listing currently still has a 1,000 order safety limit; crossing it now fails explicitly. Pagination is required before that scale, rather than silently omitting older orders.
- Old no-argument manifest remains only for compatibility/diagnostics; all updated photo requests must use the scoped RPC.

## Verification completed locally
`node --test tests/ml_drive_manifest.test.mjs tests/ml_scoped_manifest.test.mjs tests/ml_portal_scope_edge.test.mjs`: 18/18 pass. Includes >201 older photos with a newer single-order/date request, 200-photo overflow, invalid authentication/parameters, unknown order, unexpected gateway scope, and SQL grant/filter guards.

Staging SQL fixtures passed with rollback, including 250 historical photos, date/order scoping, non-ML/cancelled/deleted/legacy cases, hidden UID/token/grant checks, and atomic public cancel/update rejection after classification change. No fixture orders remained. Actual production deployment/browser/Excel verification remains the deployment owner’s responsibility. No local Deno binary was available.
