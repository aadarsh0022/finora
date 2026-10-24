# Play declarations — 22 October 2026

Saved to the Finora draft; this records the implemented behavior, not a security
certification or legal opinion. Public policy: https://finora-api-olive.vercel.app/privacy.

- Adult target audience (18+); no ads, government or health features.
- Finance category; financial features Other, described as manual finance tracking.
  No bank connection, payment, loan, investment or insurance service is claimed.
- IARC All Other App Types questionnaire completed with the owner's accepted terms.
- Account login is username/email and password. Dedicated non-admin demo credentials
  were shared privately with reviewers with explicit approval. No real user data.
- Collected personal types: name, email, user IDs and other info (authentication and
  preferences); required for account management/functionality/security as applicable.
- Financial types: purchase history and other financial info; used for the core
  tracking functionality. Payment credentials and credit scores are not collected.
- Optional types: user-selected restore files, search queries and user-generated
  content; app functionality. Technical diagnostics are declared for functionality,
  service-health analysis and security; network identifiers for functionality/security.
- These types are conservatively marked non-ephemeral. No unverified provider log
  retention exemption is claimed. No location, contacts, biometric templates,
  photos/audio or installed-app collection is declared.
- HTTPS transport encryption; account deletion URL /delete-account and record-only
  deletion help /support#delete-records on the hosted origin.
- Vercel, Atlas and Resend act as service processors, covered by Google's service
  provider sharing exemption. User-directed export sharing is user initiated.
  No advertising/data-sale sharing is implemented. Providers are disclosed in policy.
- No independent security-review, UPI or other certification badge is claimed.
- English (United States) listing, worldwide closed-test targeting (178 regions).
- Icon and feature graphic are declared AI-assisted original artwork. Six actual
  synthetic-account emulator screenshots are not generated mockups.

Revisit every declaration if SDKs, providers, payment/bank features or data use change.
Reference: https://support.google.com/googleplay/android-developer/answer/10787469.

## Local assistant development — not submitted to Play

Read-only Ask Finora introduces optional prompt processing by OpenAI and bounded
answer-report metadata. No store declaration was edited and chat is disabled by
default. Before any release or real-user activation, reassess collected chat/search
content, financial information voluntarily included in prompts, optional use,
retention and the service-provider sharing classification against the actual
OpenAI account configuration. Deploy the revised hosted privacy page first. The
in-app disclosure and report flow are implemented; they do not replace the Play
forms or guarantee policy approval. See assistant-plan.md for data flow and gates.
