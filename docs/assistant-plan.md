# Finora AI Money Manager assistant

Scope approved on 23 October 2026. Existing mobile work was pushed first as
`8b55c0b`. The owner then requested local AI chat and tool implementation with no
push or Play release. The owner subsequently authorized a Git push and requested
closed-test preparation. Publication remains a separate external release gate.

## Transaction drafts and onboarding

The assistant can select `prepare_transaction` as well as the five read tools.
It prepares an expense, income or transfer without writing financial records.
Exact amounts are parsed into integer minor units. Account and category names
resolve only to unambiguous, active records owned by the signed-in user. Missing
or ambiguous selections stay blank. The user must open Review transaction, edit
the existing transaction form and explicitly save through its authenticated,
idempotent ledger flow. Draft contents stay in memory; navigation contains only
an answer identifier. Submitted drafts cannot be reviewed again in that session.

New users without accounts receive optional onboarding for preferences and an
explicitly reviewed first account. Skipping records completion without creating
financial data. Completion is user-scoped and idempotent; retrying after creating
an account does not create another. Existing users can reopen Getting started in
Settings. The visible app name is Finora AI Money Manager, with Finora AI used
for compact navigation and chat labels.

## User flow

Middle Ask Finora tab → availability check → explicit per-chat disclosure/agreement →
question → one read tool or transaction draft → exact result or review card. Users can ask follow-ups, clear
the chat, open the source feature or report an answer inside the app. Offline and
disabled states are explicit. Failed requests preserve the draft for manual retry.
Chat is not added to the offline outbox.

The screen retains at most ten turns in memory, isolated by signed-in user. Clear
chat cancels the current request, removes visible history and resets consent. A
late cancelled answer cannot restore that history. No conversation is persisted
in SQLite, MongoDB or application logs. There is no durable cross-device history.

## Architecture

The existing Next.js Route Handler dispatches authenticated assistant endpoints.
OpenAI's Responses API with `gpt-6-luna` interprets the question and selects one
strict function. The server validates its arguments again, derives ownership from
the current session and invokes an existing financial read service. It rechecks
the session after the model request. Finora templates the prose and renders exact
integer amounts; model-authored financial claims are never displayed.

Only the question, up to three earlier questions, currency, timezone, current day
and tool definitions go to OpenAI. No database results, account directory, email,
user ID, notes, merchants or authentication tokens are supplied as context. A
question can itself contain personal information, which the disclosure explains.
There is no second model request containing function results. This initial version
handles one question/tool per turn. Named-account questions point to Accounts;
compound requests and ambiguous dates ask for clarification. Automatic financial
mutations, forecasts, currency conversion and financial advice are unsupported.

| Tool                    | Data and semantics                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_balance`           | Recorded balances including archived accounts, matching the dashboard; optional owned account ID. No live bank balance or spendable forecast.      |
| `get_cashflow`          | Inclusive calendar dates in the account timezone, maximum 366 days. Transfers and debt principal movements excluded.                               |
| `get_category_spending` | Recorded expense categories and exact totals over the same bounded period.                                                                         |
| `get_budget_status`     | Monthly overall and category limits, rollover, spent and remaining amounts. A missing limit is null; independent limits are never added.           |
| `get_debt_summary`      | Separate borrowing, personal lending and expected receipts, with overdue totals. Archived/cancelled/settled records excluded; names/notes omitted. |

Each result identifies currency, timezone, retrieval time, recorded-server source
and exclusion of local unsynced entries. Expected receipts are not cash. All
arithmetic uses existing services and integer minor units; tool execution does
not import mutation services or accept arbitrary database queries.

## API and limits

- `GET /api/v1/assistant/capabilities`: availability, provider/model and policy version.
- `GET /api/v1/assistant/tools`: allowlisted strict function definitions.
- `POST /api/v1/assistant/tools/run`: validated `{name, arguments}` invocation.
- `POST /api/v1/assistant/chat`: question, up to three previous questions and explicit
  `acceptedPolicyVersion: "2026-10-23-v1"`.
- `POST /api/v1/assistant/feedback`: answer UUID and one enum reason only.

Every endpoint authenticates. Tool access is limited per user to 30 requests per
ten minutes; chat and feedback each to ten. Input bodies use the existing 16 KiB
limit. Each question is limited to 1,000 characters. One provider request has a
12-second deadline, 512 output-token cap and 64 KiB response limit. There is no
automatic provider retry, unbounded tool loop, arbitrary URL or model-controlled
identity. Invalid, incomplete, multi-call or free-text outputs fail closed.
Upstream errors are not logged or returned. API responses use `no-store`.

Feedback stores only user ID, random answer reference, reason and timestamps. A
unique owned-answer index deduplicates reports. A TTL expires them after 30 days;
MongoDB TTL cleanup is asynchronous. Account deletion removes the owner's feedback.
Reports cannot reconstruct an answer because the conversation is not retained.

## Configuration and release gates

Server-only `.env.example` documents `ASSISTANT_ENABLED=false`, `OPENAI_API_KEY`
and `OPENAI_MODEL=gpt-6-luna`. No mobile/public API key exists. Chat remains
disabled unless the flag and a nonempty key are both present. The default remains
off; regular app features continue to work. After initial implementation, the owner
configured the local key and enabled the feature. A synthetic balance question
selected `get_balance` through the live provider in about six seconds; Pixel 8 Pro
then completed the same read-only chat flow and showed the recorded result. No
billing configuration was changed.

Requests set `store: false`. This does not mean zero provider retention. OpenAI
documents abuse-monitoring retention up to 30 days and separate caching/security
exceptions. No training opt-in or Zero Data Retention eligibility is assumed.

Before enabling for real users: configure a restricted project key and provider
spend controls, run live routing evals on synthetic questions, inspect actual
provider retention/training configuration, deploy the updated hosted privacy page,
and revise Play Data safety/provider disclosures for optional chat prompts and
reports. Review applicable AI-content requirements. Device QA, Play review and
publication remain separate gates. No production/billing/Play changes are made by
this implementation.

## Verification

Disposable-MongoDB tool tests cover exact large amounts, ownership, revoked
sessions, strict arguments, timezone boundaries, transfer exclusions, independent
budgets, debt semantics, rate limits and unchanged financial collections.
Mock-provider integration tests cover disabled/consent states, request privacy,
single-call routing, invalid outputs, deadlines, size limits and sign-out during
a question. Native tests cover consent, exact results, manual retry, cancellation,
in-app reporting, offline state and user isolation. Live-provider and physical
device results must be recorded separately; mock results do not establish those.

Verification completed on 23 October: `pnpm check` passed 141 core/API tests and
80 native tests, plus strict typechecking, lint and formatting. The Next.js
production build and Android JavaScript export succeeded. Pixel 8 Pro displayed
the disabled assistant screen correctly. No live provider request, enabled-chat
device certification, signed release build, deployment or Play submission was
performed during that initial verification.

Official OpenAI documentation consulted:

- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Data controls](https://developers.openai.com/api/docs/guides/your-data)

## Chat layout follow-up

At the owner's request Ask Finora is now the middle of five tabs: Home, Activity,
Ask Finora, Plan and Insights. The old `/assistant` link redirects to that same tab,
with no duplicate chat instance. The redundant Home entry was removed.

The chat has a compact header, neutral message bubbles, short suggestion chips and
a rounded composer with an accessible send/stop button. Questions appear as soon
as they are submitted. A compact pulsing-dot indicator replaces transaction-list
skeletons; reduced-motion preferences disable the animation. Stopping restores the
draft and ignores late results. Scroll follows new messages when already near the
bottom, without pulling a reader away from earlier content. The composer stays
above the keyboard and the tab bar hides while typing.

Follow-up verification: `pnpm check` passed 141 core/API and 83 native tests,
including actual tab order, legacy-link routing, immediate question visibility and
stop/cancel behavior. The Android export passed. Pixel 8 Pro showed the compact
pending state, the middle tab and a completed live balance answer. The emulator's
hardware-keyboard mode hid the tab bar on input focus; full software-keyboard and
physical-device QA remain separate checks. Assistant changes are still unpushed.
