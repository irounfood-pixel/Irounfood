# Private Drive order photos — prepared, not enabled

Apps Script project: https://script.google.com/home/projects/1iJ5LD6VowKBEv9GkkwTdXYD5UL7pl7wWbON8KU3mhF8Fgqely05pwWuB/edit

The owner signed into Google. A separate private Apps Script project was created and the prepared bridge saved. Google requested additional device verification before showing the OAuth consent scope. No OAuth consent has been granted by the agent, no webapp deployment exists, and the production photo path is unchanged.

The bridge checks each current administrator JWT against the existing orders SELECT RLS policy before accessing Drive. It stores uncompressed bytes under the private order-photo root, adds existing order_photos metadata with storage_path = order UUID + /drive/ + Drive file ID, and supports original download and recoverable trash with metadata failure compensation. It does not use a service-role key or grant file-sharing permissions.

Validation: node --test tests/order_photo_drive.test.cjs — 14 mock tests passed. These cover invalid credentials, non-admin denial, order and folder isolation, image limits/signature, duplicate IDs, metadata failure cleanup, uncertain commit, original-byte download and delete compensation. Live OAuth, upload, cross-origin browser access, and ML Excel are NOT yet verified.

## Remaining steps

1. Finish Google device verification, inspect the actual consent screen, explain full requested Drive and external-request scopes, and obtain the required action-time confirmation before granting access.
2. Run checkPhotoDriveConnection and verify the private folder and server connection.
3. Deploy a separate bridge webapp (owner execution, authenticated application requests). Its public health response contains no user data; photo operations always enforce Supabase administrator RLS.
4. Implement and verify admin upload/read/trash adapter and legacy Supabase fallback in a test page before production activation.
5. Extend the existing private ML portal photo export to resolve /drive/ references using owner-side Drive access only after the current ML order manifest has authorized each photo. Preserve ML-only visibility; never use a global Drive read endpoint for ML users.
6. Verify original images in admin and ML Excel exports, multi-photo counts, error recovery, existing photos and existing orders/inventory, then enable new-photo uploads only.

Do not activate production Drive upload until both download consumers support the new path. Preserve all existing Supabase files.
