import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { entityIdSchema } from '@finora/contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DeviceVault, type VaultDriver, type VaultRow } from './vault-core';
export { DeviceVault } from './vault-core';

async function namespace(origin: string) {
  return (
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, new URL(origin).origin)
  ).slice(0, 24);
}
export async function cachedOwner(origin: string) {
  const raw = await SecureStore.getItemAsync(`finora.local-owner.${await namespace(origin)}`);
  return entityIdSchema.safeParse(raw).success ? raw : null;
}
export async function rememberOwner(origin: string, ownerId: string | null) {
  const key = `finora.local-owner.${await namespace(origin)}`;
  if (ownerId)
    await SecureStore.setItemAsync(key, entityIdSchema.parse(ownerId), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(key);
}

export async function openVault(origin: string, ownerId: string): Promise<DeviceVault> {
  entityIdSchema.parse(ownerId);
  const scope = `${await namespace(origin)}.${ownerId}`;
  const keyName = `finora.vault-key.${scope}`;
  const name = `finora.${scope}.db`;
  const sqlite = await import('expo-sqlite');
  let secret = await SecureStore.getItemAsync(keyName);
  if (!secret) {
    secret = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    await SecureStore.setItemAsync(keyName, secret, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('The local encryption key cannot be read.');
  let db: SQLiteDatabase | undefined;
  try {
    db = await sqlite.openDatabaseAsync(name);
    const cipher = await db.getFirstAsync<Record<string, unknown>>('PRAGMA cipher_version');
    if (!cipher || !Object.values(cipher).some((v) => typeof v === 'string' && v.length > 0))
      throw new Error(
        'This build does not support encrypted local storage. Install the latest Finora development build.',
      );
    // Only a generated and validated hexadecimal key is interpolated. Never log it.
    await db.execAsync(
      `PRAGMA key = "x'${secret}'"; PRAGMA cipher_memory_security = ON; PRAGMA secure_delete = ON; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS vault (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL);`,
    );
    const connection = db;
    const driver: VaultDriver = {
      get: (key) =>
        connection.getFirstAsync<VaultRow>('SELECT key,value,updated FROM vault WHERE key=?', key),
      async put(key, value, updated) {
        await connection.runAsync(
          'INSERT INTO vault (key,value,updated) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated',
          key,
          value,
          updated,
        );
      },
      async remove(key) {
        await connection.runAsync('DELETE FROM vault WHERE key=?', key);
      },
      list: (prefix) =>
        connection.getAllAsync<VaultRow>(
          'SELECT key,value,updated FROM vault WHERE substr(key,1,?)=? ORDER BY updated,key',
          prefix.length,
          prefix,
        ),
      close: () => connection.closeAsync(),
      async purge() {
        await connection.closeAsync();
        await sqlite.deleteDatabaseAsync(name);
        await SecureStore.deleteItemAsync(keyName);
      },
    };
    return new DeviceVault(ownerId, driver);
  } catch (e) {
    await db?.closeAsync().catch(() => undefined);
    throw e;
  }
}
