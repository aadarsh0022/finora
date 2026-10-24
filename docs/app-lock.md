# Optional biometric app lock

Enable the lock under Settings → Password and security after enrolling a strong
fingerprint or face biometric in Android device settings. Enable and disable both
require successful native authentication. Android Class 2 face unlock and device
PIN fallback are not accepted by this feature.

The policy is stored in SecureStore for this user on this device. Restored sessions
start locked only when the saved policy is enabled. With app lock enabled,
entering the background clears the unlocked state and inactive windows hide content. A full-screen native modal covers financial screens, including
transaction modals, and hidden descendants cannot receive touches or accessibility
focus. Forms remain mounted so unsaved entries survive backgrounding.

Cancellation, unavailable enrollment, unreadable settings and late authentication
responses never grant access. Account changes invalidate outstanding operations.
If biometrics stop working, “Sign out and reset app lock” first removes the saved
session, then resets the local policy. Sign in again with email and password.

This is a local visibility control. Backend authentication and SecureStore token
protection remain required. It does not encrypt JSON exports or promise protection
on a compromised operating system. Native authentication, modal coverage,
app-switcher snapshots and accessibility still require device QA; controller and
component tests alone do not establish those properties on every Android device.

Uses [Expo LocalAuthentication SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/local-authentication/).
Biometric templates remain managed by the operating system and are not sent to the
Finora API. The operating system reports authentication success or failure.

## Disabled-policy reopening fix, 24 October 2026

Disabled or absent lock policies never present the biometric lock screen, including
an initially inactive AppState and repeated background/foreground transitions.
While the policy is loading, a branded startup overlay protects content instead
of showing a native lock modal. Enabled, locked policies and policy-read errors
still use the blocking lock UI. No settings, credentials or saved entries are reset.

The enabled lock UI fills its native modal with its own safe-area provider,
centered branding and lock message, and lower unlock/recovery actions. The content
can scroll on short screens or with larger text rather than clipping controls.
