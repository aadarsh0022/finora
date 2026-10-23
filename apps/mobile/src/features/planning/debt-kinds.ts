import type { Debt } from '@finora/contracts';
export const debtKinds: Record<Debt['kind'], string> = {
  PERSONAL_LOAN: 'Money lent',
  REFUND: 'Refund',
  DEPOSIT: 'Refundable deposit',
  REIMBURSEMENT: 'Reimbursement',
};
