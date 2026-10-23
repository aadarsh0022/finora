# Money coming back

Refunds, refundable deposits, reimbursements and personal money lent share the
tested principal/repayment journal. They are one record, visible through the debt
or receivable views, rather than duplicate claims. Existing debts default to
PERSONAL_LOAN; the kind is immutable after creation.

Refund/deposit/reimbursement creation requires direction LENT and prohibits an
initial account movement. The purchase or deposit belongs in the ordinary ledger
separately. Tracking the claim never records income or adds available cash.

Partial receipts use the existing idempotent, versioned repayment endpoint. A
receipt can add money to an owned active account, or track progress only if that
money was already recorded elsewhere. Over-receipts are rejected. Receipt account
movements are excluded from ordinary income/spending, so gross original expenses
remain unchanged; this feature does not calculate net refund-adjusted spending.
Corrections preserve history and reverse their original account effects.

The list supports type/search/status filters, partial, overdue, fully received and
archived items. Archiving changes visibility; it does not forgive an obligation or
erase money owed. Cancellation is for an incorrect entire record and reverses all
associated account effects; it is not a write-off of a valid remaining claim.

Money Ahead excludes receivables from its conservative scenario. Dated outstanding
amounts appear in the expected scenario only. Local due reminders and weekly review
include receivables without messaging the counterparty.

Backups containing debt/receivable records now export version 4, preserving kinds.
Versions 1–3 remain readable; old debt records default to personal loans. Typed
receivables cannot be imported under an older declared format version. Existing
account deletion removes the shared journal; no additional collection was added.
Old app versions cannot restore version 4 backups.
