# Production disclosure worksheet

This is an evidence worksheet, not a completed Play Console submission or legal
certification. Reconcile it with the deployed build, hosting/proxy logs, provider
contracts, retention choices and the current Console questionnaire before release.

| Data in the implementation                                        | Purpose and destination                                                                  | Handling                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Email and profile name                                            | Account management in Finora's MongoDB; recovery email address sent to configured Resend | Not included in finance backups; removed by confirmed account deletion                                                     |
| Password                                                          | Sent to Finora API for authentication; Argon2id hash in MongoDB                          | Never returned, exported or logged; not stored in mobile preferences                                                       |
| Session credentials/device label                                  | API authentication and device-session management                                         | Random tokens in SecureStore, digests in MongoDB; device label is supplied by the app, not a hardware identifier           |
| Manual accounts, amounts, categories, transaction notes/merchants | User-requested tracking, reports and planning in Finora's MongoDB                        | User-scoped reads/writes; no advertising or financial-data analytics events                                                |
| Budgets, savings annotations and recurring rules                  | Planning features in MongoDB                                                             | No bank connection, money movement or autonomous bill payments                                                             |
| Exported/imported files                                           | User-selected system sharing/file picker                                                 | Unencrypted files; temporary mobile copies removed after the operation; destination depends on the user's sharing choice   |
| Recovery messages                                                 | Verified Resend delivery in production                                                   | Single-use 30-minute token; local development outbox is prohibited in production                                           |
| Request IDs and safe error codes                                  | Operational diagnostics                                                                  | Application logs exclude request bodies, tokens and financial text                                                         |
| Short-lived throttle metadata                                     | Abuse prevention in MongoDB                                                              | HMAC of address/email + time bucket; raw IP/email not stored in throttle records; proxy/provider logs need separate review |

Production must use HTTPS and secure Atlas connectivity. Local emulator HTTP is a
development setting; do not declare the deployed transport verified until checked.
Application automatic Android backup is disabled and broad storage, overlay and
vibration permissions are blocked. The file picker grants access to the selected file.
Optional app lock uses the operating system's strong-biometric prompt. Finora
receives a success/failure result and keeps only a per-account local SecureStore
policy; biometric templates are not collected by or sent to the Finora API.

There is no implemented billing, banking, advertising, third-party end-user analytics,
AI service, contacts/location access or finance-data crash reporting. Inventory the
actual release SDKs again before submission; developer-build tooling is not proof of
release SDK behavior. State processor/sharing classifications from actual agreements,
not assumptions. Establish retention for infrastructure backups and support requests.

The financial features declaration should describe manual expense/budget tracking.
Do not claim lending, investing, payments, transfers of real funds or regulated advice.
The owner must select the final Console answers and public deletion/support channels.

The prepared public URLs use https://finora-api-olive.vercel.app: /privacy,
/support and /delete-account. A separately authorized Resend inbox receives support
requests at support@finora.aadarshx.in. Account deletion is also available without
the Android app; login credentials and its temporary session remain in browser
memory only. Support correspondence is additional user-supplied data handled by
Resend and the operator; include it when completing the final disclosure.
