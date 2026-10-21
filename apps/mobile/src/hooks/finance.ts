import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { type ZodType } from 'zod';
import { useApp } from '../providers/app-provider';

export function useFinanceMutation<T>(
  path: string,
  schema: ZodType<T>,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
) {
  const { api, user } = useApp();
  const queryClient = useQueryClient();
  const operation = useRef<{ body: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async (body: unknown) => {
      const serialized = JSON.stringify(body);
      if (!operation.current || operation.current.body !== serialized)
        operation.current = { body: serialized, key: Crypto.randomUUID() };
      return api.request(path, schema, { method, body, operationKey: operation.current.key });
    },
    onSuccess: async () => {
      operation.current = null;
      await queryClient.invalidateQueries({ queryKey: [user?.id] });
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
