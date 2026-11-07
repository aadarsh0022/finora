import { z } from 'zod';
import {
  archiveSchema,
  deleteRecordSchema,
  emiExtraPaymentInputSchema,
  emiIncomePeriodInputSchema,
  emiIncomePeriodUpdateSchema,
  emiLoanInputSchema,
  emiLoanUpdateSchema,
  emiPaymentInputSchema,
  entityIdSchema,
  monthKeySchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ApiError, readBody, success } from '../../utils/http';
import * as service from './service';

/**
 * /api/v1/emi
 *   GET                                     whole tracker
 *   POST   /loans                           add a loan
 *   PATCH  /loans/:id    DELETE /loans/:id  edit or remove a loan with its history
 *   POST   /loans/:id/payments/:month       mark a month paid (full EMI or an amount)
 *   DELETE /loans/:id/payments/:month       mark it unpaid again
 *   POST   /loans/:id/extra-payments        record a prepayment
 *   DELETE /extra-payments/:id              remove a prepayment
 *   POST   /income-periods                  add salary or extra income
 *   PATCH  /income-periods/:id  DELETE      edit or remove it
 */
export async function emiRoute(request: Request, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '').split('/').slice(3);
  if (path[0] !== 'emi') return null;
  const context = await authenticate(request);
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  const result = (data: unknown, status = 200) => success(data, requestId, status);
  const method = request.method;
  const [, section, rawId, part, rawMonth] = path;

  if (path.length === 1 && method === 'GET') return result(await service.emiOverview(context));

  if (section === 'loans') {
    if (path.length === 2 && method === 'POST')
      return result(
        await service.createLoan(context, request, await readBody(request, emiLoanInputSchema)),
        201,
      );
    const id = rawId ? entityIdSchema.parse(rawId) : undefined;
    if (id && path.length === 3 && method === 'PATCH')
      return result(
        await service.updateLoan(
          context,
          request,
          id,
          await readBody(request, emiLoanUpdateSchema),
        ),
      );
    if (id && path.length === 3 && method === 'DELETE')
      return result(
        await service.deleteLoan(
          context,
          request,
          id,
          (await readBody(request, deleteRecordSchema)).version,
        ),
      );
    if (id && part === 'payments' && rawMonth && path.length === 5) {
      const month = monthKeySchema.parse(rawMonth);
      if (method === 'POST')
        return result(
          await service.setPayment(
            context,
            request,
            id,
            month,
            await readBody(request, emiPaymentInputSchema),
          ),
        );
      if (method === 'DELETE')
        return result(await service.clearPayment(context, request, id, month));
    }
    if (id && part === 'extra-payments' && path.length === 4 && method === 'POST')
      return result(
        await service.addExtraPayment(
          context,
          request,
          id,
          await readBody(request, emiExtraPaymentInputSchema),
        ),
        201,
      );
  }

  if (section === 'extra-payments' && rawId && path.length === 3 && method === 'DELETE')
    return result(
      await service.deleteExtraPayment(
        context,
        request,
        entityIdSchema.parse(rawId),
        (await readBody(request, archiveSchema)).version,
      ),
    );

  if (section === 'income-periods') {
    if (path.length === 2 && method === 'POST')
      return result(
        await service.createIncomePeriod(
          context,
          request,
          await readBody(request, emiIncomePeriodInputSchema),
        ),
        201,
      );
    const id = rawId ? entityIdSchema.parse(rawId) : undefined;
    if (id && path.length === 3 && method === 'PATCH')
      return result(
        await service.updateIncomePeriod(
          context,
          request,
          id,
          await readBody(request, emiIncomePeriodUpdateSchema),
        ),
      );
    if (id && path.length === 3 && method === 'DELETE')
      return result(
        await service.deleteIncomePeriod(
          context,
          request,
          id,
          (await readBody(request, archiveSchema)).version,
        ),
      );
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This loan tracker action is not supported.');
}
