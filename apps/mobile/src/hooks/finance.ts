import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { type ZodType } from 'zod';
import { useApp } from '../providers/app-provider';
import { transactionInputSchema } from '@finora/contracts';
import { useNetworkState } from 'expo-network';
import { canUseOffline, enqueue } from '../storage/outbox';
import { refreshLocalReminders } from '../notifications/reminders';

export function useFinanceMutation<T>(
  path: string,
  schema: ZodType<T>,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  allowOfflineCreate = false,
) {
  const { api, user, vault, syncPending } = useApp();
  const network = useNetworkState();
  const queryClient = useQueryClient();
  const operation = useRef<{ body: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (body: unknown) => {
      const serialized = JSON.stringify(body);
      if (!operation.current || operation.current.body !== serialized)
        operation.current = { body: serialized, key: Crypto.randomUUID() };
      if (
        allowOfflineCreate &&
        method === 'POST' &&
        path === 'transactions' &&
        vault &&
        user &&
        vault.ownerId === user.id
      ) {
        const input = transactionInputSchema.parse(body);
        if (network.isConnected !== false) {
          try {
            return await api.request(path, schema, {
              method,
              body: input,
              operationKey: operation.current.key,
            });
          } catch (error) {
            if (!canUseOffline(error)) throw error;
          }
        }
        const queued = await enqueue(vault, operation.current.key, input);
        return schema.parse({
          ...input,
          id: queued.id,
          userId: user.id,
          currency: user.preferences.baseCurrency,
          version: 1,
          createdAt: queued.createdAt,
          updatedAt: queued.createdAt,
        });
      }
      return api.request(path, schema, { method, body, operationKey: operation.current.key });
    },
    onSuccess: async () => {
      operation.current = null;
      await queryClient.invalidateQueries({ queryKey: [user?.id] });
      if (network.isConnected && vault) void syncPending?.().catch(() => undefined);
      if (network.isConnected && vault && user)
        void refreshLocalReminders(vault, api, user).catch(() => undefined);
    },
  });
}
export function useUnsavedChanges(dirty: boolean) {
  const [enabled, setEnabled] = useState(true);
  const disablePrevention = usePreventRemove(enabled && dirty, ({ repeat }) =>
    Alert.alert('Discard unsaved changes?', 'Your changes have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setEnabled(false);
          repeat();
        },
      },
    ]),
  );
  return () => {
    setEnabled(false);
    disablePrevention();
  };
}
