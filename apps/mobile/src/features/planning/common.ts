import { Alert } from 'react-native';
import { z } from 'zod';

export const deletedSchema = z.object({ id: z.uuid(), deleted: z.literal(true) });
export function failureMessage(failure: unknown) {
  return failure instanceof z.ZodError
    ? failure.issues.map((issue) => issue.message).join('\n')
    : failure instanceof Error
      ? failure.message
      : 'Could not save your changes. Please retry.';
}
export function confirmDiscard(dirty: boolean, done: () => void) {
  if (dirty)
    Alert.alert('Discard changes?', 'Your changes have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: done },
    ]);
  else done();
}
export function confirmDelete(name: string, remove: () => void) {
  Alert.alert(`Delete ${name}?`, 'This permanently removes this record. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: remove },
  ]);
}
