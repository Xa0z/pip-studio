/** Settings from the environment. Never print values: some are secrets. */
export const need = (name: string): string => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing setting ${name}. Add it to Vercel env vars or GitHub Actions secrets.`);
  return v;
};

export const opt = (name: string, fallback = ''): string => process.env[name]?.trim() || fallback;

export const ownerId = () => Number(opt('OWNER_TELEGRAM_ID', '0'));

/** Public base URL of the Vercel app, e.g. https://pip-studio.vercel.app (no trailing slash). */
export const baseUrl = () => opt('PUBLIC_BASE_URL', process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000').replace(/\/$/, '');

export const MINUTES_LIMIT = () => Number(opt('ACTIONS_MINUTES_LIMIT', '1700'));
