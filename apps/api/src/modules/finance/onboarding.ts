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
