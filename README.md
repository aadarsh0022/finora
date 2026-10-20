# Finora

Personal finance for Android, built as a pnpm workspace with a Next.js API,
MongoDB persistence, Expo mobile client and shared TypeScript contracts.

**Under active development. Not ready for public or closed-test release.**

Implemented APIs and connected mobile screens cover authentication, accounts,
transactions/transfers, categories, monthly budgets, range reports and charts,
savings contributions, confirmed recurring items, preferences, optional biometric
lock, CSV/report exports and previewed backup restore.

Run `pnpm install --frozen-lockfile`, then `pnpm dev:api` and `pnpm dev:mobile` in
separate terminals with the environment settings described below. This workstation
already has an ignored Atlas development configuration. No credentials are committed.

See [setup](docs/deployment.md), [API](docs/api.md), [security](docs/security.md),
[test results](docs/testing.md) and [remaining work](docs/known-limitations.md).
Android signing instructions are in [local release builds](docs/android-build.md);
review [dependency findings](docs/dependency-review.md) before distribution.

Start with [implementation plan](docs/implementation-plan.md) and
[product decisions](docs/product-decisions.md). Features are delivered in small,
verified commits. No banking, real-money transfers, billing or AI services.
