import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { type ZodType } from 'zod';
import {
  emiOverviewSchema,
  type EmiExtraPaymentDto,
  type EmiIncomePeriodDto,
  type EmiLoanDto,
  type EmiPaymentDto,
} from '@finora/contracts';
import {
  getCurrentMonthKey,
  type EmiDebt,
  type EmiExtraPayment,
  type EmiIncomePeriod,
  type EmiPayment,
} from '@finora/finance-core';
import { useApp } from '../../providers/app-provider';
import { useRead } from '../finance/shared';

export const toDebt = (loan: EmiLoanDto): EmiDebt => ({
  id: loan.id,
  name: loan.name,
  monthlyAmount: BigInt(loan.monthlyAmountMinor),
  startMonth: loan.startMonth,
  endMonth: loan.endMonth,
  dueDay: loan.dueDay,
  isActive: loan.isActive,
  loanTag: loan.loanTag,
  interestRatePct: loan.interestRatePct,
  principalRemaining:
    loan.principalRemainingMinor === null ? null : BigInt(loan.principalRemainingMinor),
  principalAsOf: loan.principalAsOf,
});
export const toPayment = (payment: EmiPaymentDto): EmiPayment => ({
  debtId: payment.loanId,
  monthKey: payment.monthKey,
  amountDue: BigInt(payment.amountDueMinor),
  amountPaid: BigInt(payment.amountPaidMinor),
  paid: payment.paid,
  paidAt: payment.paidAt,
});
export const toExtra = (extra: EmiExtraPaymentDto): EmiExtraPayment => ({
  id: extra.id,
  debtId: extra.loanId,
  amount: BigInt(extra.amountMinor),
  dateIso: extra.date,
  note: extra.note,
});
export const toIncome = (period: EmiIncomePeriodDto): EmiIncomePeriod => ({
  id: period.id,
  kind: period.kind,
  amount: BigInt(period.amountMinor),
  startMonth: period.startMonth,
  endMonth: period.endMonth,
  note: period.note,
});

/** The whole tracker, read like every other screen (cached on the device) and converted for the engine. */
export function useLoans() {
  const { user } = useApp();
  const read = useRead('emi', emiOverviewSchema);
  const month = getCurrentMonthKey(user?.preferences.timezone ?? 'Asia/Kolkata');
  const state = useMemo(() => {
    const data = read.data;
    return {
      loans: data?.loans ?? [],
      rawPayments: data?.payments ?? [],
      rawExtras: data?.extraPayments ?? [],
      rawIncomes: data?.incomePeriods ?? [],
      debts: (data?.loans ?? []).map(toDebt),
      payments: (data?.payments ?? []).map(toPayment),
      extras: (data?.extraPayments ?? []).map(toExtra),
      incomes: (data?.incomePeriods ?? []).map(toIncome),
    };
  }, [read.data]);
  return { read, month, ...state };
}

/** One authenticated write with a fresh operation key; refreshes everything afterwards. */
export function useEmiWrite() {
  const { api, user } = useApp();
  const client = useQueryClient();
  return async function write<T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    schema: ZodType<T>,
    body: unknown,
  ) {
    const result = await api.request(path, schema, {
      method,
      body,
      operationKey: Crypto.randomUUID(),
    });
    await client.invalidateQueries({ queryKey: [user?.id] }).catch(() => undefined);
    return result;
  };
}
