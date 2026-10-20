export default function Support() {
  return (
    <>
      <h1>Support & account deletion</h1>
      <p>
        Finora is in development. A monitored support address and public deletion-request channel
        must be configured before launch.
      </p>
      <h2>Delete in the application</h2>
      <p>
        The account deletion API requires a valid session, your password and the confirmation text
        DELETE. It removes the profile, sessions and associated finance records. Export any records
        you want to keep first.
      </p>
      <h2>Password recovery</h2>
      <p>
        Recovery links expire after 30 minutes and are single use. Production recovery requires a
        configured email provider and verified sender.
      </p>
    </>
  );
}
