# Next release — development and refinement

Requested 23 October 2026. Work stays on `codex/debt-and-offline-release`.
Do not publish to Play or activate billing. The owner subsequently clarified:
development only, with no release work. The earlier request specified no publication
before 30 October 2026; that date is an earliest review point, not authorization
for automatic publication. Keep the current test release usable.

## Scope and delivery order

1. Light-default visual foundation: neutral surfaces, restrained green accents,
   clear hierarchy, accessible actions and consistent forms. Preserve explicit
   appearance choices. Inspiration: Copilot's compact dashboard and transaction
   drill-down, Monzo's focused planning flows and Material accessibility patterns.
2. Debt tracker: borrowed/lent principal, optional account movements, partial
   repayments, history, corrections, due dates, archive, Home entry, search/filter,
   portable backup/restore and account deletion. No interest engine or real payments.
3. Encrypted local reads: user-isolated SQLite, SecureStore key, safe hydration,
   sign-out cleanup and last-updated visibility. Authentication stays authoritative.
4. Quick entry: transaction duplication, favourites and last-used active references.
5. Opt-in local reminders: expense entry, bills and budget warnings; private text.
6. Offline entry: durable outbox, stable idempotency keys, explicit pending/conflict
   state and reconciliation. No silent overwrite or duplicate posting.
7. Budgets: copy previous month, total monthly limit and explicit optional rollover.
8. Insights: comparable prior-period spending, daily averages and category changes.

## Debt accounting decision

Debt events are a separate principal journal. Optional account-linked events are
included in balances and account report changes, but excluded from earned income,
ordinary expenses and budgets. Existing debt creates no account movement. A new
borrowed principal adds cash; lending removes cash. Repayments reverse that direction.
Repayments cannot exceed outstanding principal. Corrections reverse the original
event instead of silently rewriting history. No contact permission or messages to
counterparties. Same base currency, server ownership, versions and idempotency apply.

## Completion gates

Each feature needs meaningful automated tests and device workflow checks. Run
`pnpm check` before commits; push coherent slices. Validate migrations, old backups,
multiple users, retries, sign-out, offline/reconnect and accessibility. Build the
signed candidate only after integration. Final Play submission remains withheld.

Reference pages consulted:

- https://help.copilot.money/en/articles/6045480-dashboard-tab-overview
- https://help.copilot.money/en/articles/9554412-transactions-tab-overview
- https://monzo.com/features/pots
- https://m3.material.io/foundations/
