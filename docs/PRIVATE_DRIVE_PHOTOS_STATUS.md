# Private Google Drive order photos

New administrator photo uploads use the owner's private Drive folder. Existing Supabase photos remain in place, and both providers are supported for administrator deletion and Excel downloads. The existing ML portal URL is preserved and can export eligible Drive photos without receiving administrator privileges.

## Components

- Owner Apps Script project: https://script.google.com/home/projects/1iJ5LD6VowKBEv9GkkwTdXYD5UL7pl7wWbON8KU3mhF8Fgqely05pwWuB/edit
- Photo bridge deployment, version 2: https://script.google.com/macros/s/AKfycbzi85enDr1GuIpCd4AhRdqfsqJs7TWu7ksVb2MlfN3p2DSoWRyCDXl9AfHq1rlN42dE/exec
- Supabase `order-photo-drive`, version 1: authenticated administrator proxy and scoped ML read adapter.
- Supabase `partner-photo-export`, version 3: original ML-only manifest checks, plus Drive references.
- Existing ML Apps Script project, version 10: https://script.google.com/home/projects/1Hrq4ekWBAgh59R4sKLYKeNCeAeGezOUwXfnB2UngXJjSC0Oq8MVVJF0T/edit
- `scripts/patch_ml_drive_export.cjs` applies only the download changes to the original portal HTML, preserving server-side order handling.
- `admin-drive-test.html` is a separate verification page; the operational page remains `admin.html`.

The user explicitly authorized Google Drive management and external-service scopes, then explicitly authorized an internet-callable, owner-executed bridge guarded by administrator authentication. An earlier automatic review rejection was resolved by the user's subsequent specific approval. No file or folder sharing permissions were opened.

## Access and storage

Administrator requests first validate the current user through Supabase Auth, then enforce the existing orders SELECT RLS. Apps Script independently checks the same order with that user's token before any Drive operation. The caller cannot choose another project, backend URL or forwarded credential. No service-role key or new persistent secret is sent to the browser or stored in Apps Script.

ML access reuses the existing public portal share-link capability, limited to read-only photo export for the one fixed ML sheet. Drive reads must also appear in the current approved-order photo manifest. Caller-provided file IDs cannot authorize access. This capability cannot upload or delete photos.

Files live under private per-order folders. Existing `order_photos` metadata stores `order UUID/drive/Drive file ID`; no schema migration was needed. Uploads retain original bytes, with the existing 5 MB per-file and 10 files per-selection limits. JPEG and PNG bytes remain unchanged in Excel. WEBP is decoded at native dimensions and encoded as lossless PNG because Excel's image embedding does not support WEBP.

Duplicate request IDs reuse metadata rather than creating duplicate attachments. Failed metadata inserts compensate by trashing unreferenced files; uncertain commits are checked before cleanup. Drive deletion uses recoverable Trash and restores a file if metadata deletion fails.

## Validation

- 34 Node tests: administrator and ML authorization, order/folder isolation, bounds and image signatures, duplicate IDs, original bytes, failure compensation, preserved ML server/order code, and native-size WEBP conversion.
- Actual administrator and ML source scripts compiled without execution errors.
- Live owner-side Drive check created a private PNG, read identical bytes, and trashed only its disposable fixture.
- Live direct bridge invalid-token and unauthenticated proxy requests were rejected.
- Live database RLS allowed administrator order access and fixture metadata insertion/deletion, and denied a non-administrator access to the order and photo.
- Live ML browser export traversed the deployed ML page, export manifest, proxy, private Drive bridge and Excel generation. The resulting workbook contained the original 82-byte PNG with SHA-256 `1a16762778aeca6035defcae12e6a2bd168516c165caf8363068605d5e01f552`, exactly matching its source. The workbook's download notification appeared, and its downloaded ZIP media was inspected.
- Fixture metadata was deleted and its private Drive file/folder were trashed. Existing 4 photos remained. The owner-only fixture helper was removed from the saved source and was never deployed publicly.
- Existing orders: 48; order items: 82. Before/after hashes were unchanged: orders `d4f99ad7eeb2a6d9ae51e1dcb877329f`, items `b8f963c2ffdbfff2b3e1b25d79b634ec`, inventory `0e491ecbc7fc69beddacfa586700ccb2`.

The administrator browser sign-in attempt returned invalid credentials, so an authenticated upload through that browser screen was not performed. The administrator proxy is covered by mocked Auth/HTTP tests and the live database RLS checks; Drive storage and ML photo-to-Excel were exercised live. This distinction should be retained in future handoffs.

Run local checks with `node --test tests/*.test.*`. Do not re-run the live owner fixture helper without a reason; it creates and then trashes disposable Drive files.

For rollback, restore only the old upload loop if needed. Keep Drive-aware read/delete support for any already-created Drive photos. Do not revert to a Supabase-only downloader while Drive metadata exists.
