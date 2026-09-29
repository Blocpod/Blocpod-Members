import { createHash, timingSafeEqual } from 'node:crypto';

// Netlify's runtime environment API is preferred when present; Node local workers use process.env.
export function jobEnv(key: string) {
  const runtime = globalThis as typeof globalThis & {
    Netlify?: { env: { get(name: string): string | undefined } };
  };
  return runtime.Netlify?.env.get(key) ?? process.env[key];
}
export function authorizeJobRequest(request: Request) {
  const secret = jobEnv('JOBS_SECRET');
  if (!secret || secret.length < 32) return false;
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  const provided = createHash('sha256')
    .update(request.headers.get('authorization') || '')
    .digest();
  return timingSafeEqual(expected, provided);
}
export async function dispatchJobs() {
  if (jobEnv('NODE_ENV') !== 'production' && !jobEnv('NETLIFY'))
    return { dispatch: 'local' as const };
  const secret = jobEnv('JOBS_SECRET');
  if (!secret || secret.length < 32)
    throw new Error('Configure JOBS_SECRET with at least 32 random characters');
  const origin = jobEnv('URL') || jobEnv('APP_URL');
  if (!origin || !origin.startsWith('https://'))
    throw new Error(
      'An HTTPS site URL is required for background job dispatch',
    );
  const response = await fetch(
    new URL('/.netlify/functions/jobs-background', origin),
    {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status !== 202)
    throw new Error(
      `Background worker dispatch returned HTTP ${response.status}`,
    );
  return { dispatch: 'accepted' as const };
}
