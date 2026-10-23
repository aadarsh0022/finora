# Money Ahead and weekly review

Authorized development scope, 23 October 2026: an explainable money forecast,
purchase previews, irregular-income scenarios, a money-coming-back flow and a
guided weekly review. Development only; no deployment, publication or billing.

Money Ahead uses recorded balances as of today, selected active accounts, dated
commitments and one explicit reserve. The reserve includes any cash earmarked for
goals/emergencies; goal contributions are not also deducted automatically. Debt
repayments due use remaining principal, explicitly assuming payment by the due date.
Future income/receivables stay out of the conservative scenario. A separately
labelled expected scenario includes estimates without recording any transactions.
Purchase previews are temporary and never modify the ledger.

Account selection, reserves, expected payments, balance-check confirmations and
review acknowledgements are encrypted device preferences, isolated by user/origin.
They are removed on sign-out and are not server-backup data. Forecast calculations
work with cached snapshots; their saved timestamp remains visible. Pending sync
blocks the headline estimate to avoid double counting a save whose response was lost.
An existing purchase preview is paused as well when pending entries appear. A cached
snapshot from a prior calendar day cannot provide today's headline estimate.

Unknown bill amounts and undated outstanding debts are disclosed; an incomplete
forecast has no spendable-money headline. No confidence percentage, bank-balance
verification, guaranteed affordability, interest calculation or automated posting.
The horizon is at most 90 days; dates follow the user's/item's timezone. Recurring
items are deduplicated against generated/posted occurrences. Overdue pending bills
are treated as due today. Already recorded future entries are planned once.

The weekly review covers sync, the latest 50 entries from the last seven calendar
days, pending recurring confirmations, overdue debts/receivables and upcoming items.
Acknowledging a review only changes device preferences; it does not post, alter or
delete financial records. Additional entries are clearly disclosed and accessible
through transaction history.
