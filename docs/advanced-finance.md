# Budgets, savings goals and recurring transactions

These are authenticated backend features. Every mutation requires a UUID
`Idempotency-Key`; updates, deletion, pause/resume and occurrence confirmation also
require the last returned `version`. Deletion requires `confirmation: "DELETE"`.
Writes run in the existing per-user serialized MongoDB transaction. Public IDs never
grant access without a verified session belonging to the record owner.

## Monthly category budgets

- `GET /api/v1/budgets?month=YYYY-MM` returns budgets with actual category spending,
  remaining amount, over-budget state and configurable warning state. Without a
  month it uses the user's current local month. `GET /budgets/:id` also supports
  budgets outside the current month.
- `POST /budgets`, `PATCH /budgets/:id`, `DELETE /budgets/:id` manage a monthly
  limit. Inputs include `categoryId`, `month`, `amountMinor` and optional
  `warningThresholdBasisPoints` (1–10000, default 8000 = 80%). One budget per user,
  expense category and month is enforced with a unique database index.
- Only expense transactions count. Month membership uses the user's timezone,
  including transactions near UTC midnight. Income recorded as a refund does not
  reduce expense spending. Transfers do not count.
- `rollover` is explicitly `false`; unused or exceeded amounts never carry into
  another month. Enabling rollover is rejected. Limits and totals use integer
  strings and bigint arithmetic, including the warning comparison.
- Up to 1200 budget records per user. Existing archived category budgets still
  display actual spending; editing requires an active expense category.

## Savings goals

- `GET/POST /api/v1/goals`, `GET/PATCH/DELETE /goals/:id` manage named goals with
  `targetMinor` and optional local `targetDate`. Updates include `archived`.
- `POST /goals/:id/contributions` takes `amountMinor`, local `date` and the goal's
  `version`. Contributions must represent savings recorded today or earlier.
  The response returns the contribution and incremented `goalVersion`.
- `DELETE /goals/:id/contributions/:contributionId` takes the goal's `version`
  and deletion confirmation, and returns the incremented `goalVersion`.
- Progress is the exact sum of manual positive contributions. A contribution is
  a planning annotation: it never changes any account balance or creates a
  transaction. Savings above the target are allowed; remaining amount can be
  negative and `complete` becomes true. The detail response includes contributions.
- Archiving prevents new contributions; existing contributions can be corrected
  by removal. Deleting a goal atomically deletes its contributions. Neither
  operation affects account balances. Limits: 200 goals and 1000 contributions
  per goal, including archived goals.

## Recurring transactions

- `GET/POST /api/v1/recurring`, `GET/PATCH/DELETE /recurring/:id` manage income or
  expense rules. Transfers are not supported. Create specifies `name`, `type`,
  owned active `accountId` and matching `categoryId`, `startDate`, optional
  `endDate`, `frequency` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `amountMode`
  (`FIXED` or `VARIABLE`) and `postingPolicy: "CONFIRM_EACH"`. Fixed rules require
  `amountMinor`; variable rules omit it. Other posting policies are rejected.
- Rules capture the user's timezone at creation. Schedule, start/end dates and
  timezone are immutable; create another rule to change them. Monthly and yearly
  dates clamp from the original anchor, so January 31 yields February 28/29 and
  then March 31. Calendar arithmetic does not add fixed millisecond durations in
  local time, avoiding daylight-saving drift.
- `POST /recurring/:id/pause` or `/resume` takes `{ version }`. Pause suppresses
  generation. Resume includes dates missed during the pause. Already generated
  pending occurrences remain independently available for confirmation. Editing
  rule name, references, amount settings or paused state affects only future
  ungenerated occurrences; pending records retain their captured fields.
- `POST /recurring/generate` takes `{}` and materializes due dates through today
  in each rule's timezone. It creates at most 100 occurrences per request and
  returns `moreDue`; repeat with a fresh operation key until false. Generation
  advances each rule's cursor and version atomically, and a unique
  `(userId, ruleId, dueDate)` index prevents duplicate occurrences.
- `GET /recurring-occurrences?status=PENDING` (or `POSTED`, or no filter) returns
  the latest 100 records ordered by local due date and ID. This v1 list is bounded;
  a complete history is available in backups rather than a paginated occurrence UI.
- `POST /recurring-occurrences/:id/confirm` takes `version`, `amountMinor` and an
  ISO `date` timestamp. The timestamp must fall on the due date in the occurrence
  timezone. Fixed amounts must match exactly; variable amounts must be explicitly
  entered. Confirmation revalidates active owned accounts/categories and atomically
  creates one ledger transaction and marks the occurrence posted. Replaying the
  operation key returns the original result; racing distinct keys cannot double
  post. No scheduler or background process posts financial records automatically.
- Editing a linked transaction keeps the posted occurrence's amount/type/reference
  snapshot aligned; converting it to a transfer is rejected. Deleting the linked
  transaction returns its occurrence to pending, allowing explicit reconfirmation.
  Rules with posted history cannot be deleted (`RULE_HAS_HISTORY`); pause them.
  Deleting a rule without posted history removes its pending reminders atomically.
- Limits: 200 recurring rules and 10000 occurrences per user. Archive/pause does
  not bypass the limit. A new mobile reminder delivery service, autonomous scheduler
  and fixed auto-post mode remain outside this backend slice.

## Verification

`apps/api/tests/budgets.test.ts`, `goals.test.ts` and `recurring.test.ts` exercise
the real Route Handlers against a disposable MongoDB replica set: timezone month boundaries, integer precision,
budget thresholds/uniqueness, goal contribution idempotency and account independence,
archive/version rules, recurring month-end anchors, pause/resume, duplicate
generation, racing confirmation, variable amount confirmation and ownership.
Production Atlas access, delivery of mobile notifications and device interaction
remain separate release gates.
