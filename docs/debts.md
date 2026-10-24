# Debt tracker

The next-release branch supports manual borrowed and lent principal in the user's
single base currency. Creating an existing debt does not change accounts. Choosing
an active owned account records the principal movement atomically with the debt.
Repayments may similarly affect an account or only track an already recorded payment.
Finora never moves money. Principal movements do not count as earned income,
ordinary expenses, category spending, savings rate or budget usage.

`debts` owns immutable direction, principal and start date plus editable name, note,
optional due date and archive state. `debt_events` is the principal/repayment journal.
Account balances and dated report opening/closing balances incorporate active
account-linked events. Reports show separate debt-in/debt-out values; the ordinary
transaction list and its CSV contain ordinary transactions only. Debt history is
available through the debt screen and lossless JSON backup.

Repayments must be positive, no earlier than the debt, no later than today and no
larger than remaining principal. Due dates use the user's calendar timezone.
Zero remaining is settled; positive remaining after the due date is overdue.
Archived outstanding debts remain included in summary totals. Archiving retains
all account effects. Reversing a repayment preserves it with `reversedAt`, removes
its account effect and reopens that portion of principal. Cancelling an incorrectly
recorded debt reverses every remaining event and archives it with `cancelledAt`.
Corrections restate historical balances; they are not new cash transfers today.
No interest, EMI calculation, automatic payments or counterparty messaging exists.

Endpoints: GET/POST `/api/v1/debts`, GET/PATCH `/debts/:id`, POST
`/debts/:id/repayments`, DELETE `/debts/:id/repayments/:eventId` (reversal), POST
`/debts/:id/cancel` with `confirmation: "CANCEL"`. All writes require stable
Idempotency-Key; modifications require the last debt version. Reversal requires
`confirmation: "DELETE"` for consistency with existing mutation contracts, but
preserves history. Principal correction uses cancellation and a new debt.

Limits: 200 debts, 1000 repayments/corrections per debt, 10000 total journal events.
Authentication, ownership, same-currency references, serialized transactions and
integer money apply. Debt names/notes are not logged. Account deletion removes
both collections. The currency lock includes debts even without a cash account.

Backups with debts use format version 2; version 1 remains readable with empty debt
collections. Old app versions cannot restore version 2. The whole backup validates
one principal per debt, references, direction/currency, cancellation state and
overpayment. Merge validation also checks the combined histories before commit.
Existing records are never overwritten. Final device/offline QA remains separate.
