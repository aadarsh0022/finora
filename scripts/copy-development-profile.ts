import { copyProfile } from '../apps/api/src/operations/copy-profile';
import { openProfileCopyClient } from '../apps/api/src/operations/profile-copy-client';

// The explicit flag is intentionally separate from the email. Preview is the default.
const [, , email, action] = process.argv;
if (!email || (action !== undefined && action !== '--apply'))
  throw new Error('Usage: copy-development-profile.ts <account-email> [--apply]');
if (action === '--apply' && process.env.FINORA_APPROVED_PROFILE_COPY !== '1')
  throw new Error('Applying a copy requires explicit approval and FINORA_APPROVED_PROFILE_COPY=1.');
process.loadEnvFile('apps/api/.env.local');
const client = openProfileCopyClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const result = await copyProfile(
    client,
    'finora_development',
    'finora_production',
    email,
    action === '--apply',
  );
  console.info(JSON.stringify(result));
} catch {
  // Never serialize database errors, financial values, profile fields or hashes.
  console.error('Profile copy stopped. No credential or record details were logged.');
  process.exitCode = 1;
} finally {
  await client.close();
}
