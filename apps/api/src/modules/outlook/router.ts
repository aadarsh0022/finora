import { z } from 'zod';
import { authenticate } from '../auth/service';
import { ApiError, success } from '../../utils/http';
import { getOutlook } from './service';

export async function outlookRoute(request: Request, requestId: string) {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/$/, '') !== '/api/v1/planning/outlook') return null;
  const context = await authenticate(request);
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  if (request.method !== 'GET')
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Outlook is read-only.');
  return success(await getOutlook(context), requestId);
}
