import { supportEmail } from '../../src/config/public';

export default function Terms() {
  return (
    <>
      <h1>Finora terms of use</h1>
      <p>
        Last updated: 21 October 2026. These terms describe use of Finora’s personal finance
        tracking application and hosted services. Questions can be sent to{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
      <p>
        Finora records financial information you enter manually. It does not connect to banks, move
        money or provide investment, tax or lending advice. Verify your records against original
        statements.
      </p>
      <p>
        Keep your credentials secure. Use exports responsibly: exported files contain sensitive
        unencrypted information. Premium purchasing and live billing are not enabled.
      </p>
      <p>
        Use Finora only for records you are authorized to manage. Do not attempt to access another
        user’s data, interfere with the service, or use it for unlawful activity. Finora is intended
        for adults. You remain responsible for the records you enter and the files you share.
      </p>
      <p>
        Service availability and error-free operation are not guaranteed. Keep independent copies of
        important records. Finora is not a substitute for bank statements or professional advice.
        Nothing here limits rights or remedies that applicable law requires.
      </p>
      <p>
        You can stop using Finora and <a href="/delete-account">delete your account</a> at any time.
        Read the <a href="/privacy">privacy policy</a> for data handling and deletion details.
      </p>
    </>
  );
}
