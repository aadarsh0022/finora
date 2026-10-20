import {
  accountInputSchema,
  accountUpdateSchema,
  archiveSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  entityIdSchema,
  listEntitiesSchema,
} from '@finora/contracts';
import { z } from 'zod';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import * as entities from './entities';

export async function financeRoute(request: Request, requestId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, '').split('/').slice(3);
  const [resource, rawId] = path;
  if (!['accounts', 'categories'].includes(resource ?? '')) return null;
  if (path.length > 2) throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  const context = await authenticate(request);
  const id = rawId ? entityIdSchema.parse(rawId) : undefined;
  if (request.method === 'GET' && !id) {
    const filters = listEntitiesSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const includeArchived = filters.includeArchived === 'true';
    return success(
      resource === 'accounts'
        ? await entities.listAccounts(context, includeArchived)
        : await entities.listCategories(context, includeArchived),
      requestId,
    );
  }
  if (resource === 'accounts') {
    if (request.method === 'GET' && id)
      return success(await entities.getAccount(context, id), requestId);
    if (request.method === 'POST' && !id)
      return success(
        await entities.createAccount(context, request, await readBody(request, accountInputSchema)),
        requestId,
        201,
      );
    if (request.method === 'PATCH' && id)
      return success(
        await entities.updateAccount(
          context,
          request,
          id,
          await readBody(request, accountUpdateSchema),
        ),
        requestId,
      );
    if (request.method === 'DELETE' && id)
      return success(
        await entities.archiveAccount(
          context,
          request,
          id,
          (await readBody(request, archiveSchema)).version,
        ),
        requestId,
      );
  } else {
    if (request.method === 'POST' && !id)
      return success(
        await entities.createCategory(
          context,
          request,
          await readBody(request, categoryInputSchema),
        ),
        requestId,
        201,
      );
    if (request.method === 'PATCH' && id)
      return success(
        await entities.updateCategory(
          context,
          request,
          id,
          await readBody(request, categoryUpdateSchema),
        ),
        requestId,
      );
    if (request.method === 'DELETE' && id)
      return success(
        await entities.archiveCategory(
          context,
          request,
          id,
          (await readBody(request, archiveSchema)).version,
        ),
        requestId,
      );
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
}

export async function onboardingRoute(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/v1/onboarding/categories') return null;
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const context = await authenticate(request);
  await readBody(request, z.object({}).strict());
  return success(await entities.seedCategories(context, request), requestId);
}
