import { z } from 'zod';
import {
  importCommitInputSchema,
  importPreviewInputSchema,
  transactionFilterSchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { ApiError, success } from '../../utils/http';
import {
  backupBodyLimit,
  commitImport,
  exportBackup,
  exportTransactions,
  previewImport,
} from './service';

async function readBackupBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new ApiError(415, 'JSON_REQUIRED', 'Send application/json.');
  if (
    request.headers.has('content-encoding') &&
    request.headers.get('content-encoding') !== 'identity'
  )
    throw new ApiError(415, 'ENCODING_UNSUPPORTED', 'Send an uncompressed JSON body.');
  if (Number(request.headers.get('content-length')) > backupBodyLimit)
    throw new ApiError(413, 'BODY_TOO_LARGE', 'The import exceeds 2 MiB.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > backupBodyLimit) {
      await reader.cancel();
      throw new ApiError(413, 'BODY_TOO_LARGE', 'The import exceeds 2 MiB.');
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Send valid JSON.');
  }
  return schema.parse(parsed);
}

export async function exportsRoute(request: Request, requestId: string): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/$/, '').split('/').slice(3);
  if (!['export', 'import'].includes(path[0] ?? '')) return null;
  const context = await authenticate(request);
  if (path.length !== 2) throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  if (path[0] === 'export' && ['transactions', 'backup'].includes(path[1] ?? '')) {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const headers = {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      'X-Content-Type-Options': 'nosniff',
    };
    if (path[1] === 'backup') {
      z.object({}).strict().parse(params);
      return new Response(JSON.stringify(await exportBackup(context)), {
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="finora-backup-v1.json"',
        },
      });
    }
    // CSV exports every match; pagination parameters would misleadingly imply a partial export.
    if ('page' in params || 'pageSize' in params)
      throw new ApiError(
        400,
        'INVALID_FILTER',
        'CSV exports all matching records; remove pagination.',
      );
    return new Response(await exportTransactions(context, transactionFilterSchema.parse(params)), {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="finora-transactions.csv"',
      },
    });
  }
  if (path[0] === 'import' && ['preview', 'commit'].includes(path[1] ?? '')) {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    if (path[1] === 'preview') {
      const input = await readBackupBody(request, importPreviewInputSchema);
      return success(await previewImport(context, request, input.backup), requestId);
    }
    return success(
      await commitImport(context, request, await readBackupBody(request, importCommitInputSchema)),
      requestId,
    );
  }
  throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
}
