# Private Drive order photos — prepared, not enabled

Apps Script project: https://script.google.com/home/projects/1iJ5LD6VowKBEv9GkkwTdXYD5UL7pl7wWbON8KU3mhF8Fgqely05pwWuB/edit

The owner completed Google device verification and explicitly authorized Drive file management and external-service scopes. Both displayed scopes were granted. checkPhotoDriveConnection completed successfully and verified the private folder and server connectivity. Production photo handling is unchanged. No successful webapp deployment exists.

Automatic approval review rejected changing the webapp audience from Only me to All users and publishing it, because owner-executed Drive access would become callable at a public endpoint without specific approval for that exposure. Do not retry or bypass that rejection. An owner-only deployment was considered, but it does not provide the direct cross-origin background upload needed by the current external administrator page. The pending deployment was cancelled. Specific user approval for an internet-callable, owner-executed endpoint guarded by the existing administrator RLS is required before that publication. Photos and folders themselves must stay private.

The bridge checks each current administrator JWT against the existing orders SELECT RLS policy before accessing Drive. It stores uncompressed bytes under the private order-photo root, adds existing order_photos metadata with storage_path = order UUID + /drive/ + Drive file ID, and supports original download and recoverable trash with metadata failure compensation. It does not use a service-role key or grant file-sharing permissions.

Validation: node --test tests/order_photo_drive.test.cjs — 14 mock tests passed. These cover invalid credentials, non-admin denial, order and folder isolation, image limits/signature, duplicate IDs, metadata failure cleanup, uncertain commit, original-byte download and delete compensation. Live OAuth and the read-only private-folder/server connection check passed. Live upload, cross-origin browser access, and ML Excel are NOT yet verified.

## Remaining steps

1. Google authentication, owner confirmation for the two requested scopes, and checkPhotoDriveConnection are complete.
2. Resolve specific user approval for the internet-callable webapp deployment (blocked by automatic approval review). Do not treat the prior scope approval as approval to publish an owner-executed endpoint.
3. Deploy a separate bridge webapp (owner execution, authenticated application requests). Its public health response contains no user data; photo operations always enforce Supabase administrator RLS.
4. Implement and verify admin upload/read/trash adapter and legacy Supabase fallback in a test page before production activation.
5. Extend the existing private ML portal photo export to resolve /drive/ references using owner-side Drive access only after the current ML order manifest has authorized each photo. Preserve ML-only visibility; never use a global Drive read endpoint for ML users.
6. Verify original images in admin and ML Excel exports, multi-photo counts, error recovery, existing photos and existing orders/inventory, then enable new-photo uploads only.

Do not activate production Drive upload until both download consumers support the new path. Preserve all existing Supabase files.
