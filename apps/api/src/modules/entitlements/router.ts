import { z } from 'zod';
import { authenticate } from '../auth/service';
import { ApiError, success } from '../../utils/http';
import { getEntitlement } from './service';

export async function entitlementsRoute(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (path !== '/api/v1/entitlements') return null;
  const context = await authenticate(request);
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  return success(await getEntitlement(context), requestId);
}
