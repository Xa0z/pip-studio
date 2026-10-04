import {log} from './log.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
  }
}

/** Runs fn, retrying up to `retries` times with exponential backoff on retryable errors. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3, baseMs = 2000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof HttpError ? err.retryable : isNetworkError(err);
      if (!retryable || attempt >= retries) throw err;
      const wait = baseMs * 2 ** attempt;
      log.warn(`${label} failed (${(err as Error).message}). Retry ${attempt + 1}/${retries} in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

const isNetworkError = (err: unknown) =>
  err instanceof TypeError || /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i.test(String((err as Error)?.message));

export const isRetryableStatus = (s: number) => s === 429 || s === 408 || s >= 500;

export const env = (name: string, fallback?: string): string => {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing setting ${name}. Add it to .env (local) or GitHub Actions secrets.`);
};

export const isDryRun = () => /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');
