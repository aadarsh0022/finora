# Mobile flow improvements

Requested 21 October 2026: keep the green identity, simplify Home, filters and forms.
Implementation is being handled by the primary agent without subagents.

- Keep the main task and current data visible. Move long option lists into searchable
  selectors and optional details behind an explicit control.
- Use calendar and month controls instead of requiring ISO date syntax.
- Show field-specific validation and preserve entered values after a failed save.
- Separate draft advanced filters from applied filters; support cancel, apply and
  reset, show what is active, and distinguish an empty account from no matches.
- Put primary form actions within easy reach and support pull-to-refresh.
- Give Home a clear balance, quick actions, compact summaries and recent activity.

Backend ownership, integer money, versions, idempotency and confirmation rules remain
the same. Native component tests verify selection, dismissal, date boundaries and
critical form/filter behavior. Emulator rendering and manual workflow checks remain
separate from mocked component coverage.

First delivered slice: Transactions now opens with filters closed, compact rows,
local-date groups, a searchable option sheet, explicit Apply/Cancel/Reset, removable
active filters and exact date/amount bounds. Home and individual form redesigns are
separate follow-up slices. The saved-form navigation guard now clears its enabled
state when releasing navigation, matching the Expo Router contract.
