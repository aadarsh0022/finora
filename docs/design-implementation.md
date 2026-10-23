# Approved mobile design

The owner approved the five visual boards on 23 October 2026. Implement the light
neutral design with restrained green actions, red expenses, neutral expected money,
readable lists and explicit cash effects. Preserve the existing financial contracts,
session isolation, encrypted storage and idempotent outbox. No Play publication.

## Navigation and shared components

- Home, Activity, Plan and Insights are the four primary destinations. Profile
  opens Settings. Older budget/settings paths remain available for compatibility.
- Plan exposes budgets, goals, borrowed/lent money, expected receipts, recurring
  payments and weekly review. These no longer crowd Settings.
- Home prioritizes recorded balance, this month's income/spending, a conservative
  Money Ahead summary and three recent entries. Detailed periods live in Insights.
- Summary estimates use the same calculation as Money Ahead. Unknown amounts,
  undated commitments, stale dates, unreadable preferences or pending entries
  suppress the estimate. Expected income is excluded.
- Shared fields retain persistent labels and errors, show focus, and support
  password visibility. Concise choices use segments; long choices use stacked rows.
- Root screens expose Settings; focused forms keep one primary action. Native
  stack headers provide Back without repeating the page title.

## Follow-through

Apply the same form and review patterns to transactions, debts/receipts, accounts,
goals, budgets, recurring confirmations and weekly check-in. Keep destructive
management actions secondary. Sync messages must distinguish queued records from
posted totals and entries that require correction.

Verification and device observations will be recorded here as implementation
finishes. The mockups illustrate information hierarchy; live figures always come
from the authenticated API or the owner's encrypted local records.

## Forms and review flows

- Transactions retain the durable queue and exact DTOs. Optional details and
  destructive actions are disclosures, amounts use clear type colors, and invalid
  amount/account/category/date inputs show errors at the relevant field.
- Creating debts/expected receipts opens a review sheet before any write. Receiving
  or repaying money is also a two-step flow. The confirmation identifies account
  movement versus progress only; income and spending remain unchanged.
- Account creation/editing reviews opening balances before saving. The resulting
  balance preview uses integer arithmetic, including values beyond Number precision.
- Budget, goal and recurring forms use sheets with fixed primary actions. Goal
  contributions open only when requested. Existing confirmation/version guards
  remain intact.
- Weekly check-in displays one of four steps at a time. Reviewing changes local
  acknowledgements only; deferred entries remain unreviewed.

The first navigation slice passed `pnpm check` (128 core/API and 62 native tests)
and was visually checked on Pixel 8 Pro. Form workflow checks now cover the review
gates, overpayment prevention, preserved drafts and exact opening-balance previews.
