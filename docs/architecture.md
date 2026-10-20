# Architecture

One Next.js modular monolith and one Expo Android-first client. Shared Zod contracts
validate boundaries. Framework-free finance-core uses bigint with integer strings
at storage and JSON boundaries. No client database credentials or banking integrations.

Route Handlers call a central router and reusable services. MongoClient and index
initialization are reused across requests and reloads. Failed initialization retries.
Identity always comes from verified bearer sessions, never request ownership fields.

Device sessions use opaque random tokens (only SHA-256 hashes stored), 15-minute
access and 30-day refresh families. Atomic rotation detects old-token replay and
revokes the family. User authVersion prevents password-change/login races.
Registration, password reset/change and deletion require MongoDB replica-set
transactions. Atlas free clusters support replica sets; standalone MongoDB is unsupported.

Structured logs allow only request ID, level and safe code. Responses are no-store.
Authentication throttling persists in MongoDB across server instances.
