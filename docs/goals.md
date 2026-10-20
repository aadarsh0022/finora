# Savings goals

GET/POST /api/v1/goals; GET/PATCH/DELETE /goals/:id; POST /goals/:id/contributions;
DELETE /goals/:id/contributions/:contributionId. Mutations require UUID operation
keys and latest versions. Goal edits include archive/restore; contribution removal
and goal deletion require explicit DELETE confirmation.

Contributions are manual planning entries, never account debits or real transfers.
Exact progress sums positive contributions. Archived goals retain history and block
new contributions. Tests cover idempotency, versions, reversal and unchanged balances.
Limits: 200 goals, 1000 contributions per goal and 10,000 contributions per user.
