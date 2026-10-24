import type { ZodType } from 'zod';

export interface VaultRow {
  key: string;
  value: string;
  updated: number;
}
export interface VaultDriver {
  get(key: string): Promise<VaultRow | null>;
  put(key: string, value: string, updated: number): Promise<void>;
  remove(key: string): Promise<void>;
  list(prefix: string): Promise<VaultRow[]>;
  close(): Promise<void>;
  purge(): Promise<void>;
}

export class DeviceVault {
  private active = true;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    readonly ownerId: string,
    private driver: VaultDriver,
  ) {}
  private run<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.tail
      .catch(() => undefined)
      .then(() => {
        if (!this.active) throw new Error('Local session changed.');
        return action();
      });
    this.tail = operation;
    return operation;
  }
  async read<T>(key: string, schema: ZodType<T>, maxAge = 30 * 86400000) {
    return this.run(async () => {
      const row = await this.driver.get(key);
      if (!row || Date.now() - row.updated > maxAge) return null;
      try {
        return { value: schema.parse(JSON.parse(row.value)), updated: row.updated };
      } catch {
        await this.driver.remove(key);
        return null;
      }
    });
  }
  write(key: string, value: unknown) {
    return this.run(async () => {
      const serialized = JSON.stringify(value);
      if (serialized.length > 2 * 1024 * 1024) throw new Error('Local record is too large.');
      await this.driver.put(key, serialized, Date.now());
      if (key.startsWith('read:')) {
        const rows = await this.driver.list('read:');
        for (const row of rows.sort((a, b) => b.updated - a.updated).slice(200))
          await this.driver.remove(row.key);
      }
    });
  }
  remove(key: string) {
    return this.run(() => this.driver.remove(key));
  }
  list<T>(prefix: string, schema: ZodType<T>) {
    return this.run(async () => {
      const result: { key: string; value: T; updated: number }[] = [];
      for (const row of await this.driver.list(prefix)) {
        // Corrupt pending records are never silently discarded.
        try {
          result.push({
            key: row.key,
            value: schema.parse(JSON.parse(row.value)),
            updated: row.updated,
          });
        } catch {
          throw new Error(
            'Some local records cannot be read. Keep this device and contact support.',
          );
        }
      }
      return result;
    });
  }
  async close(purge = false) {
    this.active = false;
    await this.tail.catch(() => undefined);
    if (purge) await this.driver.purge();
    else await this.driver.close();
  }
}
