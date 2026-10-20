# Implemented API

Prefix `/api/v1`; JSON bodies at most 16 KiB; unknown fields rejected.
Success: `{ success: true, data, meta: { requestId } }`.
Failure: `{ success: false, error: { code, message, details? }, meta: { requestId } }`.
All responses include X-Request-Id and Cache-Control: no-store.

| Method | Route                       | Input and result                                                                         |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | /auth/register              | email, password (12–128), name; optional preferences/deviceName; tokens/public user; 201 |
| POST   | /auth/login                 | email, password, optional deviceName; tokens/public user                                 |
| POST   | /auth/refresh               | refreshToken; rotates both tokens; replay revokes family                                 |
| GET    | /auth/me                    | Bearer token; public user/preferences                                                    |
| POST   | /auth/logout                | Bearer token; revokes this device                                                        |
| POST   | /auth/logout-other-sessions | Bearer token; revokes other devices                                                      |
| POST   | /auth/forgot-password       | email; generic known/unknown account response                                            |
| POST   | /auth/reset-password        | token, password; single use, 30-minute expiry; revokes sessions                          |
| POST   | /auth/change-password       | Bearer; currentPassword, newPassword; revokes all sessions                               |
| DELETE | /auth/account               | Bearer; password, confirmation: "DELETE"; permanent atomic deletion                      |
| GET    | /api/health                 | Outside version prefix; minimal database status; 503 on failure                          |

Protected routes require `Authorization: Bearer <accessToken>`. Tokens are random
43-character base64url strings; expiresIn is 900 seconds. Public responses omit hashes.
Financial endpoints remain planned until explicitly documented here as implemented.

## Accounts and categories (implemented)

GET/POST /accounts; GET/PATCH/DELETE /accounts/:id; GET/POST /categories;
PATCH/DELETE /categories/:id. GET lists optionally accept includeArchived=true.
DELETE archives these entities and preserves financial history; PATCH restores them.
Updates send full editable DTO plus version; stale versions return 409.
POST /onboarding/categories with {} creates 17 defaults once, even across retries.

Every financial mutation requires a UUID Idempotency-Key header. Retrying the same
method/path/input with the same key returns the original result. Reusing a key for
different data returns 409. Keys are scoped to the authenticated user. User-level
transaction serialization protects reference validation and deletion races.
Accounts use the profile currency; input cannot supply ownership or currency.
Initial safety limits: 200 accounts and 300 categories per user, including archives.

Auth mutations are limited to 60 network attempts per 10-minute bucket. Registration,
login and recovery additionally allow 10 attempts per normalized email per bucket.
429 includes Retry-After. Forwarded IPs require a trusted proxy that replaces headers.

Reset emails link to the working web form at /reset-password?token=... . Local outbox
messages are written to ignored .local/outbox under the API process working directory.
