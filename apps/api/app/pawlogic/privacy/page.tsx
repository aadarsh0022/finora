import type { Metadata } from 'next';
import { supportEmail } from '../../../src/config/public';

export const metadata: Metadata = {
  title: 'Pawlogic: Cat Logic Puzzle — Privacy Policy',
  description: 'Privacy policy for Pawlogic: Cat Logic Puzzle.',
};

export default function PawlogicPrivacy() {
  return (
    <>
      <p className="eyebrow">Pawlogic: Cat Logic Puzzle</p>
      <h1>Privacy Policy</h1>
      <p>Last updated: 31 October 2026</p>
      <p>
        Pawlogic is an offline logic puzzle game. This policy describes how the Android app handles
        information in version 1.0.0.
      </p>

      <h2>Information stored on your device</h2>
      <p>
        The game stores your puzzle progress, current board, preferences and settings in the app’s
        private storage on your device. This information lets you continue your game. It is not sent
        to Pawlogic servers.
      </p>

      <h2>Information collected or shared</h2>
      <p>
        Pawlogic does not require an account and does not include advertising, analytics or in-app
        purchases. The app does not collect or transmit personal information. It does not request
        internet access. Optional vibration provides touch feedback and can be turned off in the
        game settings.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Your game data stays in the app’s private storage. You can delete it by clearing Pawlogic’s
        storage in Android settings or uninstalling the app. Android device backup behavior may
        depend on your device and system settings.
      </p>

      <h2>Children’s privacy</h2>
      <p>
        Pawlogic is a general-audience puzzle game. It does not knowingly collect personal
        information from children or other players.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If the app’s information practices change, this page will be updated before those changes
        take effect. Please check the updated date above.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </>
  );
}
