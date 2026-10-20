# Range reports

Authenticated `GET /api/v1/reports/summary` returns `period`, `cashflow`, `categories`,
`accounts` and `trends` from a single MongoDB snapshot. Individual endpoints
`/reports/cashflow`, `/reports/categories`, `/reports/accounts` and `/reports/trends`
return their corresponding section plus `period`. Existing `/reports/overview`
continues supporting its `month` query for the dashboard.

All five new endpoints accept the same strict query:

- `range=current-month` (default) or `previous-month`: the complete local calendar
  month. Transactions already recorded with future dates in that month count.
- `range=last-3-months` or `last-6-months`: the current complete calendar month and
  two or five preceding months, respectively.
- `range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`: inclusive local calendar dates,
  bounded to 120 distinct calendar months. Both dates are required. Presets reject
  custom date fields; unknown query parameters and invalid dates are rejected.

The user's IANA timezone determines day and month membership. Filtering compares
formatted local dates rather than adding 24-hour durations, including daylight
saving transitions. Trends include zero-valued months and respect partial custom
months rather than filling them with out-of-range transactions.

Money values remain exact integer strings. The savings rate is an exact truncated
integer string in basis points, or `null` when income is zero. Category shares are
bounded integer basis points computed separately against income or expense totals;
rounding down means shares may sum to slightly less than 10000.

Transfers never inflate income, expense, category totals or monthly cashflow. The
account breakdown separately includes incoming/outgoing transfers. Its opening
balance includes the account's original opening amount and transactions before
the range; closing balance includes transactions through the inclusive final day.
Account net movement includes transfers, and total account movement equals income
minus expenses. Archived accounts and categories remain visible for historical
accuracy. Income recorded as a refund remains income and does not reduce expense
totals. Reports contain no transaction notes or merchant strings.

Reports support the existing maximum of 200 accounts, 300 categories and 10000
transactions. Datasets beyond these bounds fail explicitly instead of silently
returning partial totals. `apps/api/tests/reports.test.ts` verifies real Route
Handlers against disposable MongoDB, including large integers, ownership,
transfers, calendar presets/leap years, UTC/local month edges, daylight saving,
zero months and edits/deletions.
