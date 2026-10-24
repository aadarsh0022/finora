import { accountSchema, type onboardingSyncSchema } from '@finora/contracts';
import type { z } from 'zod';
import { ApiError } from '../../utils/http';
import { publicUser, userRecordSchema } from '../../database/models';
import type { AuthContext } from '../auth/service';
import { mutate } from './mutation';

export function completeOnboarding(context: AuthContext, request: Request) {
  return mutate(context, request, {}, async (db, session) => {
    const users = db.collection('users');
    const current = userRecordSchema.parse(
      await users.findOne({ id: context.user.id }, { session }),
    );
    const onboardingCompletedAt = current.onboardingCompletedAt ?? new Date();
    await users.updateOne(
      { id: context.user.id },
      { $set: { onboardingCompletedAt } },
      { session },
    );
    return publicUser({ ...current, onboardingCompletedAt });
  });
}

export function syncOnboarding(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof onboardingSyncSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    const users = db.collection('users');
    const current = userRecordSchema.parse(
      await users.findOne({ id: context.user.id }, { session }),
    );
    // Do not overwrite preferences changed on another device while setup was offline.
    if (JSON.stringify(current.preferences) !== JSON.stringify(input.baseline))
      throw new ApiError(
        409,
        'SETTINGS_CONFLICT',
        'Preferences changed on another device. Review them before trying again.',
      );
    if (current.preferences.baseCurrency !== input.preferences.baseCurrency) {
      for (const name of [
        'accounts',
        'transactions',
        'debts',
        'budgets',
        'monthly_budget_limits',
        'savings_goals',
        'recurring_rules',
        'savings_contributions',
      ]) {
        if (await db.collection(name).findOne({ userId: current.id }, { session }))
          throw new ApiError(
            409,
            'CURRENCY_LOCKED',
            'Base currency cannot change once you have financial records.',
          );
      }
    }
    let account;
    if (input.account) {
      if (await db.collection('accounts').findOne({ userId: current.id }, { session }))
        throw new ApiError(
          409,
          'SETUP_ACCOUNT_EXISTS',
          'An account already exists. Review your accounts before adding another.',
        );
      const now = new Date().toISOString();
      account = accountSchema.parse({
        ...input.account,
        userId: current.id,
        currency: input.preferences.baseCurrency,
        archived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await db.collection('accounts').insertOne({ ...account }, { session });
    }
    const updatedAt = new Date();
    const onboardingCompletedAt = current.onboardingCompletedAt ?? updatedAt;
    const version = current.settingsVersion + 1;
    await users.updateOne(
      { id: current.id },
      {
        $set: {
          preferences: input.preferences,
          settingsVersion: version,
          onboardingCompletedAt,
          updatedAt,
        },
      },
      { session },
    );
    return {
      user: publicUser({
        ...current,
        preferences: input.preferences,
        onboardingCompletedAt,
        updatedAt,
      }),
      ...(account ? { account } : {}),
      settings: { preferences: input.preferences, version },
    };
  });
}
