# Database

Atlas is configured locally in ignored apps/api/.env.local, DB finora_development.
The actual URI is never checked in. Before release, replace the initial Atlas
project-admin database credential with a user restricted to this application's DB.
Do not open the Atlas access list to 0.0.0.0/0 for convenience.

MongoClient uses maxPoolSize 10 and 5s selection/connect timeouts. Run:
`node --env-file=apps/api/.env.local --import tsx scripts/check-database.ts`.
It verifies ping and indexes without printing credentials.

- users: unique id/email, sparse unique resetHash; Argon2id hash, preferences,
  authVersion, UTC timestamps and optional reset expiry.
- sessions: unique userId/id, accessHash and refreshHash; usedRefreshHashes index;
  expiresAt TTL. Explicit expiry checks apply before TTL cleanup.
- rate_limits: unique HMAC-digested scope/address or email/bucket key; count and TTL.
- Reserved finance collections have unique userId/id indexes: accounts, categories,
  transactions, budgets, savings_goals, recurring_rules, recurring_occurrences,
  preferences, entitlements, audit_events, idempotency_records. Indexes alone do not
  constitute implemented financial services.

Deletion removes the user and every owned collection atomically, including sessions.
External backup retention still requires a release policy. Integration tests always
create a randomized disposable MongoDB replica set, independent of Atlas settings.
