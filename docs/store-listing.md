# Store listing draft

Draft only. Review copy against the final shipped build and device evidence before
submission. This document does not authorize publication.

## App name

Finora

Android package: `app.finora.money`. Release identifiers and public app branding
must not contain the owner's personal name. No earlier Play upload has registered
this application identity. A free draft was created on 21 October 2026; no binary
was uploaded or released. See release-status.md for the signed local artifacts.

## Short description

Track spending, plan budgets, and build savings with clear money records.

## Full description

Finora helps you keep a clear picture of your personal finances through manual
money tracking.

Organize cash, bank and wallet accounts. Record income and expenses, add your own
categories, and move money between accounts with linked transfers. See balances
and monthly spending summaries, and find transactions with filters and search.

Plan category budgets and follow your progress toward savings goals. Keep track
of recurring income and bills with due entries that require your confirmation
before creating a transaction. Export transactions to CSV or create a JSON backup
with a preview before restoring records.

Finora supports a single base currency per account profile. It does not connect
to your bank or move money. Financial records are entered by you, and the app's
summaries are based on those records.

## Prepared local artwork

- [Launcher/store icon](../apps/mobile/assets/brand/store-icon.png), 512 × 512 PNG.
- [Play feature graphic](../apps/mobile/assets/brand/feature-graphic.png), 1024 × 500
  opaque PNG, using the original Finora mark and “Your money, clearly.” tagline.
  Source artwork is SVG path geometry, with no screenshots or rating claims.
- [Asset sources and regeneration instructions](../apps/mobile/assets/brand/README.md).
  Run `node scripts/generate-brand.mjs --check` to verify the checked-in assets.

These assets are local drafts for review; no store upload has been performed.

## Materials still required

- Resolve developer-profile identity disclosure and establish support monitoring.
  The branded contact is support@finora.aadarshx.in.
- Review the published privacy, terms, support and account-deletion pages at
  https://finora-api-olive.vercel.app against final operations and provider retention.
- Review and approval of the prepared icon and feature graphic against the release.
- Screenshots from the actual released Android build, with synthetic financial
  data and no real account information.
- Current Play Console category, content rating and data-safety declarations
  reflecting the production hosting, email service and any added SDKs.
- Closed-test evidence and final native accessibility/device verification.

Avoid claims about bank-grade security, offline completeness, automatic bank
sync, bill payment, investments, guaranteed savings or automatic recurring
posting. The present application does not establish those capabilities.
