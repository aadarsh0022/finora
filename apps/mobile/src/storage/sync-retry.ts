import { ClientError } from '../api/client';
export const retryDelay = (attempt: number) =>
  Math.min(300000, 2000 * 2 ** Math.min(8, Math.max(0, attempt)));
export function shouldRetrySync(error: unknown) {
  return (
    error instanceof ClientError &&
    (['NETWORK', 'TIMEOUT'].includes(error.code) || error.status === 429 || error.status >= 500)
  );
}
