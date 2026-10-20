# Closed testing runbook

Do not upload or publish automatically. First complete the release checklist and
produce a signed build against the intended HTTPS API with working recovery email.

The user's existing personal developer account has a confirmed 12-tester/14-day
gate for its current draft. Check Finora's own Console eligibility rather than
assuming a new app is exempt. Google's current guidance requires eligible new
personal accounts to maintain at least 12 opted-in testers continuously for 14 days
before applying for production access. See the [official testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en),
checked 20 October 2026. Meeting that threshold enables an application for access;
it does not itself establish app quality or guarantee production approval.

1. Confirm the Finora package ID, signing ownership, versionCode, privacy/support
   URLs and accurate Console declarations. Use the existing developer account.
2. Run internal testing first. Use synthetic finance records and separate staging
   data, never bank credentials or real-money transactions.
3. Create Finora's closed-testing track and tester list/group in Console. Share
   its opt-in link only with recruited testers after obtaining permission to contact
   them. This repository does not send invitations or claim anyone has opted in.
4. Track opt-in continuity and the actual Console dates. Collect feedback privately
   without passwords, tokens, backup files or real financial descriptions.
5. Test register/login/recovery, account creation, exact amounts, income/expense,
   transfer conservation, edit/delete/duplicate, filters, budgets, contributions,
   recurring confirmation, preferences, export/restore, logout and deletion.
6. Include small screens, larger text, both themes, Android back gestures, slow/offline
   network, rotation/resume, repeat taps, expired sessions and a second user/device.
7. Record build/device/OS, safe reproduction steps and results. Fix issues and rerun
   affected checks. Verify no other user's records ever appear after account switching.
8. Only after required testing and readiness evidence are complete, the owner can
   apply for production access and answer the Console questions truthfully.

Native device testing, tester recruitment, continuous participation, production access
and store review are not completed by CI, an Android bundle or a repository push.
