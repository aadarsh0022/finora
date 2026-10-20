# Monthly budgets

GET/POST /api/v1/budgets; GET/PATCH/DELETE /budgets/:id. Authentication, UUID
Idempotency-Key and optimistic versions protect mutations. Delete requires DELETE
confirmation. Budgets are unique per expense category/month; rollover is disabled.
Actual expenses determine spending in the user's timezone; transfers and income do
not count. Configurable warningThresholdBasisPoints defaults to 8000 (80%).

Tests use disposable MongoDB to verify timezone month boundaries, exact large amounts,
warnings, duplicate prevention, updates and deletion. A connected mobile editor follows
in its own feature commit; this backend slice alone is not end-to-end delivery.
