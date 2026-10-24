# Offline-first Finora plan

Planning only, 24 October 2026. No implementation or release is authorized by this
document alone. The owner wants immediate local use and invisible background
synchronization, without a user-facing queue, pending badges or routine sync notices.

## Existing foundation and gaps

- SQLCipher-encrypted Expo SQLite databases and SecureStore keys already exist,
  isolated by API origin and user. Preserve encryption and isolation.
- Reads persist bounded API snapshots rather than a complete queryable ledger.
  Cache hydration races an API read; snapshots expire after 30 days.
- New transaction saves attempt the API first, queuing only after an offline
  signal, network failure or timeout. Edits and other entities require connectivity.
- Pending entries are separate from posted balances and reports. They cannot
  deliver immediate, consistent local totals across the app.
- Session restoration can expose a cached profile, but its seven-day limit,
  foreground restoration and network error handling can still interrupt access.

## Product behavior

1. After initial online sign-in and setup, open the encrypted database and render
   local content without waiting for auth refresh, API reads or cloud availability.
2. Save a transaction locally before reporting success, whether connected or not.
   Update Activity, account balances, budgets, reports and Home from the same data.
3. Add offline edits and deletion, followed by accounts, categories, budgets, goals,
   debt/receivable records and their associated money movements.
4. Refresh and upload quietly on launch, foreground, reconnection and after saves.
   Do not promise background execution after the OS closes the app.
5. No Sync tab, queue terminology, queued counts, pending transaction cards or
   background loading overlays. A completed local save can simply say Saved.
6. Skeletons are for the first download or genuinely unavailable local data.
   Existing data stays visible during all routine network activity.
7. Show an interruption only when action is necessary. Examples: device storage
   cannot save, sign-in is required, or conflicting edits need a choice. Never
   claim a save succeeded before its local database transaction commits.
8. First sign-in, password recovery, account deletion, bank/provider operations if
   added later, and AI provider requests remain online. For AI financial answers,
   reconcile the device's latest changes first or decline to give an apparently
   current answer from older server records. No internal queue UI is needed.

## Local data architecture

- Migrate the existing vault safely to versioned, indexed entity tables, keeping
  current profiles, snapshots and unsent entries intact until migration commits.
- Use stable entity UUIDs, integer minor-unit strings and shared DTO validation.
  Keep local revisions, last acknowledged server versions and deletion tombstones.
- In one SQLite transaction, write the entity change and its durable operation
  record. A crash must leave both committed or neither committed.
- Use local repositories and reactive queries for screens. React Query can still
  coordinate remote work, but network responses must not be the screen data source.
- Calculate exact local balances and summaries using framework-independent finance
  rules. Transfers and debt repayments must update their related records atomically
  and contribute to the ledger exactly once.
- Download existing history in resumable pages, with explicit completeness markers.
  Never present an incomplete import as a complete historical report. Replace
  expiring query snapshots with durable entities and a deliberate storage policy.

## Feature coverage

| Feature                            | Offline behavior                                                                                                                               | Consistency requirements                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts                           | Create, edit, archive and view accounts and balances locally.                                                                                  | Stable IDs let a new transaction reference an account created offline. Preserve existing rules for opening balances, currency and archiving. Archive must not erase history.           |
| Categories                         | Create, rename and archive categories; use new categories immediately.                                                                         | Upload parent records before dependent records. Preserve references in historical transactions and resolve naming conflicts without losing transactions.                               |
| Transactions and transfers         | Create, edit, delete, search and filter from the local ledger.                                                                                 | Exact minor units; one atomic transfer; no double counting on acknowledgement or retry.                                                                                                |
| Budgets                            | Create and edit category budgets and monthly limits, copy months and calculate progress locally.                                               | Use the local ledger for actual spending. Preserve rollover and one-budget-per-scope rules; conflicting definitions need resolution.                                                   |
| Savings goals                      | Create, edit and archive goals; record, edit and remove contributions locally.                                                                 | Contributions track earmarked savings and must not silently create transfers or change account balances. Preserve the current goal semantics.                                          |
| Debts                              | Create and edit debts, record lending/borrowing, repayments and reversals, and view remaining principal locally.                               | Apply each debt event and its associated account transaction as one logical operation. Reconcile both together and conserve exact principal and cash effects.                          |
| Refunds and reimbursements         | Track expected receipts, edits, cancellations and actual receipts locally.                                                                     | Expectations never increase recorded balances. Confirming a receipt creates its actual ledger effect exactly once.                                                                     |
| Recurring transactions             | Create, edit, pause and archive rules; show due items and explicitly confirm them locally.                                                     | Each occurrence needs a stable identity and uniqueness rule shared by devices and server generation. Never auto-post a financial transaction merely because a device reconnects.       |
| Money Ahead and purchase scenarios | Calculate plans, commitments and scenarios from local records.                                                                                 | Keep projected income separate from recorded cash; never add expected receipts to available recorded balances.                                                                         |
| Weekly check-in                    | Complete steps and record completion locally.                                                                                                  | Completion does not implicitly confirm bills, settle debts or create payments. Handle repeated completion without duplicating side effects.                                            |
| Dashboard and reports              | Render totals, trends and category breakdowns immediately from local records.                                                                  | Reuse exact finance rules across server and device; respect timezone, date range, transfer exclusions and dataset completeness.                                                        |
| Preferences and reminders          | Save supported preferences and schedule notifications locally.                                                                                 | Theme and notification permission remain device-specific; synchronize only account-level preferences. Currency changes must satisfy existing financial-data restrictions.              |
| Export and restore                 | Export locally available data; preview and validate restore contents offline.                                                                  | Label incomplete exports honestly. Restore needs an explicit conflict/dependency strategy and idempotent operations; preserve the current safe restore flow until this is implemented. |
| Finora AI                          | Keep the chat screen usable, but require connectivity for model responses. Save reviewed transaction drafts through the same local-first form. | Do not claim old server data is the device's current balance. Reconcile first or clearly decline a current financial answer until that is possible.                                    |

Online-only account operations remain first sign-in/registration, password changes,
recovery, session management and account deletion. Network-only operations must
have clear boundaries without blocking access to ordinary local finance screens.

Destructive actions keep the existing confirmation and validation requirements.
Local-first behavior does not allow account deletion, financial reversals or data
restore to bypass review. Every feature includes a policy for concurrent edits,
deletion, dependency failure and recovery before it is considered offline-ready.

## Background synchronization protocol

- Add authenticated, validated bootstrap, incremental-pull and operation-push APIs
  to the existing Next.js/MongoDB application. Derive ownership from the session.
- Return a durable per-user change cursor covering updates and deletions. Avoid
  relying solely on client timestamps. Preserve tombstones long enough to handle
  returning devices, or require a safe rebootstrap when a cursor expires.
- Every operation has a stable operation UUID, entity UUID, base server version,
  local revision and validated payload. Support client-generated entity IDs only
  through an explicitly validated, user-scoped contract.
- Atomically deduplicate and apply operations with their change-log entries on the
  server. Retry receipts must remain reliable across the supported offline period;
  do not let an expired idempotency record create duplicate financial entries.
- Use one sync coordinator per user session, bounded batches, retry backoff and
  parent-before-child dependencies. Authentication failure pauses network work.
- Apply pull pages and cursor updates atomically in SQLite. Advance a cursor only
  after its changes persist. Resume cleanly after process death.
- Reconcile acknowledgements by operation and revision. An acknowledgement for an
  older local edit must not overwrite a newer edit made while the request ran.
- Automatically merge only independent, safe changes. For conflicting financial
  edits or edit-versus-delete, retain both versions and ask which change to keep.
  Do not silently resolve amounts or accounts using last-write-wins.

## Privacy and recovery

- Keep device encryption, per-user keys, account separation and local lock behavior.
  Cached local access is not proof of current server authorization. Define and test
  a deliberate offline-unlock policy separately from refresh-token validity.
- Auth refresh must not clear locally committed, unacknowledged work. A confirmed
  revocation locks access and stops synchronization; preserve recoverable records
  under the same owner's key pending an appropriate sign-in/recovery decision.
- Do not silently delete unsent work on sign-out. If it cannot be backed up,
  provide a plain-language protection/recovery choice before removing local data.
- Treat disk-full, key loss, failed migration and corruption as explicit recovery
  conditions. Do not fall back to plaintext or report an unsuccessful write as Saved.
- Keep credentials, notes, merchants and financial payloads out of logs. Do not send
  financial records to the model to solve synchronization or conflict problems.

## Delivery sequence

1. **Fast reopening:** separate local unlock/hydration from network validation;
   render cached content immediately and preserve it during refresh. This is an
   interim improvement, not a claim that the full local ledger is complete.
2. **Local ledger:** migrate storage, bootstrap history, add local repositories,
   and save new transactions atomically before any network attempt. Verify local
   balances, reports and budget impact before changing all screen reads.
3. **Reliable reconciliation:** implement cursors, acknowledgements, deduplication,
   tombstones, edits/deletes, crash recovery and multi-device conflict handling.
4. **Complete feature coverage:** migrate planning, debts, receivables, preferences
   and reminders while preserving their financial relationships and dependencies.
5. **Refinement:** remove routine synchronization UI, validate offline security and
   backup/recovery flows, then do real-device and signed-build acceptance testing.

## Acceptance criteria

- After initial setup, cold-start in airplane mode displays saved content without
  waiting for a network timeout or showing a blocking network loader.
- Save, edit and delete while offline; every affected screen immediately agrees
  with the local ledger, including exact transfer conservation and debt balances.
- Force-stop immediately after a save and reopen. Records and operation metadata
  remain intact. Repeated reconnects never duplicate a financial effect.
- Simulate an acknowledged server commit with a lost response, expired sessions,
  slow connections, server errors and a crash during migration or page import.
- Make conflicting changes on two devices. Neither accepted local work nor a newer
  edit is silently lost. Deletions do not resurrect after a later reconnect.
- Switching users never exposes another user's data. Sign-out and auth-revocation
  behavior preserve the documented recovery boundary.
- Exercise financial invariants and authorization against disposable MongoDB, then
  complete native persistence, airplane-mode, storage-failure and recovery tests.
- Run pnpm check, API build and signed Android verification before release. Passing
  mocks or a JavaScript export alone does not establish native offline correctness.

## Implemented first slice, 24 October 2026

Saved reads hydrate before network requests begin. An open local vault and its
saved profile no longer wait for a full network restore to render. Cached records
remain visible through transient server failures; successful writes invalidate
reads without waiting for every refresh to finish. User isolation and the existing
cache age limits remain in place. Dedicated saved-read tests cover slow-server
hydration and failures. These improvements do not establish full offline-first
correctness: local ledger repositories, reconciliation and all-feature offline
writes in phases 2 through 5 above remain outstanding.

## Setup slice implemented, 24 October 2026

- Onboarding reads only the encrypted device vault and saves preferences, optional
  first account and completion as one durable operation. It does not await HTTP.
  Missing account snapshots are treated as unknown, never as an empty account list.
  Registration seeds the known empty account baseline; existing profiles with an
  unknown baseline can finish and manage accounts later.
- The authenticated `POST /api/v1/onboarding/sync` validates the shared DTO, derives
  ownership from the session and atomically applies settings/account/completion.
  Client-generated account IDs survive retries. Durable idempotency receipts prevent
  duplicate starting balances following a lost response. Currency and concurrent
  preference conflicts are rejected without partially applying setup.
- Sync runs after setup navigation, on session restore, foreground and reconnect.
  Network/timeouts, HTTP 429 and server errors retry while the app is active using
  2s exponential backoff capped at five minutes. Closing the app pauses execution;
  reopening resumes it. Conflicts/authentication errors are not blindly retried.
  Setup drains before queued transactions. Sign-out closes the vault without deleting
  unsent device records; authentication still gates reopening the owner-scoped vault.
  Explicit account deletion still purges the local vault.
- This is a bounded onboarding slice, not completion of the all-feature local ledger.
  Most feature mutations remain server-first; read snapshots still have expiry and
  full local financial projections/entity synchronization remain planned below.
  SQLCipher requires a compatible native build; Expo Go cannot provide this vault.
  The new API endpoint must be deployed before new clients can synchronize setup.
- This session is GitHub fixes only. No Play upload, submission or version bump.
