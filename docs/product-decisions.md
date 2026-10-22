# Product and implementation decisions

- Modular monolith; REST /api/v1, shared Zod contracts, framework-free finance-core.
- Financial data belongs to a verified session's userId. Public entity IDs are UUIDs.
- Money is a canonical base-10 integer string on JSON/storage boundaries; arithmetic
  uses bigint, avoiding MongoDB double precision and JSON bigint serialization issues.
- Accounts share one base currency in the MVP. Currency changes are prohibited once
  financial records exist. No FX conversion, banking integrations or LLM calls.
- Transfers are one transaction document containing both account references.
- Authentication uses random opaque access and refresh tokens, only SHA-256 token
  digests persist. This permits immediate logout/password-change revocation without
  trusting client token claims. Access expires after 15 minutes; families after 30 days.
- Refresh tokens rotate with a conditional update. Previously used token digests
  identify replay and revoke that entire device family. Concurrent mobile refresh is
  single-flight; replay is deliberately fail-closed, including concurrent replay.
- Password reset uses Resend HTTPS API in production, restricted local disk outbox
  only outside production. On 21 October 2026 the user deferred email setup: an
  explicit EMAIL_TRANSPORT=disabled permits hosted testing while recovery returns
  the same unavailable response for every email, before issuing a reset token.
  Production Resend still requires its credentials. Verified email remains a public
  release-readiness gate; no emails are sent in disabled mode.
- Later on 21 October 2026 the user authorized the Finora sending subdomain and
  production release preparation. Resend verified finora.aadarshx.in after the
  scoped Hostinger DNS additions. A signed build, honest Play declarations,
  device QA and delivery checks remain separate release gates. Billing remains
  disabled. Store agreements and account-owner declarations require owner review.
- Free manual tracking remains available; no billing UI until backend verification
  and merchant onboarding are complete. No advertising or analytics SDKs initially.
- No deployment, Play publication or live billing is authorized by repository pushes.
- Public help pages use Finora branding and the hosted Vercel origin, including
  during local API development. At the user's request, the first release package
  uses `app.finora.money` instead of a personal-name development identifier. Google
  developer-profile disclosure rules are separate from app branding; do not submit
  publicly while the user's identity-privacy requirement remains unresolved.

## Verified official sources

Consulted 20 October 2026; exact installed versions are recorded in the lockfile.

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Expo SDK 58 release](https://expo.dev/changelog/sdk-58)
- [Expo Router installation](https://docs.expo.dev/router/installation/)
- [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)
- [Argon2 Node bindings](https://github.com/ranisalt/node-argon2)
- [Resend email API](https://resend.com/docs/api-reference/emails/send-email)

- Update, 22 October 2026: production Resend delivery and branded support receiving
  are verified. Recovery to an existing development-only profile initially sent
  nothing by design; the approved exact profile/records copy into production fixed
  that case, and the resulting email showed Delivered. Password-reset completion
  and ongoing support monitoring remain separate checks.
- The owner subsequently expressly authorized a testing release. Play's closed
  testing version 2 (0.1.1) is in review. Public production publication remains
  blocked by Google's testing criteria and the unresolved identity-privacy request.
