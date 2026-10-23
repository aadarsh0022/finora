import { z } from 'zod';
import {
  assistantToolCallSchema,
  assistantChatInputSchema,
  assistantFeedbackInputSchema,
  assistantPolicyVersion,
} from '@finora/contracts';
import { authenticate } from '../auth/service';
import { rateLimit } from '../../security/rate-limit';
import { ApiError, readBody, success } from '../../utils/http';
import { readOnlyToolDefinitions, runReadOnlyTool } from './tools';
import { assistantEnabled } from './provider';
import { answerQuestion } from './chat';
import { database } from '../../database/client';

export async function assistantRoute(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (!path.startsWith('/api/v1/assistant/')) return null;
  const context = await authenticate(request);
  z.object({}).strict().parse(Object.fromEntries(url.searchParams));
  if (path === '/api/v1/assistant/capabilities') {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return success(
      {
        enabled: assistantEnabled(),
        readOnly: true,
        provider: 'OpenAI',
        model: 'gpt-6-luna',
        policyVersion: assistantPolicyVersion,
      },
      requestId,
    );
  }
  if (path === '/api/v1/assistant/chat') {
    if (request.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    const input = await readBody(request, assistantChatInputSchema);
    await rateLimit(request, 'assistant-chat', context.user.id, 10);
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
    return success({ readOnly: true, tools: readOnlyToolDefinitions }, requestId);
  const call = await readBody(request, assistantToolCallSchema);
  return success(await runReadOnlyTool(context, call), requestId);
}
