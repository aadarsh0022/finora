import { useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { backupSchema, type Backup } from '@finora/contracts';
import { AppButton, AppText, Card, Feedback, Field, Screen } from '../src/components/ui';
import { useApp } from '../src/providers/app-provider';

const countSchema = z.object({
  added: z.number().int(),
  unchanged: z.number().int(),
  conflicts: z.number().int(),
});
const countsSchema = z.record(z.string(), countSchema);
const previewSchema = z.object({
  counts: countsSchema,
  conflicts: z.number().int(),
  canImport: z.boolean(),
  previewId: z.uuid(),
  contentHash: z.string(),
  expiresAt: z.iso.datetime(),
  mode: z.literal('merge'),
});
type Preview = z.infer<typeof previewSchema>;

export default function BackupScreen() {
  const { api, user } = useApp();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [backup, setBackup] = useState<Backup | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  async function exportFile(kind: 'backup' | 'transactions') {
    setBusy(true);
    setError(null);
    setMessage('');
    let file: File | undefined;
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('File sharing is not available on this device.');
      const text = await api.download(`export/${kind}`);
      if (kind === 'backup') backupSchema.parse(JSON.parse(text));
      file = new File(
        Paths.cache,
        `finora-${Crypto.randomUUID()}.${kind === 'backup' ? 'json' : 'csv'}`,
      );
      file.create();
      file.write(text);
      await Sharing.shareAsync(file.uri, {
        mimeType: kind === 'backup' ? 'application/json' : 'text/csv',
        dialogTitle: 'Save your Walleto export',
      });
      setMessage('Export created and shared with the system. Save it in a private location.');
    } catch (failure) {
      setError(failure);
    } finally {
      if (file?.exists) file.delete();
      setBusy(false);
    }
  }
  async function pickBackup() {
    setBusy(true);
    setError(null);
    setMessage('');
    setPreview(null);
    setBackup(null);
    setConfirmation('');
    let file: File | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 2 * 1024 * 1024)
        throw new Error('Choose a backup smaller than 2 MiB.');
      file = new File(asset.uri);
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a backup smaller than 2 MiB.');
      const data = backupSchema.parse(JSON.parse(await file.text()));
      const resultPreview = await api.request('import/preview', previewSchema, {
        method: 'POST',
        body: { backup: data },
        operationKey: Crypto.randomUUID(),
      });
      setBackup(data);
      setPreview(resultPreview);
    } catch (failure) {
      setError(failure);
    } finally {
      if (file?.exists) file.delete();
      setBusy(false);
    }
  }
  async function importBackup() {
    if (!backup || !preview || confirmation !== 'IMPORT') return;
    setBusy(true);
    setError(null);
    try {
      // Deriving the operation key from the preview preserves it across a recoverable retry.
      await api.request(
        'import/commit',
        z.object({ imported: z.literal(true), counts: countsSchema }),
        {
          method: 'POST',
          operationKey: preview.previewId,
          body: {
            backup,
            previewId: preview.previewId,
            contentHash: preview.contentHash,
            mode: 'merge',
            confirmation: 'IMPORT',
          },
        },
      );
      await cache.invalidateQueries({ queryKey: [user?.id] });
      setBackup(null);
      setPreview(null);
      setConfirmation('');
      setMessage('Your backup has been merged. Existing records were preserved.');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Your records, with you"
      subtitle="Export a private copy or merge a Walleto backup."
    >
      <Card>
        <AppText style={{ fontFamily: 'DMSansBold' }}>Keep your files private</AppText>
        <AppText tone="muted">
          Exports contain unencrypted financial information. They exclude your password and session
          tokens. The app clears its temporary copies after sharing or previewing.
        </AppText>
        <AppButton
          title="Export transactions · CSV"
          loading={busy}
          onPress={() => {
            void exportFile('transactions');
          }}
        />
        <AppButton
          title="Export full backup · JSON"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            void exportFile('backup');
          }}
        />
      </Card>
      <Card>
        <AppText style={{ fontFamily: 'DMSansBold' }}>Restore without overwriting</AppText>
        <AppText tone="muted">
          Import validates references and previews changes. Existing conflicting records require
          review. Merge only; replacement is unavailable.
        </AppText>
        <AppButton
          title="Choose backup to preview"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            void pickBackup();
          }}
        />
      </Card>
      {preview && (
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>Import preview</AppText>
          {Object.entries(preview.counts).map(([name, count]) => (
            <AppText key={name}>
              {name}: {count.added} new · {count.unchanged} unchanged · {count.conflicts} conflicts
            </AppText>
          ))}
          <AppText tone="muted">
            Preview expires {new Date(preview.expiresAt).toLocaleTimeString()}. No records change
            until you confirm.
          </AppText>
          {preview.canImport ? (
            <>
              <Field
                label="Type IMPORT to confirm"
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
              />
              <AppButton
                title="Merge backup"
                disabled={confirmation !== 'IMPORT' || busy}
                loading={busy}
                onPress={() =>
                  Alert.alert(
                    'Merge this backup?',
                    'New records will be added to your account. Existing records are preserved.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Merge',
                        onPress: () => {
                          void importBackup();
                        },
                      },
                    ],
                  )
                }
              />
            </>
          ) : (
            <AppText tone="danger">
              This backup has conflicts. Resolve the source records and choose a corrected backup.
            </AppText>
          )}
        </Card>
      )}
      {!!error && <Feedback error={error} />}
      {!!message && (
        <AppText accessibilityRole="alert" tone="accent">
          {message}
        </AppText>
      )}
    </Screen>
  );
}
