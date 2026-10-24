# Approved mobile design

The owner approved the five visual boards on 23 October 2026. Implement the light
neutral design with restrained green actions, red expenses, neutral expected money,
readable lists and explicit cash effects. Preserve the existing financial contracts,
session isolation, encrypted storage and idempotent outbox. No Play publication.

## Navigation and shared components

- Home, Activity, Ask Finora, Plan and Insights are the five primary destinations
  after the owner requested the assistant as the middle tab. Profile
  opens the single root Settings route. The old budget path remains compatible;
  the duplicate hidden Settings tab was removed to avoid ambiguous routing.
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

## Bug and flow review

- Confirmed Profile opens Settings on Pixel 8 Pro after removing the duplicate route.
- Successful weekly completion returns to Plan only after the encrypted save. A
  failed save stays open for retry; unreadable review history cannot be overwritten.
- Purchase previews show their result inside the active sheet. Changing the draft
  invalidates the result; newly pending entries hide estimates and disable calculation.
- Android keyboard avoidance includes the native header height. Verified a draft's
  Save action stays above the numeric keyboard on Pixel 8 Pro without posting it.
- Debt draft guards include dates and account handling, not only name/amount/note.
  Transaction type changes clear errors for fields that no longer apply.
- Open account, transaction, debt and goal editors retain their original versions
  across background refreshes. A concurrent edit produces a conflict rather than
  letting stale fields overwrite the newer record. Monthly-limit drafts also retain
  their starting version; successful goal contributions advance their own version.
- Posting sheets block dismissal and touch edits during saves. Transaction inputs
  and selectors are disabled while saving; submitted DTOs remain fixed.
- Sync distinguishes pending from attention states. Offline/reachability failures
  disable sync/retry, a read error cannot appear as an empty queue, and retry keeps
  the original operation ID and body. Discard remains explicitly local and warns
  that a timed-out save may already exist online.
- No API contracts, finance arithmetic, permissions, billing or Play artifacts changed.

Final repository checks: 128 core/API tests and 73 native tests passed, with strict
typechecking, lint and formatting. The Android JavaScript export succeeded. Native
QA covered profile navigation and the keyboard/footer layout on Pixel 8 Pro.
iOS keyboard behavior and
release-device background notifications still require separate device QA.

## Reference refresh, 24 October 2026

The 24 October references define an off-white background, white rounded groups,
muted captions, mint accents and an overlapping green Finora mark. Home uses a
green balance hero, separate income/spending metrics and a compact Money Ahead
panel. Activity groups compact merchant rows by date and keeps filters behind
an icon button. Insights combines the period summary, category chart, budgets,
upcoming payments and goals, with full calculation details still accessible.

Authentication uses email only. Settings retains grouped navigation and real
profile data. Planning pages share the same spacing and cards. Skeleton variants
follow the current dashboard, list, form and Insights structures. Chat answers
use text with expandable details and inline transaction clarification/confirmation.
Dark mode respects an explicit preference. Native visual acceptance and physical
phone keyboard/accessibility checks are separate from automated component tests.

Home now greets the profile first name and includes top spending, budget progress,
payments awaiting review, savings goals and weekly check-in below recent activity.
Amounts use exact existing records and follow the balance-hide preference. Empty
sections provide setup actions. Startup uses the new logo with a gentle animation
that stops on unmount and respects reduced motion. Expo Go's own initial loader
is outside this React startup screen; native splash changes require a new build.
