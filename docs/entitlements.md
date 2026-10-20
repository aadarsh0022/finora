# Entitlement adapter boundary

Authenticated `GET /api/v1/entitlements` returns `tier` (`FREE` or `PREMIUM`),
`source`, nullable `expiresAt`, `billingAvailable: false` and
`manualTrackingAvailable: true`. The installed server adapter always returns free
access. There is no purchase flow, grant endpoint, client-side upgrade boolean,
provider SDK or payment collection. Finance features remain available without a
purchase. Entitlements are excluded from portable finance imports and backups.

`EntitlementProvider.verifiedGrant(userId)` is the trusted server adapter interface
for a later integration. It receives the verified session's identity; request data
cannot choose the provider or identity. Before any provider implementation is
installed, it must verify provider signatures, package/application, product, owner,
expiry, cancellation and revocation. Expired or invalid grants resolve to free.
The current endpoint does not read arbitrary MongoDB entitlement documents as
purchase proof. The adapter is not a working billing integration and does not
remove the merchant onboarding, provider verification or Play review release gates.

`apps/api/tests/entitlements.test.ts` verifies authenticated access against
disposable MongoDB, rejects client purchase claims, preserves free manual tracking
and tests expiry at the server adapter boundary. No live billing is activated.
