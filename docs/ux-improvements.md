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
active filters and exact date/amount bounds. Individual form redesigns remain
follow-up slices. The saved-form navigation guard now clears its enabled
state when releasing navigation, matching the Expo Router contract.

Transactions keeps search and Filters together at the top. A floating Add transaction
button sits above the bottom navigation, with extra scroll space so the final record
stays reachable. Income amounts use green, expenses red, and transfers neutral text.
The selected transaction type is shown only in its type button; it does not add a
duplicate chip or a Clear all action. Other applied filters retain removable chips.

Transaction cards use clearer title/amount alignment, tabular amount digits, quieter
account/category details, and crisp direction icons. Expense icons and amounts are
red, income green, transfers neutral. Type labels preserve meaning without relying
on color; long amounts can wrap instead of being truncated. The full card opens details.

Home now puts the privacy toggle inside the balance card and groups quick actions
in one row. A month picker applies directly, with income/expense tiles and a compact
net cash flow summary. Negative savings rates use plain language rather than a large
negative percentage. Category spending is sorted by exact minor units and shown as
up to five compact bars; Reports opens the full breakdown. Recent activity has a
View all link, and pull-to-refresh replaces the separate Refresh dashboard button.
This preserves the existing total-balance visibility setting and server queries.

Reports uses a compact period selector and calendar-based custom range sheet. Custom
dates are drafts until Apply; cancelling preserves the current report. CSV export is
at the top, and pull-to-refresh replaces a separate button. Net cash flow and paired
income/expense totals lead the page; definitions, timezone and the exact savings rate
remain available in About this report. Donut legends are compact and sorted by exact
amount, multi-month periods show monthly comparisons, and account details expand on
request. Native workflow tests cover custom-range cancellation/validation, account
detail access, and selected-period CSV export including temporary-file cleanup.

Settings groups compact navigation rows under Personalize, Your money, Data and
security, and Help and legal. Preferences opens an explicit editor with searchable
currency/date-format choices and a pinned Save/Cancel footer. Closing dirty edits
requires the existing discard confirmation. Versioned saves, profile refresh, legal
links, sign-out confirmation and local-only recovery retain their existing behavior.

Budget browsing and editing use the month/year picker instead of text input. Browsing
applies immediately; a new budget starts in that selected month. Expense categories
use the searchable selector. A native workflow verifies the selected year/month is
used in the validated exact-money creation request.

Planning uses the native back header once and omits its duplicate top safe-area inset.
Its compact tabs stay above the selected list. Goals open directly from progress
cards; detail screens keep Edit/Archive side by side, a clear progress bar, and a
calendar-based contribution form. Target dates also use the calendar. Recording a
contribution still tracks savings only, keeps version/idempotency protections, and
does not create ledger transactions; a native workflow verifies that request boundary.

Recurring puts Upcoming/Posted due items before schedules, groups creation and due
checks in one row, and moves detailed guidance into How recurring works. Schedules
show state, amount and compact Edit/Pause actions. Account/category/frequency use
selectors; start/end dates use calendars. Confirmation remains explicit. A native
workflow verifies generation only creates reminders and a separate review/confirm
action sends the exact amount and schedule-timezone date for posting.
