/** Registers the webhook, the command list and the Dashboard menu button with Telegram. Never returns the token. */
export const COMMANDS = [
  {command: 'menu', description: '🏠 Main menu'},
  {command: 'videos', description: '🎬 My videos'},
  {command: 'mode', description: '✋ Full auto or review first'},
  {command: 'stats', description: '📈 Today and 30 days'},
  {command: 'top', description: '🏆 Best videos'},
  {command: 'report', description: '🗒 Weekly report'},
  {command: 'dashboard', description: '📊 Full analytics'},
  {command: 'settings', description: '⚙️ Niche, goal, schedule, theme'},
  {command: 'marketing', description: '📣 Videos for your business'},
  {command: 'pause', description: '⏸ Stop posting'},
  {command: 'resume', description: '▶️ Start posting again'},
  {command: 'start', description: 'Set up or continue'},
  {command: 'help', description: 'All commands'},
  {command: 'disconnect', description: 'Delete my data'},
];

export type SetupResult = Record<string, string>;

export async function setupTelegram(opts: {token: string; secret: string; base: string; force?: boolean}): Promise<SetupResult> {
  const call = async (method: string, body?: unknown) => {
    const res = await fetch(`https://api.telegram.org/bot${opts.token}/${method}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body ?? {}),
    });
    return (await res.json()) as {ok: boolean; description?: string; result?: {url?: string}};
  };
  const status = (r: {ok: boolean; description?: string}) => (r.ok ? 'ok' : `FAILED ${r.description ?? ''}`.trim());
  const url = `${opts.base}/api/telegram`;
  const out: SetupResult = {};

  const info = await call('getWebhookInfo');
  if (!opts.force && info.ok && info.result?.url === url) out.setWebhook = 'already set';
  else out.setWebhook = status(await call('setWebhook', {url, secret_token: opts.secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true}));
  out.setMyCommands = status(await call('setMyCommands', {commands: COMMANDS}));
  out.setChatMenuButton = status(await call('setChatMenuButton', {menu_button: {type: 'web_app', text: 'Dashboard', web_app: {url: `${opts.base}/app/`}}}));
  return out;
}
