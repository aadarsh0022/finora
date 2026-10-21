import { supportEmail } from '../../src/config/public';

export default function Privacy() {
  return (
    <>
      <h1>Finora privacy policy</h1>
      <p>
        Last updated: 21 October 2026. This policy describes Finora’s Android application and its
        hosted account services. For privacy questions or requests, contact{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
      <h2>Information stored</h2>
      <p>
        The service stores your email, display name, password hash, preferences, sessions and
        finance records you enter. Passwords are hashed using Argon2id. Authentication tokens are
        stored as hashes on the server. Manual tracking does not require bank credentials.
      </p>
      <h2>How it is used</h2>
      <p>
        Records provide your finance tracking and account security. Operational logs contain request
        IDs and safe error codes, not transaction notes, merchants or authentication credentials. No
        advertising or third-party end-user analytics SDK is integrated. We do not sell your
        financial records or use them for advertising.
      </p>
      <h2>Providers and retention</h2>
      <p>
        Vercel hosts the API and these pages. MongoDB Atlas stores account and financial records.
        Resend delivers password recovery emails and hosts the support inbox. Recovery emails
        contain your email address and a single-use reset link; they do not contain your financial
        records. Providers may process data outside your country. Hosting providers may process
        network metadata, including IP addresses, for delivery, security and operations.
      </p>
      <p>
        Account and financial records are retained while you use Finora, until you delete them or
        your account. Sessions expire after 30 days; recovery links expire after 30 minutes.
        Abuse-prevention counters expire automatically. Support messages remain in the support inbox
        until the conversation is resolved and removed. Provider-held operational records and
        infrastructure backups have separate retention from the active application database. Contact
        us with questions about retention or deletion requests.
      </p>
      <h2>Your device and exports</h2>
      <p>
        Session tokens are kept in the operating system’s secure storage. Optional biometric app
        lock uses the device’s authentication prompt; Finora does not collect biometric templates.
        Files you export or share are unencrypted and remain under your control. Finora accesses
        import files only when you select them. Android automatic application backup is disabled.
      </p>
      <h2>Deletion</h2>
      <p>
        Authenticated account deletion requires your password and explicit confirmation. It deletes
        your user profile and associated application data and invalidates sessions. You can also{' '}
        <a href="/delete-account">delete your account on this website</a> without the Android app,
        or request help at <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Exported or shared
        files are not removed from your own storage or another recipient’s storage by account
        deletion.
      </p>
      <h2>Your choices</h2>
      <p>
        You can review, correct and export your records in the app, change your password, revoke
        sessions and delete your account. Finora is intended for adults and is not directed at
        children. Material changes to this policy will be reflected on this page with an updated
        date.
      </p>
    </>
  );
}
