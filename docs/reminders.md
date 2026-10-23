# Local reminders

Development only. Reminders are opt-in and off by default. Settings → Reminders
lets a user enable a daily check-in, due-date reminders for debts/recurring items,
and a warning once per category/overall monthly budget. Preferences live in the
user's encrypted device vault. The OS permission request follows an explicit save.
Denied permission is explained and can be revisited through device settings.

Notification title/body contain only Finora and generic prompts: no amounts,
people, notes, merchants or account names. Opening a notification opens the app,
where the existing session/app-lock gates apply. No push token, remote push, email,
exact-alarm permission or financial posting is involved.

Daily prompts use device local time; due dates use the stored item's timezone at
noon. Plans contain at most 50 notifications covering the next 30 days. Existing
pending items and overdue debts are grouped into one review reminder. Paused rules,
settled/archived/cancelled debts and out-of-range dates do not create new reminders.
Monthly/yearly recurrence retains its original anchor and month-end clamping.

Opening/foregrounding a verified session, reconnecting or saving financial changes
refreshes plans. This is best-effort device scheduling, not a background server job:
changes from another device require this app to refresh. OS notification settings,
battery policies and a long absence from the app can delay or prevent delivery.
Sign-out/session expiry invalidates in-flight plans and cancels Finora's scheduled
notifications. Budget delivery markers prevent repeated alerts after delivery.

Planner/reconciliation tests cover long-lived rules, timezones, caps, exclusions,
generic content, once-per-budget alerts and stale-plan cancellation. Native OS
permission/delivery and sign-out cancellation still require device QA.
