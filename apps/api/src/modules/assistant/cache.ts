import { createHmac } from 'node:crypto';
import { getEnv } from '../../config/env';
export class PrivateCache<T> {
  private rows = new Map<string, { value: T; expires: number }>();
  constructor(private maximum = 256) {}
  get(key: string) {
    const row = this.rows.get(key);
    if (!row || row.expires <= Date.now()) {
      this.rows.delete(key);
      return undefined;
    }
    return structuredClone(row.value);
  }
  put(key: string, value: T, ttl: number) {
    this.rows.delete(key);
    while (this.rows.size >= this.maximum) this.rows.delete(this.rows.keys().next().value!);
    this.rows.set(key, { value: structuredClone(value), expires: Date.now() + ttl });
  }
}
export const privateCacheKey = (parts: unknown) =>
  createHmac('sha256', getEnv().RATE_LIMIT_SECRET).update(JSON.stringify(parts)).digest('hex');
