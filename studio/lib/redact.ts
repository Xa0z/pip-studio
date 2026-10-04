/** Removes tokens and keys from any text before it is logged or saved. */
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic API keys and Claude Code OAuth tokens (sk-ant-oat01-...)
  /\b(act|rft|clt)\.[A-Za-z0-9._-]{10,}/g, // TikTok access / refresh / client tokens
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bbot\d{6,}:[A-Za-z0-9_-]{30,}/g, // Telegram bot token inside URLs
  /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, // bare Telegram bot token
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs (Supabase keys)
  /\bv1\.[A-Za-z0-9_-]{40,}/g, // our own ciphertext
  /([?&](?:code|access_token|refresh_token|client_secret)=)[^&\s]+/gi,
];

const SECRET_ENV = ['MASTER_ENCRYPTION_KEY', 'TELEGRAM_BOT_TOKEN', 'TIKTOK_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'GH_DISPATCH_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];
const extra = new Set<string>();

/** Registers a secret value (e.g. a decrypted token) so it is masked everywhere. */
export const addSecret = (v: string | undefined | null) => {
  if (v && v.length >= 8) extra.add(v);
};

export function redact(text: unknown): string {
  let s = typeof text === 'string' ? text : text instanceof Error ? `${text.message}` : JSON.stringify(text);
  for (const name of SECRET_ENV) {
    const v = process.env[name];
    if (v && v.length >= 8) s = s.split(v).join(`[${name}]`);
  }
  for (const v of extra) s = s.split(v).join('[secret]');
  for (const p of PATTERNS) s = s.replace(p, (m, g1) => (typeof g1 === 'string' && m.startsWith(g1) ? `${g1}[redacted]` : '[redacted]'));
  return s;
}

/** Wraps console so nothing printed by the worker can leak a secret into GitHub Actions logs. */
export function guardConsole() {
  for (const k of ['log', 'info', 'warn', 'error'] as const) {
    const orig = console[k].bind(console);
    console[k] = (...args: unknown[]) => orig(...args.map((a) => (typeof a === 'string' ? redact(a) : a instanceof Error ? redact(a.stack ?? a.message) : a)));
  }
}
