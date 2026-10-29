import { z } from 'zod';
import { deviceLedgerSchema } from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ledgerSnapshot } from './ledger';
import { rateLimit } from '../../security/rate-limit';
import { ApiError, success } from '../../utils/http';
export async function deviceLedgerRoute(request: Request, requestId: string) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/v1/sync/ledger') return null;
  const context = await authenticate(request);
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  await rateLimit(request, 'device-ledger', context.user.id, 60);
  return success(deviceLedgerSchema.parse(await ledgerSnapshot(context)), requestId);
}
