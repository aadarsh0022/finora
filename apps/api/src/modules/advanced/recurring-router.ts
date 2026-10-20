import { z } from 'zod';
import {
  archiveSchema,
  deleteRecordSchema,
  entityIdSchema,
  occurrenceConfirmSchema,
  recurringRuleInputSchema,
  recurringRuleUpdateSchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import { deleteOwned, ensureAdvancedIndexes } from './common';
import * as service from './recurring';

export async function recurringRoute(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').split('/').slice(3);
  const [resource, rawId, action] = path;
  if (!['recurring', 'recurring-occurrences'].includes(resource ?? '')) return null;
  const context = await authenticate(request);
  await ensureAdvancedIndexes();
  const result = (data: unknown, status = 200) => success(data, requestId, status);
  const emptyQuery = () => z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  const method = request.method;
  if (resource === 'recurring' && rawId === 'generate' && path.length === 2 && method === 'POST') {
    emptyQuery();
    await readBody(request, z.object({}).strict());
    return result(await service.generateOccurrences(context, request));
  }
  const id = rawId ? entityIdSchema.parse(rawId) : undefined;
  if (
    resource === 'recurring' &&
    id &&
    ['pause', 'resume'].includes(action ?? '') &&
    path.length === 3 &&
    method === 'POST'
  ) {
    emptyQuery();
    const input = await readBody(request, archiveSchema);
    return result(await service.pauseRule(context, request, id, input.version, action === 'pause'));
  }
  if (resource === 'recurring-occurrences') {
    if (!id && path.length === 1 && method === 'GET') {
      const input = z
        .object({ status: z.enum(['PENDING', 'POSTED']).optional() })
        .strict()
        .parse(Object.fromEntries(url.searchParams));
      return result(await service.listOccurrences(context, input.status));
    }
    if (id && action === 'confirm' && path.length === 3 && method === 'POST') {
      emptyQuery();
      return result(
        await service.confirmOccurrence(
          context,
          request,
          id,
          await readBody(request, occurrenceConfirmSchema),
        ),
      );
    }
    throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  }
  if (path.length > 2) throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  emptyQuery();
  if (method === 'GET') {
    const rules = await service.listRules(context);
    if (!id) return result(rules);
    const rule = rules.find((item) => item.id === id);
    if (!rule) throw new ApiError(404, 'NOT_FOUND', 'This rule was not found.');
    return result(rule);
  }
  if (!id && method === 'POST')
    return result(
      await service.saveRule(context, request, await readBody(request, recurringRuleInputSchema)),
      201,
    );
  if (id && method === 'PATCH')
    return result(
      await service.saveRule(
        context,
        request,
        await readBody(request, recurringRuleUpdateSchema),
        id,
      ),
    );
  if (id && method === 'DELETE') {
    const input = await readBody(request, deleteRecordSchema);
    return result(await deleteOwned(context, request, 'recurring_rules', id, input.version));
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
}
