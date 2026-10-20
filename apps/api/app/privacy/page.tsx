export default function Privacy() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p>
        Development draft · 20 October 2026. Finora is not yet a public service. Operator identity,
        support contact and hosting region must be completed before release.
      </p>
      <h2>Information stored</h2>
      <p>
        The service stores your email, name, password hash, preferences, sessions and finance
        records you enter. Passwords are hashed using Argon2id. Authentication tokens are stored as
        hashes on the server. Manual tracking does not require bank credentials.
      </p>
      <h2>How it is used</h2>
      <p>
        Records provide your finance tracking and account security. Operational logs contain request
        IDs and safe error codes, not transaction notes, merchants or authentication credentials. No
        advertising or third-party analytics SDK is currently integrated.
      </p>
      <h2>Providers and retention</h2>
      <p>
        MongoDB stores records. When configured, Resend delivers password recovery emails. Final
        hosting details and provider disclosures will be published before launch. Sessions expire
        after 30 days. Security rate-limit data is short lived. Backups you export are unencrypted
        and remain under your control.
      </p>
      <h2>Deletion</h2>
      <p>
        Authenticated account deletion requires your password and explicit confirmation. It deletes
        your user profile and associated application data and invalidates sessions. Operational
        infrastructure backup retention and an external deletion contact must be defined before
        release.
      </p>
    </>
  );
}
