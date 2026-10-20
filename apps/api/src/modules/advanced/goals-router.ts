import { z } from 'zod';
import {
  contributionInputSchema,
  deleteRecordSchema,
  entityIdSchema,
  goalInputSchema,
  goalUpdateSchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import { deleteOwned, ensureAdvancedIndexes } from './common';
import * as service from './goals';

export async function goalsRoute(request: Request, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').split('/').slice(3);
  const [resource, rawId, action, rawChildId] = path;
  if (resource !== 'goals') return null;
  const context = await authenticate(request);
  await ensureAdvancedIndexes();
  const result = (data: unknown, status = 200) => success(data, requestId, status);
  const id = rawId ? entityIdSchema.parse(rawId) : undefined;
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  if (id && action === 'contributions') {
    if (path.length === 3 && request.method === 'POST')
      return result(
        await service.addContribution(
          context,
          request,
          id,
          await readBody(request, contributionInputSchema),
        ),
        201,
      );
    if (path.length === 4 && request.method === 'DELETE') {
      const input = await readBody(request, deleteRecordSchema);
      return result(
        await service.removeContribution(
          context,
          request,
          id,
          entityIdSchema.parse(rawChildId),
          input.version,
        ),
      );
    }
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
  }
  if (path.length > 2) throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  if (request.method === 'GET') {
    const goals = await service.listGoals(context, id);
    return result(id ? goals[0] : goals);
  }
  if (!id && request.method === 'POST')
    return result(
      await service.saveGoal(context, request, await readBody(request, goalInputSchema)),
      201,
    );
  if (id && request.method === 'PATCH')
    return result(
      await service.saveGoal(context, request, await readBody(request, goalUpdateSchema), id),
    );
  if (id && request.method === 'DELETE') {
    const input = await readBody(request, deleteRecordSchema);
    return result(await deleteOwned(context, request, 'savings_goals', id, input.version));
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
}
