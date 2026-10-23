# Development progress — 23 October 2026

Development only. No Play upload, publication, billing activation or production API
deployment is part of this feature branch. The installed test release is unchanged.

## Implemented slices

- Debt principal journal, repayments, reversals/cancellation, ownership, backup,
  account-balance integration and mobile flows. Debt cash movements stay outside
  earned income, ordinary spending and category budgets.
- Light-default neutral theme; explicit saved appearance choices remain respected.
- SQLCipher-backed per-user device vault, saved reads, cached profile reopening,
  and an idempotent durable outbox for new transactions. Pending/conflicted entries
  remain separate from posted balances. Other financial writes require online access.
- Favourite drafts, duplication and last-used active references by transaction type.
- Optional private daily, due-date and budget reminders; no push token or emails.
- Overall monthly spending limits, safe previous-month copying and opt-in rollover.
- Spending insights comparing matched elapsed days, daily averages and category changes.
- Compact transaction form with account/category sheets, calendar, retained optional
  details and a persistent Save action. Saved Home/Activity reads show their timestamp.
  Debt navigation has a visible Back action; cancelled records are labelled correctly.

See debts.md, offline.md, quick-entry.md, reminders.md, budget-upgrades.md and
insights.md for accounting decisions and precise feature boundaries.

## Validation and preview

Latest full `pnpm check`: 116 Vitest tests and 51 native component tests passed,
including strict types, lint and formatting. Integration tests use disposable MongoDB.
The pending-record purge assertion checks the original durable storage map.

Pixel 8 Pro runs an isolated Expo development build (`app.finora.money.dev`) with
SQLCipher and local-notification native modules. Metro runs on 8081 and the local
development API on 3000 through adb reverse. A separate synthetic development
profile is signed in; its credentials stay in ignored local storage.

Device checks performed: light Home and compact transaction form rendered, native
vault opened, its database header was encrypted rather than a plaintext SQLite
header, cached Home survived a cold restart with API forwarding removed, and a
new offline transaction appeared separately as waiting for sync. The pending
entry survived another cold restart; reconnecting and tapping Sync twice left
exactly one server entry and the expected account balance. Android requested
notification permission only after an explicit save, scheduled both daily and
dated alarms, and removed those alarms when disabled. Signing out removed the
native vault database and returned to signup; the demo can sign in again.

## Still under refinement

- Longer offline/reconnect soak tests across device/OS conditions.
- Native reminder delivery while backgrounded, OS delays and session expiry.
- Longer accessibility, large-text and multiple-device workflow checks.
- Expo SDK 58 development navigation can emit an unhandled REMOVE_ROUTES warning
  when protected routes change. Automated auth/deep-link guards pass, but this
  developer warning needs investigation; it is not being hidden with LogBox filters.
- No interest/amortization engine, bank integration, remote push, background sync,
  offline debt editing or automatic recurring financial posting.

This is implementation progress, not a release-readiness declaration.
