import { database } from '../../../src/database/client';
import { handle, success } from '../../../src/utils/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return handle(async (requestId) => {
    const { db } = await database();
    await db.command({ ping: 1 });
    return success({ status: 'ok' }, requestId);
  });
}
