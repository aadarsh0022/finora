# API latency investigation, 24 October 2026

## Measurements

Three sequential unauthenticated health requests from the development workstation
returned HTTP 200 in 0.732s, 0.532s and 0.557s. TLS completed in 0.243s, 0.093s
and 0.117s respectively. These warm samples include database initialization/ping
but do not measure authenticated reports, login or a controlled cold start.
A response header was `X-Vercel-Id: bom1::iad1::...`, suggesting execution in iad1.
The owner confirmed that the production Atlas database is in Mumbai.
`apps/api/vercel.json` now selects `bom1` to colocate API execution with that database
on the next deployment. Production relocation is not verified by a GitHub push alone.

## Code findings and fix

- MongoClient and its connection/index promises are already shared per server
  instance. Connections are not deliberately opened and closed for every request.
- Each new instance previously performed sequential index commands across 19
  collections, followed by additional commands. This added many serialized network
  round trips to its first database-dependent response.
- Index definitions are now grouped into one createIndexes command per collection,
  with independent collections initialized concurrently through the existing bounded
  pool. All existing unique, partial and TTL definitions remain required; every
  request still awaits completion. No security checks or rate limits are removed.
- Overview reads the account, transaction and debt-event histories in a consistent
  snapshot; outlook independently reads six collections. These are deliberately
  sequential within their MongoDB transactions. Do not parallelize operations inside
  one MongoDB transaction. Cross-region latency compounds with each read.
- Home fetches overview and categories, then outlook and lower feature sections.
  Each endpoint repeats session/user lookup and its financial queries. This makes
  full-page readiness depend on several calls, even when each call is reasonable.
  The offline local ledger will reduce this UI dependency; it does not itself make
  the remote API faster.

## Remaining verification

Measure real authenticated endpoint p50/p95 and controlled first-instance timings
using sanitized server timings/hosting observability. Verify the deployed function region is `bom1`, matching the confirmed Atlas region. The code change is not a measured production speedup until deployed
and compared; the Mumbai deployment-region configuration is committed, while billing and Play are untouched.

[Vercel guidance on slow functions](https://vercel.com/docs/functions/debug-slow-functions)
and [function regions](https://vercel.com/docs/functions/configuring-functions/region).
