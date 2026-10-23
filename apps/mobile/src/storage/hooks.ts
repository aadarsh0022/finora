import { useQuery } from '@tanstack/react-query';
import { z, type ZodType } from 'zod';
import { useApp } from '../providers/app-provider';
import { queuedTransactionSchema } from './outbox';

export function useLocalRecords<T>(prefix: string, schema: ZodType<T>) {
  const { user, vault } = useApp();
  return useQuery({
    queryKey: [user?.id, 'local', prefix],
    enabled: !!user && !!vault,
    retry: false,
    queryFn: async () => (vault ? vault.list(prefix, schema) : []),
  });
}
export function usePendingTransactions() {
  return useLocalRecords('pending:', queuedTransactionSchema);
}
export const lastUsedSchema = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid().optional(),
  destinationAccountId: z.uuid().optional(),
});
