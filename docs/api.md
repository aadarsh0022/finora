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
Implemented finance routes follow below. See also [budgets/goals/recurrence](advanced-finance.md)
and [export/import](backup.md) for the remaining implemented endpoint contracts.

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

## Transactions and overview (implemented)

GET/POST /transactions; GET/PATCH/DELETE /transactions/:id. POST/PATCH accepts type,
accountId, positive amountMinor integer string, offset-aware date, optional merchant,
note/tags; categoryId for income/expense, destinationAccountId only for transfer.
PATCH also requires version; DELETE requires version and confirmation: "DELETE".
Duplicate a transaction by POSTing its editable fields with a new operation key.

GET filters: page/pageSize (max 100), type, accountId (source or destination), categoryId,
from/to UTC timestamps, minAmount/maxAmount, q (literal note/merchant search), sort
(newest/oldest/highest/lowest). Amount sorting/filtering uses exact Decimal128 values.
Responses contain items/total/page/pageSize. All queries are scoped to the user.

Transfers are one atomic ledger document. Balance is opening + income - expense +
incoming transfers - outgoing transfers. Edits/deletion automatically affect derived
balances. GET /accounts and /accounts/:id include balanceMinor. Archived history
remains readable; new references to archived accounts/categories are rejected.

GET /reports/overview?month=YYYY-MM uses the user's timezone and returns actual
tracked balance (including archived accounts), monthly income/expenses/net flow,
savings rate (null with zero income), category spending and recent records.
Snapshot reads keep accounts/ledger internally consistent. Initial cap: 10,000
transactions per user; no unbounded report scans. No FX mixing or income/expense
inflation from transfers. Refunds currently count as income and do not reduce expense
budgets; later budgeting must follow this explicit policy.

GET/PATCH /settings returns/persists preferences and version. Updates are idempotent,
reject stale versions, and prohibit currency changes after account creation.

Auth mutations are limited to 60 network attempts per 10-minute bucket. Registration,
login and recovery additionally allow 10 attempts per normalized email per bucket.
429 includes Retry-After. Forwarded IPs require a trusted proxy that replaces headers.

Reset emails link to the working web form at /reset-password#token=... . The fragment
is not sent in HTTP request URLs, so reset tokens stay out of URL access logs. Local outbox
messages are written to ignored .local/outbox under the API process working directory.
Additional contracts: [range reports](reporting.md) and
[trusted entitlements](entitlements.md). `GET /api/v1/reports/summary` returns all
report sections from one snapshot for the mobile Reports screen.
