/** A fake TikTok Open API for tests and the local simulation. Installs itself as globalThis.fetch for open.tiktokapis.com. */
export type FakeTikTokOptions = {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  followers?: number;
  privacyOptions?: string[];
  maxDurationSec?: number;
  /** Like an app TikTok has not audited yet: only SELF_ONLY posts are accepted. */
  unaudited?: boolean;
  /** Clock for create_time (tests move time forward). */
  now?: () => Date;
};

export class FakeTikTok {
  calls: {path: string; body: any; auth: string | null}[] = [];
  posts: {id: string; caption: string; privacy: string; is_aigc: boolean; create_time: number; views: number; likes: number; comments: number; shares: number}[] = [];
  followers: number;
  tokenCount = 0;
  revoked = 0;
  private publishes = new Map<string, {caption: string; privacy: string; is_aigc: boolean}>();
  private realFetch: typeof fetch | null = null;

  constructor(readonly opts: FakeTikTokOptions = {}) {
    this.followers = opts.followers ?? 120;
  }

  install() {
    this.realFetch = globalThis.fetch;
    const real = this.realFetch;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://open.tiktokapis.com/') || url.startsWith('https://upload.fake-tiktok/')) return this.handle(url, init);
      return real(input, init);
    }) as typeof fetch;
    return this;
  }

  uninstall() {
    if (this.realFetch) globalThis.fetch = this.realFetch;
  }

  private json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
  }

  private async handle(url: string, init?: RequestInit): Promise<Response> {
    const u = new URL(url);
    const raw = typeof init?.body === 'string' ? init.body : '';
    const body = raw.startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    this.calls.push({path: u.pathname, body, auth});
    const ok = (data: unknown) => this.json({data, error: {code: 'ok', message: '', log_id: 'fake'}});

    if (u.hostname === 'upload.fake-tiktok') return new Response('', {status: 201});
    switch (u.pathname) {
      case '/v2/oauth/token/': {
        if (body.grant_type === 'authorization_code' && body.code !== 'good-code') return this.json({error: 'invalid_grant', error_description: 'bad code'}, 400);
        this.tokenCount++;
        return this.json({
          open_id: 'open-fake-1',
          access_token: `act.fake${this.tokenCount}`,
          refresh_token: `rft.fake${this.tokenCount}`,
          expires_in: 86400,
          refresh_expires_in: 31536000,
          scope: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish',
          token_type: 'Bearer',
        });
      }
      case '/v2/oauth/revoke/':
        this.revoked++;
        return this.json({});
      case '/v2/user/info/':
        return ok({
          user: {
            open_id: 'open-fake-1',
            username: this.opts.username ?? 'nova.facts',
            display_name: this.opts.displayName ?? 'Nova Facts',
            avatar_url: this.opts.avatarUrl ?? 'https://example.com/avatar.jpg',
            follower_count: this.followers,
            following_count: 3,
            likes_count: this.posts.reduce((n, p) => n + p.likes, 0) + 40,
            video_count: this.posts.length,
          },
        });
      case '/v2/post/publish/creator_info/query/':
        return ok({
          creator_username: this.opts.username ?? 'nova.facts',
          creator_nickname: this.opts.displayName ?? 'Nova Facts',
          privacy_level_options: this.opts.privacyOptions ?? ['SELF_ONLY'],
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: false,
          max_video_post_duration_sec: this.opts.maxDurationSec ?? 600,
        });
      case '/v2/post/publish/video/init/': {
        // TikTok's chunk rules: count = floor(size / chunk), chunks 5-64 MB unless the whole file is under 5 MB.
        const si = body.source_info ?? {};
        const MB = 1024 * 1024;
        const chunkOk =
          si.total_chunk_count === Math.floor(si.video_size / si.chunk_size) &&
          (si.chunk_size === si.video_size ? si.video_size <= 64 * MB : si.chunk_size >= 5 * MB && si.chunk_size <= 64 * MB);
        if (!chunkOk) return this.json({error: {code: 'invalid_params', message: 'The chunk size is invalid', log_id: 'fake'}}, 400);
        if (this.opts.unaudited && body.post_info?.privacy_level !== 'SELF_ONLY')
          return this.json({error: {code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review our integration guidelines', log_id: 'fake'}}, 403);
        const id = `pub_${this.publishes.size + 1}`;
        this.publishes.set(id, {caption: body.post_info?.title ?? '', privacy: body.post_info?.privacy_level, is_aigc: body.post_info?.is_aigc === true});
        return ok({publish_id: id, upload_url: `https://upload.fake-tiktok/${id}`});
      }
      case '/v2/post/publish/status/fetch/': {
        const p = this.publishes.get(body.publish_id);
        if (!p) return this.json({error: {code: 'invalid_params', message: 'no such publish'}}, 400);
        const id = `7${String(4000000000000000000 + this.posts.length + 1)}`.slice(0, 19);
        if (!this.posts.some((x) => x.id === id)) {
          this.posts.push({id, caption: p.caption, privacy: p.privacy, is_aigc: p.is_aigc, create_time: Math.floor((this.opts.now?.() ?? new Date()).getTime() / 1000), views: 0, likes: 0, comments: 0, shares: 0});
        }
        // Like the real API: private posts don't get a public id.
        return ok({status: 'PUBLISH_COMPLETE', publicaly_available_post_id: p.privacy === 'SELF_ONLY' ? [] : [id]});
      }
      case '/v2/video/list/':
        return ok({videos: this.posts.map((p) => this.video(p)).reverse(), cursor: 0, has_more: false});
      case '/v2/video/query/': {
        const ids: string[] = body.filters?.video_ids ?? [];
        return ok({videos: this.posts.filter((p) => ids.includes(p.id)).map((p) => this.video(p))});
      }
      default:
        return this.json({error: {code: 'not_found', message: u.pathname}}, 404);
    }
  }

  private video(p: FakeTikTok['posts'][number]) {
    return {
      id: p.id,
      create_time: p.create_time,
      share_url: `https://www.tiktok.com/@${this.opts.username ?? 'nova.facts'}/video/${p.id}`,
      video_description: p.caption,
      title: p.caption.slice(0, 60),
      duration: 62,
      view_count: p.views,
      like_count: p.likes,
      comment_count: p.comments,
      share_count: p.shares,
    };
  }
}
