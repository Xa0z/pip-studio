/** Errors in plain words, for the bot's failure messages and the video cards. */

/** TikTok's error codes in plain words, so the user knows what to change. */
const TIKTOK_REASONS: [RegExp, string][] = [
  [/spam_risk_too_many_posts|too_many_posts/i, 'TikTok says this account posted too many times today. I will try again if you tap Retry later.'],
  [/spam_risk_too_many_pending_share|too_many_pending/i, 'TikTok has too many uploads waiting on this account. Open TikTok, finish or delete pending drafts, then tap Retry.'],
  [/spam_risk_user_banned|user_banned/i, 'TikTok has blocked posting from this account for now.'],
  // TikTok sends this even for "Only me" posts when the TikTok account itself is public.
  [/unaudited_client/i, 'TikTok only lets apps it has not approved yet post to private accounts, and this TikTok account is public. In the TikTok app open Profile > ☰ > Settings and privacy > Privacy, turn on Private account, then tap Retry.'],
  [/privacy_level_option_mismatch/i, 'TikTok did not accept the privacy setting. Pick another one and tap Retry.'],
  [/access_token_invalid|scope_not_authorized|token_expired/i, 'the TikTok login stopped working. Connect TikTok again with /start.'],
  [/duration_check|duration/i, 'TikTok did not accept the video length.'],
  [/file_format_check|frame_rate_check|picture_size_check|video_pull|download/i, 'TikTok could not read the video file.'],
  [/did not finish in 10 minutes/i, 'TikTok took too long to process the video.'],
  [/invalid_params/i, 'TikTok rejected the upload settings.'],
];

function tiktokReason(err: string): string {
  const code = /(?:TikTok publish failed: |: )([a-z_]{6,})/i.exec(err)?.[1];
  const known = TIKTOK_REASONS.find(([re]) => re.test(err))?.[1];
  return `${known ?? 'TikTok refused the upload.'}${code && !known ? ` (TikTok said: ${code})` : ''}${known ? '' : ' I will try again if you tap Retry.'}`;
}

/** Claude refused the login itself, so a retry cannot help: the user has to connect Claude again. */
export const claudeAccessProblem = (err: string) =>
  !/tiktok/i.test(err) && /subscription access|Claude is not connected|credit|billing|401|authentication|invalid x-api-key|token was rejected/i.test(err);

/** Turns an internal error into one short sentence a user can act on. */
export function plainReason(err: string): string {
  if (/disabled Claude subscription access|subscription access/i.test(err))
    return 'Anthropic no longer lets this Claude login run Claude Code (the organization behind the account turned it off). Connect Claude again with a token from a personal Pro or Max plan, or with an API key.';
  if (/TikTok allows only/i.test(err)) return err.replace(/^.*?(TikTok allows only[^.]*).*$/s, '$1.');
  if (/tiktok|spam_risk|rate_limit|unaudited|chunk|post init|publish/i.test(err)) return tiktokReason(err);
  if (/Claude is not connected/i.test(err)) return 'Claude is not connected.';
  if (/credit|billing|balance/i.test(err)) return 'your Anthropic account is out of credit.';
  if (/401|authentication|invalid x-api-key|token was rejected/i.test(err)) return 'your Claude key or token stopped working.';
  if (/plan|Claude could not/i.test(err)) return 'Claude could not write a good script this time.';
  if (/Duration check|render/i.test(err)) return 'the video did not render correctly.';
  return 'something went wrong on my side.';
}
