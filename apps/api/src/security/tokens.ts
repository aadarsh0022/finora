import { createHash, randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const hashPassword = (password: string) =>
  hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export const verifyPassword = (digest: string, password: string) => verify(digest, password);
let dummyHash: Promise<string> | undefined;
export async function verifyMissingUser(password: string) {
  dummyHash ??= hashPassword(randomToken());
  await verifyPassword(await dummyHash, password);
}
