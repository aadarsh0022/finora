import { z } from 'zod';
import {
  debtInputSchema,
  debtUpdateSchema,
  repaymentInputSchema,
  deleteRecordSchema,
  entityIdSchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import * as service from './service';

export async function debtsRoute(request: Request, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').split('/').slice(3);
  if (path[0] !== 'debts') return null;
  const context = await authenticate(request);
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  const id = path[1] ? entityIdSchema.parse(path[1]) : undefined;
  const result = (data: unknown, status = 200) => success(data, requestId, status);
  if (id && path.length === 3 && path[2] === 'cancel' && request.method === 'POST') {
    const input = await readBody(
      request,
      z
        .object({ version: z.number().int().positive(), confirmation: z.literal('CANCEL') })
        .strict(),
    );
    return result(await service.cancelDebt(context, request, id, input.version));
  }
  if (id && path[2] === 'repayments') {
    if (path.length === 3 && request.method === 'POST')
      return result(
        await service.repay(context, request, id, await readBody(request, repaymentInputSchema)),
        201,
      );
    if (path.length === 4 && request.method === 'DELETE')
      return result(
        await service.reverseRepayment(
          context,
          request,
          id,
          entityIdSchema.parse(path[3]),
          (await readBody(request, deleteRecordSchema)).version,
        ),
      );
  }
  if (path.length <= 2) {
    if (request.method === 'GET') {
      const records = await service.listDebts(context, id);
      return result(id ? records[0] : records);
    }
    if (!id && request.method === 'POST')
      return result(
        await service.createDebt(context, request, await readBody(request, debtInputSchema)),
        201,
      );
    if (id && request.method === 'PATCH')
      return result(
        await service.updateDebt(context, request, id, await readBody(request, debtUpdateSchema)),
      );
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This debt action is not supported.');
}
