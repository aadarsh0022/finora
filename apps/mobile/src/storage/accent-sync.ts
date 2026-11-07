import * as Crypto from 'expo-crypto';
import {
  settingsSchema,
  settingsUpdateSchema,
  type AccentColor,
  type Preferences,
} from '@finora/contracts';
import { ClientError, type ApiClient } from '../api/client';

/**
 * Saves the theme colour to the account. Re-reads the settings first so another device's changes
 * to other preferences are kept, and retries once if they change while saving.
 */
export async function pushAccentColor(
  api: Pick<ApiClient, 'request'>,
  accent: AccentColor,
): Promise<{ preferences: Preferences }> {
  for (let attempt = 0; ; attempt++) {
    const current = await api.request('settings', settingsSchema);
    if (current.preferences.accentColor === accent) return current;
    try {
      return await api.request('settings', settingsSchema, {
        method: 'PATCH',
        body: settingsUpdateSchema.parse({
          preferences: { ...current.preferences, accentColor: accent },
          version: current.version,
        }),
        operationKey: Crypto.randomUUID(),
      });
    } catch (error) {
      if (attempt === 0 && error instanceof ClientError && error.status === 409) continue;
      throw error;
    }
  }
}
