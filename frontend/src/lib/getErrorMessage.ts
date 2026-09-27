import type { ApiError } from '@/types';

/** Pulls a human message out of an RTK Query error of any shape. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { data?: Partial<ApiError>; error?: string; status?: number | string };

    if (e.data?.message) return e.data.message;
    if (e.status === 'FETCH_ERROR') return 'Cannot reach the server. Check your connection.';
    if (e.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (e.error) return e.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
