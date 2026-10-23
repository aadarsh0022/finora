# Budget upgrades in development

Budgets remain exact monthly category limits. Rollover is now an explicit boolean,
default false. When enabled for a month, it adds the positive unused balance of the
immediately preceding category budget, including that budget's carried amount.
Missing months break the chain. Overspending never carries a negative balance.
Historical expense edits recalculate carry; no synthetic income is created.
Warnings and remaining amounts use the effective limit (base plus carry).

An independent overall monthly spending limit covers every ordinary expense,
including categories without budgets. It excludes transfers and debt principal.
It does not replace or sum category limits. The limit resets each month and its
warning threshold is 80%. GET `/budgets/total?month=YYYY-MM` returns plan/status;
POST sets a limit with a version on updates; DELETE requires month, version and
deletion confirmation. Limits are scoped to the authenticated user.

POST `/budgets/copy` copies source limits to another month atomically, skips
existing categories and archived categories, and never overwrites target settings.
The UI copies the previous month, with rollover disabled, after an explicit review.
The overall limit is copied only when the target month has none. Stable operation
keys make retries safe. Maximum 1200 category budgets and 1200 overall month limits.

Backups with rollover or overall limits use version 3, with older versions readable
using empty overall limits/default false rollover. Merge checks unique month keys,
currency and ownership. Account deletion includes overall limits. These backend
changes stay on the development branch and require the corresponding updated app.
