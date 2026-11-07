import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApiError(415, 'JSON_REQUIRED', 'Send application/json.');
  const limit = 16384;
  if (Number(request.headers.get('content-length')) > limit)
    throw new ApiError(413, 'BODY_TOO_LARGE', 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON body is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, 'BODY_TOO_LARGE', 'Request is too large.');
    }
    chunks.push(value);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Send valid JSON.');
  }
  return schema.parse(value);
}

export function success(data: unknown, requestId: string, status = 200) {
  return Response.json(
    { success: true, data, meta: { requestId } },
    { status, headers: headers(requestId) },
  );
}
function headers(requestId: string) {
  return {
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    'X-Content-Type-Options': 'nosniff',
  };
}

// Server-Timing carries only the total handler time and whether this was the first request on a
// new server instance. It never includes data, identifiers or error details.
let served = false;
function timed(response: Response, started: number, cold: boolean) {
  try {
    response.headers.set(
      'Server-Timing',
      `app;dur=${Math.round(performance.now() - started)}${cold ? ', cold' : ''}`,
    );
  } catch {
    /* Immutable response headers: skip the timing rather than fail the request. */
  }
  return response;
}

export async function handle(action: (requestId: string) => Promise<Response>) {
  const requestId = randomUUID();
  const started = performance.now();
  const cold = !served;
  served = true;
  try {
    return timed(await action(requestId), started, cold);
  } catch (error) {
    let status = 503;
    let code = 'SERVICE_UNAVAILABLE';
    let message = 'The service is temporarily unavailable. Please retry.';
    let details: Record<string, string[]> | undefined;
    if (error instanceof ApiError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Check the highlighted fields.';
      details = {};
      for (const issue of error.issues) {
        const field = issue.path.join('.') || 'form';
        (details[field] ??= []).push(issue.message);
      }
    } else if (error instanceof MongoServerError && error.code === 11000) {
      status = 409;
      code = 'CONFLICT';
      message = 'A record already exists with these details.';
    } else {
      // Allowlisted metadata only: never serialize the error, request or body.
      console.error(JSON.stringify({ level: 'error', requestId, code }));
    }
    const responseHeaders: Record<string, string> = headers(requestId);
    if (status === 429) responseHeaders['Retry-After'] = '600';
    if (status === 401) responseHeaders['WWW-Authenticate'] = 'Bearer';
    return timed(
      Response.json(
        {
          success: false,
          error: { code, message, ...(details ? { details } : {}) },
          meta: { requestId },
        },
        { status, headers: responseHeaders },
      ),
      started,
      cold,
    );
  }
}
