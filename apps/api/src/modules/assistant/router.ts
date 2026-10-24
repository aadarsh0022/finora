import { z } from 'zod';
import {
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
import { database } from '../../database/client';

export async function assistantRoute(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const expanded = url.pathname.startsWith('/api/v1/assistant/v3/');
  const path = url.pathname.replace('/assistant/v3/', '/assistant/').replace(/\/$/, '');
  if (!path.startsWith('/api/v1/assistant/')) return null;
  const context = await authenticate(request);
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
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
          ? context.user.assistantConsentPolicy === assistantPolicyVersion
          : !!context.user.assistantConsentPolicy,
        readOnly: !expanded,
        provider: 'OpenAI',
        model: 'gpt-6-luna',
        policyVersion: expanded ? assistantPolicyVersion : '2026-10-23-v2',
      },
      requestId,
    );
  }
  if (path === '/api/v1/assistant/consent') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    const input = await readBody(
      request,
      z.union([
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
    const input = await readBody(
      request,
      expanded
        ? assistantChatInputSchema
        : z.union([legacyAssistantChatInputSchema, assistantChatInputSchema]),
    );
    if (!assistantEnabled())
      throw new ApiError(503, 'ASSISTANT_DISABLED', 'AI chat is not enabled yet.');
    await rateLimit(request, 'assistant-chat', context.user.id, 10);
    await reserveAssistantMessage(context);
    return success(await answerQuestion(context, input, request), requestId);
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
      { message: 'Report received. Thank you for helping improve Finora.' },
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
