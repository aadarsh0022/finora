import { dispatch } from '../../../../src/router';
import { after } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function route(request: Request) {
  return dispatch(request, after);
}
export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
export const PUT = route;
