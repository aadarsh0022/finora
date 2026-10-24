import { supportEmail } from '../../src/config/public';

export default function Support() {
  return (
    <>
      <h1>Support & account deletion</h1>
      <p>
        For help with Finora AI or a privacy/deletion request, email{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Include your app version and a brief
        description. Never send passwords, recovery links, financial backups or sensitive
        transaction details.
      </p>
      <h2 id="delete-records">Delete records while keeping your account</h2>
      <p>
        To remove a transaction, open Transactions, select the entry, choose Delete transaction and
        confirm. This permanently removes that entry from the active application database and
        recalculates the affected balances; your profile and other records remain. It does not
        delete files you previously exported or shared. Provider-held backups and operational
        records have separate retention, described in the <a href="/privacy">privacy policy</a>.
      </p>
      <p>
        To request help removing specific data without closing your account, email{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a> from your account email and describe
        the type of data to remove. Do not include transaction details, passwords or backup files.
        We may need to verify ownership before processing a request.
      </p>
      <h2>Delete in the application</h2>
      <p>
        Open Settings → Password and security → Delete Finora AI account. Enter your current
        password and the confirmation text DELETE, then confirm deletion. This permanently removes
        the profile, sessions and associated finance records. Export any records you want to keep
        first.
      </p>
      <h2>Delete without the app</h2>
      <p>
        <a href="/delete-account">Delete your Finora AI account on this website</a> using your
        email, current password and explicit confirmation. You do not need to reinstall the app. If
        you cannot sign in, <a href="/recover-account">request a password reset</a> first.
      </p>
      <h2>Password recovery</h2>
      <p>
        Recovery links expire after 30 minutes and are single use. Production recovery requires a
        configured email provider and verified sender. Use{' '}
        <a href="/recover-account">account recovery</a> if you cannot sign in.
      </p>
    </>
  );
}
