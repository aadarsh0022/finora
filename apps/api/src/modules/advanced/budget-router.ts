import { z } from 'zod';
import {
  budgetInputSchema,
  budgetUpdateSchema,
  deleteRecordSchema,
  entityIdSchema,
  monthSchema,
  monthlyLimitInputSchema,
  copyBudgetsSchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import { deleteOwned, ensureAdvancedIndexes } from './common';
import * as service from './budgets';

export async function budgetRoute(request: Request, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').split('/').slice(3);
  const [resource, rawId] = path;
  if (resource !== 'budgets') return null;
  const context = await authenticate(request);
  await ensureAdvancedIndexes();
  const result = (data: unknown, status = 200) => success(data, requestId, status);
  if (path.length === 2 && rawId === 'copy' && request.method === 'POST') {
    z.object({}).strict().parse(Object.fromEntries(url.searchParams));
    return result(
      await service.copyBudgets(context, request, await readBody(request, copyBudgetsSchema)),
    );
  }
  if (path.length === 2 && rawId === 'total') {
    if (request.method === 'GET') {
      const input = z
        .object({ month: monthSchema })
        .strict()
        .parse(Object.fromEntries(url.searchParams));
      return result(await service.totalLimit(context, input.month));
    }
    z.object({}).strict().parse(Object.fromEntries(url.searchParams));
    if (request.method === 'POST')
      return result(
        await service.saveTotalLimit(
          context,
          request,
          await readBody(request, monthlyLimitInputSchema),
        ),
        201,
      );
    if (request.method === 'DELETE') {
      const input = await readBody(request, deleteRecordSchema.extend({ month: monthSchema }));
      return result(await service.removeTotalLimit(context, request, input.month, input.version));
    }
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
  }
  const id = rawId ? entityIdSchema.parse(rawId) : undefined;
  if (path.length > 2) throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  if (!id && request.method === 'GET') {
    const input = z
      .object({ month: monthSchema.optional() })
      .strict()
      .parse(Object.fromEntries(url.searchParams));
    return result(await service.listBudgets(context, input.month));
  }
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  if (!id && request.method === 'POST')
    return result(
      await service.saveBudget(context, request, await readBody(request, budgetInputSchema)),
      201,
    );
  if (id && request.method === 'PATCH')
    return result(
      await service.saveBudget(context, request, await readBody(request, budgetUpdateSchema), id),
    );
  if (id && request.method === 'GET') return result(await service.getBudget(context, id));
  if (id && request.method === 'DELETE') {
    const input = await readBody(request, deleteRecordSchema);
    return result(await deleteOwned(context, request, 'budgets', id, input.version));
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
}
