import {afterEach, describe, expect, it, vi} from 'vitest';
import {setupTelegram} from '../studio/lib/telegram-setup.js';

const mockTelegram = (currentUrl: string) => {
  const calls: {method: string; body: any}[] = [];
  vi.stubGlobal('fetch', async (url: string, init: {body: string}) => {
    const method = url.split('/').pop()!;
    calls.push({method, body: JSON.parse(init.body)});
    return new Response(JSON.stringify({ok: true, result: method === 'getWebhookInfo' ? {url: currentUrl} : true}));
  });
  return calls;
};

describe('setupTelegram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sets the webhook with the secret when it points elsewhere', async () => {
    const calls = mockTelegram('');
    const r = await setupTelegram({token: 't', secret: 's', base: 'https://x.app'});
    expect(r).toEqual({setWebhook: 'ok', setMyCommands: 'ok', setChatMenuButton: 'ok'});
    const hook = calls.find((c) => c.method === 'setWebhook')!;
    expect(hook.body).toMatchObject({url: 'https://x.app/api/telegram', secret_token: 's'});
    expect(calls.find((c) => c.method === 'setChatMenuButton')!.body.menu_button.web_app.url).toBe('https://x.app/app/');
  });

  it('leaves a correct webhook alone unless forced', async () => {
    let calls = mockTelegram('https://x.app/api/telegram');
    expect((await setupTelegram({token: 't', secret: 's', base: 'https://x.app'})).setWebhook).toBe('already set');
    expect(calls.some((c) => c.method === 'setWebhook')).toBe(false);
    calls = mockTelegram('https://x.app/api/telegram');
    await setupTelegram({token: 't', secret: 's', base: 'https://x.app', force: true});
    expect(calls.some((c) => c.method === 'setWebhook')).toBe(true);
  });
});
