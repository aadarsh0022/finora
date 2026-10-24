import { reportRangeSchema, monthSchema } from '@finora/contracts';
import { z } from 'zod';
import { authenticate } from '../auth/service';
import { ApiError, success } from '../../utils/http';
import { reportSummary } from './service';
import { getInsights } from './insights';

export async function reportsRoute(request: Request, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').split('/').slice(3);
  if (path[0] !== 'reports' || path[1] === 'overview') return null;
  if (
    path.length !== 2 ||
    !['summary', 'cashflow', 'categories', 'accounts', 'trends', 'insights'].includes(path[1] ?? '')
  )
    throw new ApiError(404, 'NOT_FOUND', 'This report does not exist.');
  const context = await authenticate(request);
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  if (path[1] === 'insights') {
    const input = z
      .object({ month: monthSchema.optional() })
      .strict()
      .parse(Object.fromEntries(url.searchParams));
    return success(await getInsights(context, input.month), requestId);
  }
  const input = reportRangeSchema.parse(Object.fromEntries(url.searchParams));
  const report = await reportSummary(context, input);
  const resource = path[1] as 'summary' | 'cashflow' | 'categories' | 'accounts' | 'trends';
  return success(
    resource === 'summary' ? report : { period: report.period, [resource]: report[resource] },
    requestId,
  );
}
