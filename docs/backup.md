# Export and restore

Every endpoint requires a valid bearer session and scopes database reads and writes
to the authenticated user. Downloads use `Cache-Control: no-store`. Files contain
financial data, including merchant names and notes, and should be stored privately.
The server does not log their contents.

## Downloads

- `GET /api/v1/export/transactions` downloads UTF-8 CSV with all matching transactions.
  It accepts the normal transaction filters and sorting, excluding `page` and
  `pageSize`. Amounts remain exact integer minor-unit strings and the currency is
  included. CSV quoting preserves commas, quotes and line breaks. Cells that could
  execute spreadsheet formulas receive an apostrophe prefix. CSV is intended for
  analysis; it is not the lossless restore format.
- `GET /api/v1/export/backup` downloads a raw JSON document with
  `format: "finora-backup"`, `version: 1`, export time and base currency. It contains
  accounts, categories, transactions, budgets, goals, savings contributions,
  recurring rules and occurrences. It includes archived records and financial
  history. Server-derived balances and progress are recomputed after restore.
  User IDs, email, credentials, sessions, reset tokens and idempotency records are
  excluded. User profile and application preferences are not restored.

Both downloads are raw files, rather than the API success envelope. Errors retain
the usual JSON error envelope. A backup uses one MongoDB snapshot across its
collections. CSV is a bounded transaction query. Neither export stores a second
copy of the user's financial data on the server.

## Preview and merge

1. Send `POST /api/v1/import/preview` with `{ "backup": <downloaded JSON> }` and a
   fresh UUID `Idempotency-Key` header. The response reports added, unchanged and
   conflicting counts per collection, `canImport`, a `previewId`, a SHA-256
   `contentHash`, and an expiry time. No financial records are imported at preview.
2. Review counts. Send `POST /api/v1/import/commit` with `backup`, `previewId`,
   `contentHash`, `mode: "merge"` and `confirmation: "IMPORT"`, plus a new UUID
   `Idempotency-Key`. Retain this key when retrying the same commit after a timeout.
3. The server verifies that the preview belongs to the current user, has not
   expired or been consumed, and matches the complete validated backup content.
   It rechecks live conflicts and record limits, then imports all records in one
   MongoDB transaction. The successful response includes `imported: true` and
   the per-collection counts.

Previews expire after 15 minutes, with at most 20 active previews per user.
MongoDB TTL cleans up expired preview metadata. Only a hash and metadata are saved
for previews, rather than the uploaded financial data. A replay using the original
commit operation key returns its original result. Another operation key cannot
consume an already used preview.

Stable entity IDs preserve account, category, goal and recurrence relationships.
New records receive the authenticated user's ID on the server. A backup containing
any client-supplied `userId` is rejected. Identical existing records are skipped.
Different records sharing an ID, or conflicting monthly-category budget and
recurrence keys, block the complete import; existing financial data is never
silently overwritten. The backup must be self-contained, with valid references,
matching category types, consistent recurrence history and the current user's
base currency. Recurrence timezones remain those recorded in the backup.

**Decision:** restore supports merge only. Replacement restore is intentionally
unavailable because it would delete financial history. Export the current data
before resolving conflicts manually. Imports do not activate automatic posting:
recurring occurrences still require the normal explicit confirmation.

## Supported limits

Import bodies are streamed with a hard limit of 2 MiB, including the request
wrapper. Compressed uploads are rejected. Export refuses a JSON backup that would
not fit a subsequent restore request. Record limits are 200 accounts, 300
categories, 10,000 transactions, 1,200 budgets, 200 goals, 200 recurring rules and
10,000 recurring occurrences. Backups support at most 10,000 total savings
contributions and 1,000 per goal. A dataset above these backup limits returns an
explicit error instead of producing an incomplete download. CSV supports 10,000
transactions before filtering and has no pagination truncation.

Unknown versions, unknown fields, invalid amounts/dates, duplicate IDs, missing
references, invalid recurrence indices/timezones and incompatible currencies are
rejected. Validated transaction timestamps normalize to UTC. Preview cannot reserve
the database state: new conflicts caused by other devices block commit safely and
require a fresh preview.

Actual MongoDB tests cover ownership, secret exclusion, exact values, CSV formula
protection, quote/newline escaping, filtered exports, advanced-finance restore,
validation failures, tampering, expiry, replay, commit-time conflicts and size limits.
