/** Tests a user's Anthropic API key with one tiny request (costs a tiny fraction of a cent). */
import Anthropic from '@anthropic-ai/sdk';

export type CheckResult = {ok: true} | {ok: false; reason: string};

export async function testApiKey(apiKey: string): Promise<CheckResult> {
  const client = new Anthropic({apiKey, maxRetries: 1, timeout: 30_000});
  try {
    await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16,
      output_config: {effort: 'low'},
      messages: [{role: 'user', content: 'Reply with the word OK.'}],
    });
    return {ok: true};
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return {ok: false, reason: 'the key is not valid'};
    if (e instanceof Anthropic.PermissionDeniedError) return {ok: false, reason: 'this key has no access to Claude'};
    if (e instanceof Anthropic.RateLimitError) return {ok: true}; // the key works, it's just busy
    if (e instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(e.message)) return {ok: false, reason: 'no credit on this account, add some under Billing'};
    if (e instanceof Anthropic.APIError) return {ok: false, reason: `Anthropic said ${e.status ?? 'error'}`};
    return {ok: false, reason: 'could not reach Anthropic, try again'};
  }
}

export const looksLikeApiKey = (s: string) => /^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}$/.test(s.trim());
export const looksLikeOauthToken = (s: string) => /^sk-ant-oat\d{2}-[A-Za-z0-9_-]{20,}$/.test(s.trim());
