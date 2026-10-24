import {
  onboardingSyncSchema,
  accountInputSchema,
  accountUpdateSchema,
  archiveSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  entityIdSchema,
  listEntitiesSchema,
  transactionFilterSchema,
  transactionInputSchema,
  transactionUpdateSchema,
  deleteRecordSchema,
  settingsUpdateSchema,
} from '@finora/contracts';
import { z } from 'zod';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import * as entities from './entities';
import * as ledger from './ledger';
import { getSettings, updateSettings } from './settings';
import { completeOnboarding, syncOnboarding } from './onboarding';

export async function financeRoute(request: Request, requestId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, '').split('/').slice(3);
  const [resource, rawId] = path;
  if (!['accounts', 'categories', 'transactions', 'reports', 'settings'].includes(resource ?? ''))
    return null;
  if (path.length > 2) throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  const context = await authenticate(request);
  if (resource === 'settings' && !rawId) {
    if (request.method === 'GET') return success(getSettings(context), requestId);
    if (request.method === 'PATCH')
      return success(
        await updateSettings(context, request, await readBody(request, settingsUpdateSchema)),
        requestId,
      );
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
  }
  if (resource === 'reports') {
    if (rawId !== 'overview') throw new ApiError(404, 'NOT_FOUND', 'This report does not exist.');
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    const input = z
      .object({
        month: z
          .string()
          .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
          .optional(),
      })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return success(await ledger.overview(context, input.month), requestId);
  }
  const id = rawId ? entityIdSchema.parse(rawId) : undefined;
  if (resource === 'transactions') {
    if (request.method === 'GET' && !id)
      return success(
        await ledger.listTransactions(
          context,
          transactionFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
        ),
        requestId,
      );
    if (request.method === 'GET' && id)
      return success(await ledger.getTransaction(context, id), requestId);
    if (request.method === 'POST' && !id)
      return success(
        await ledger.createTransaction(
          context,
          request,
          await readBody(request, transactionInputSchema),
        ),
        requestId,
        201,
      );
    if (request.method === 'PATCH' && id)
      return success(
        await ledger.updateTransaction(
          context,
          request,
          id,
          await readBody(request, transactionUpdateSchema),
        ),
        requestId,
      );
    if (request.method === 'DELETE' && id)
      return success(
        await ledger.deleteTransaction(
          context,
          request,
          id,
          (await readBody(request, deleteRecordSchema)).version,
        ),
        requestId,
      );
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported.');
  }
  if (request.method === 'GET' && !id) {
    const filters = listEntitiesSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const includeArchived = filters.includeArchived === 'true';
    return success(
      resource === 'accounts'
        ? (await ledger.ledgerSnapshot(context)).accounts.filter(
            (account) => includeArchived || !account.archived,
          )
        : await entities.listCategories(context, includeArchived),
      requestId,
    );
  }
  if (resource === 'accounts') {
    if (request.method === 'GET' && id) {
      const account = (await ledger.ledgerSnapshot(context)).accounts.find(
        (item) => item.id === id,
      );
      if (!account) throw new ApiError(404, 'NOT_FOUND', 'This record was not found.');
      return success(account, requestId);
    }
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
  const path = new URL(request.url).pathname;
  if (
    ![
      '/api/v1/onboarding/categories',
      '/api/v1/onboarding/complete',
      '/api/v1/onboarding/sync',
    ].includes(path)
  )
    return null;
  if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const context = await authenticate(request);
  if (path.endsWith('/sync'))
    return success(
      await syncOnboarding(context, request, await readBody(request, onboardingSyncSchema)),
      requestId,
    );
  await readBody(request, z.object({}).strict());
  if (path.endsWith('/complete'))
    return success(await completeOnboarding(context, request), requestId);
  return success(await entities.seedCategories(context, request), requestId);
}
