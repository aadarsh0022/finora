import type { settingsUpdateSchema } from '@finora/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { mutate, requireVersion } from './mutation';
import { userRecordSchema } from '../../database/models';

export function getSettings(context: AuthContext) {
  return { preferences: context.user.preferences, version: context.user.settingsVersion };
}
export async function updateSettings(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof settingsUpdateSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    const users = db.collection('users');
    const user = userRecordSchema.parse(await users.findOne({ id: context.user.id }, { session }));
    requireVersion(user.settingsVersion, input.version);
    if (
      user.preferences.baseCurrency !== input.preferences.baseCurrency &&
      (await db.collection('accounts').findOne({ userId: context.user.id }, { session }))
    )
      throw new ApiError(
        409,
        'CURRENCY_LOCKED',
        'Base currency cannot change after you create an account.',
      );
    const version = user.settingsVersion + 1;
    await users.updateOne(
      { id: user.id },
      { $set: { preferences: input.preferences, settingsVersion: version, updatedAt: new Date() } },
      { session },
    );
    return { preferences: input.preferences, version };
  });
}
