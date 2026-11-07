import { z } from 'zod';
import {
  conversationSendSchema,
  assistantServerPolicyVersion,
  legacyAssistantChatInputSchema,
  assistantChangeArgsSchema,
  assistantConfirmInputSchema,
  assistantToolCallSchema,
  assistantChatInputSchema,
  assistantFeedbackInputSchema,
  assistantPolicyVersion,
  assistantConsentInputSchema,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { rateLimit } from '../../security/rate-limit';
import { ApiError, readBody, success } from '../../utils/http';
import { readOnlyToolDefinitions, runReadOnlyTool } from './tools';
import { assistantEnabled } from './provider';
import { answerQuestion } from './chat';
import { prepareChange, confirmChange } from './changes';
import { getAssistantUsage, reserveAssistantMessage } from './usage';
import { conversationRoute, openConversation } from './conversations';
import { database } from '../../database/client';

export async function assistantRoute(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const serverHistory = url.pathname.startsWith('/api/v1/assistant/v4/');
  const expanded = serverHistory || url.pathname.startsWith('/api/v1/assistant/v3/');
  const path = url.pathname
    .replace('/assistant/v4/', '/assistant/')
    .replace('/assistant/v3/', '/assistant/')
    .replace(/\/$/, '');
  if (!path.startsWith('/api/v1/assistant/')) return null;
  const context = await authenticate(request);
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  if (serverHistory) {
    const response = await conversationRoute(request, context, requestId);
    if (response) return response;
  }
  if (
    path === '/api/v1/assistant/changes/prepare' ||
    path === '/api/v1/assistant/changes/confirm'
  ) {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    await rateLimit(request, 'assistant-change-review', context.user.id, 60);
    if (path.endsWith('/prepare'))
      return success(
        await prepareChange(context, await readBody(request, assistantChangeArgsSchema)),
        requestId,
      );
    const input = await readBody(request, assistantConfirmInputSchema);
    const result = await confirmChange(context, request, input.token);
    return result instanceof Response ? result : success(result, requestId);
  }
  if (path === '/api/v1/assistant/usage') {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return success(await getAssistantUsage(context), requestId);
  }
  if (path === '/api/v1/assistant/capabilities') {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return success(
      {
        enabled: assistantEnabled(),
        remembersConsent: true,
        consentAccepted: expanded
          ? context.user.assistantConsentPolicy ===
            (serverHistory ? assistantServerPolicyVersion : assistantPolicyVersion)
          : !!context.user.assistantConsentPolicy,
        readOnly: !expanded,
        provider: 'OpenAI',
        model: 'gpt-6-luna',
        policyVersion: serverHistory
          ? assistantServerPolicyVersion
          : expanded
            ? assistantPolicyVersion
            : '2026-10-23-v2',
      },
      requestId,
    );
  }
  if (path === '/api/v1/assistant/consent') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    const input = await readBody(
      request,
      z.union([
        z.object({ policyVersion: z.literal(assistantServerPolicyVersion) }).strict(),
        assistantConsentInputSchema,
        z.object({ policyVersion: z.literal('2026-10-23-v2') }).strict(),
      ]),
    );
    await rateLimit(request, 'assistant-consent', context.user.id, 10);
    const { users } = await database();
    await users.updateOne(
      { id: context.user.id },
      { $set: { assistantConsentPolicy: input.policyVersion } },
    );
    return success({ message: 'AI preference saved.' }, requestId);
  }
  if (path === '/api/v1/assistant/chat') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    if (!assistantEnabled())
      throw new ApiError(503, 'ASSISTANT_DISABLED', 'AI chat is not enabled yet.');
    await rateLimit(request, 'assistant-chat', context.user.id, 10);
    const conversation = serverHistory
      ? await openConversation(context, await readBody(request, conversationSendSchema))
      : undefined;
    if (conversation && 'cached' in conversation) return success(conversation.cached, requestId);
    const input =
      conversation?.input ??
      (await readBody(
        request,
        expanded
          ? assistantChatInputSchema
          : z.union([legacyAssistantChatInputSchema, assistantChatInputSchema]),
      ));
    try {
      await reserveAssistantMessage(context);
    } catch (failure) {
      await conversation?.release?.();
      throw failure;
    }
    if (!expanded || !request.headers.get('accept')?.includes('application/x-ndjson')) {
      try {
        const answer = await answerQuestion(context, input, request, undefined, serverHistory);
        await conversation?.finish?.(answer);
        return success(answer, requestId);
      } finally {
        await conversation?.release?.();
      }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    const activeRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      signal: controller.signal,
    });
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(output) {
        const emit = (event: unknown) => {
          if (!closed && !controller.signal.aborted)
            output.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const answer = await answerQuestion(
            context,
            input,
            activeRequest,
            (progress) => emit({ type: 'progress', progress }),
            true,
          );
          await conversation?.finish?.(answer);
          emit({ type: 'answer', answer });
        } catch (error) {
          emit({
            type: 'error',
            code: error instanceof ApiError ? error.code : 'ASSISTANT_UNAVAILABLE',
            message:
              error instanceof ApiError
                ? error.message
                : 'I couldn’t finish that reply. Please try again.',
            status: error instanceof ApiError ? error.status : 503,
          });
        } finally {
          await conversation?.release?.();
          request.signal.removeEventListener('abort', abort);
          if (!closed) {
            closed = true;
            output.close();
          }
        }
      },
      cancel() {
        closed = true;
        controller.abort();
        request.signal.removeEventListener('abort', abort);
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Request-Id': requestId,
      },
    });
  }
  if (path === '/api/v1/assistant/feedback') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    const input = await readBody(request, assistantFeedbackInputSchema);
    await rateLimit(request, 'assistant-feedback', context.user.id, 10);
    const { db } = await database();
    const createdAt = new Date();
    await db.collection('assistant_feedback').updateOne(
      { userId: context.user.id, answerId: input.answerId },
      {
        $set: { reason: input.reason },
        $setOnInsert: { createdAt, expiresAt: new Date(createdAt.getTime() + 30 * 86400000) },
      },
      { upsert: true },
    );
    return success(
      { message: 'Report received. Thank you for helping improve Walleto.' },
      requestId,
    );
  }
  if (path !== '/api/v1/assistant/tools' && path !== '/api/v1/assistant/tools/run')
    throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  const method = path.endsWith('/run') ? 'POST' : 'GET';
  if (request.method !== method) throw new ApiError(405, 'METHOD_NOT_ALLOWED', `Use ${method}.`);
  await rateLimit(request, 'assistant-read-tools', context.user.id, 30);
  if (method === 'GET')
    return success(
      {
        readOnly: true,
        tools: readOnlyToolDefinitions.filter(
          (tool) => expanded || !['read_records', 'plan_finances'].includes(tool.name),
        ),
      },
      requestId,
    );
  const call = await readBody(request, assistantToolCallSchema);
  return success(await runReadOnlyTool(context, call), requestId);
}
