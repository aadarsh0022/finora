import { supportEmail } from '../../src/config/public';

export default function Terms() {
  return (
    <>
      <h1>Finora AI Money Manager terms of use</h1>
      <p>
        Last updated: 29 October 2026. These terms describe use of Finora AI’s personal finance
        tracking application and hosted services. Questions can be sent to{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
      <p>
        Finora AI records financial information you enter manually. It does not connect to banks,
        move money or provide investment, tax or lending advice. Verify your records against
        original statements.
      </p>
      <h2>AI assistance and your records</h2>
      <p>
        Optional AI chat helps you explore recorded information and prepare supported changes.
        Review the details and confirm before a change is saved. AI replies can be incomplete or
        incorrect. They do not execute bank payments or replace professional advice. Free accounts
        currently receive up to 20 AI messages per UTC day; administrator accounts may have
        different limits. Ordinary manual tracking remains available when the AI allowance is used.
      </p>
      <h2>Offline use</h2>
      <p>
        Supported records can be kept on your device and new transactions delivered automatically
        when connectivity returns. Keep the app installed and its data intact until your entries are
        available in your account. Some actions, including AI chat, sign-in and password recovery,
        need a connection.
      </p>
      <p>
        Keep your credentials secure. Use exports responsibly: exported files contain sensitive
        unencrypted information. Premium purchasing and live billing are not enabled.
      </p>
      <p>
        Use Finora AI only for records you are authorized to manage. Do not attempt to access
        another user’s data, interfere with the service, or use it for unlawful activity. Finora AI
        is intended for adults. You remain responsible for the records you enter and the files you
        share.
      </p>
      <p>
        Service availability and error-free operation are not guaranteed. Keep independent copies of
        important records. Finora AI is not a substitute for bank statements or professional advice.
        Nothing here limits rights or remedies that applicable law requires.
      </p>
      <p>
        You can stop using Finora AI and <a href="/delete-account">delete your account</a> at any
        time. Read the <a href="/privacy">privacy policy</a> for data handling and deletion details.
      </p>
    </>
  );
}
