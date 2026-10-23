import { DeviceVault, type VaultDriver, type VaultRow } from '../src/storage/vault-core';

// Reusable durable-map boundary for session/retry tests; native encryption is device QA.
export function testVault(ownerId: string, rows = new Map<string, VaultRow>()) {
  const driver: VaultDriver = {
    get: async (key) => rows.get(key) ?? null,
    put: async (key, value, updated) => {
      rows.set(key, { key, value, updated });
    },
    remove: async (key) => {
      rows.delete(key);
    },
    list: async (prefix) =>
      [...rows.values()]
        .filter((r) => r.key.startsWith(prefix))
        .sort((a, b) => a.updated - b.updated),
    close: async () => undefined,
    purge: async () => {
      rows.clear();
    },
  };
  return { vault: new DeviceVault(ownerId, driver), rows };
}
