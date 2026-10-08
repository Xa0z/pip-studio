import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {fakeRenderer, Harness, runOnboarding} from '../studio/dev/harness';
import {studioPlanSchema} from '../studio/lib/plan-schema';
import {planAnswer} from '../studio/dev/fixtures';
import {creditFor, findMedia, safeQuery, searchOpenverse, searchPexels, type MediaHit} from '../studio/worker/media';

const OWNER = 5550001;

/** A fake fetch that answers by host and remembers every URL it was asked for. */
function fakeFetch(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(answers).find((k) => url.includes(k));
    if (!key) return new Response('nope', {status: 404});
    return new Response(JSON.stringify(answers[key]), {status: 200, headers: {'content-type': 'application/json'}});
  }) as typeof fetch;
  return {fetcher, calls};
}

const openverse = {
  results: [
    {id: 'a', license: 'by', url: 'https://img.example/a.jpg', foreign_landing_url: 'https://ov/a', creator: 'A', width: 2000, height: 3000},
    {id: 'b', license: 'cc0', url: 'https://img.example/b.jpg', foreign_landing_url: 'https://ov/b', creator: 'B', width: 400, height: 600},
    {id: 'c', license: 'pdm', url: 'https://img.example/c.jpg', foreign_landing_url: 'https://ov/c', creator: 'C', width: 1600, height: 1200},
    {id: 'd', license: 'cc0', url: 'https://img.example/d.jpg', foreign_landing_url: 'https://ov/d', creator: 'D', width: 1200, height: 1800},
  ],
};

describe('free media library', () => {
  it('keeps brand and famous-character searches out', () => {
    expect(safeQuery('Fresh coffee beans!')).toBe('fresh coffee beans');
    expect(safeQuery('nike running shoes')).toBeNull();
    expect(safeQuery('Mickey Mouse ears')).toBeNull();
    expect(safeQuery('x')).toBeNull();
  });

  it('takes only CC0 and public-domain Openverse photos that are big enough', async () => {
    const {fetcher, calls} = fakeFetch({'api.openverse.org': openverse});
    const hits = await searchOpenverse('ocean waves', fetcher);
    expect(hits.map((h) => h.id)).toEqual(['c', 'd']);
    expect(calls[0]).toContain('license=cc0,pdm');
    expect(calls[0]).toContain('mature=false');
  });

  it('picks the Pexels clip file closest to 1080 wide', async () => {
    const {fetcher} = fakeFetch({
      'api.pexels.com/videos': {
        videos: [
          {
            id: 7,
            url: 'https://www.pexels.com/video/7',
            duration: 12,
            user: {name: 'Sam'},
            video_files: [
              {file_type: 'video/mp4', width: 2160, height: 3840, link: 'https://v/4k.mp4'},
              {file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://v/hd.mp4'},
              {file_type: 'video/mp4', width: 360, height: 640, link: 'https://v/sd.mp4'},
            ],
          },
          {id: 8, url: 'https://www.pexels.com/video/8', duration: 9, video_files: [{file_type: 'video/mp4', width: 240, height: 426, link: 'https://v/tiny.mp4'}]},
        ],
      },
    });
    const hits = await searchPexels('rain', 'clip', 'key', fetcher);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({url: 'https://v/hd.mp4', seconds: 12, author: 'Sam', kind: 'clip'});
  });

  it('falls back to a free photo when a clip is wanted but there is no key', async () => {
    const {fetcher, calls} = fakeFetch({'api.openverse.org': openverse});
    const hit = await findMedia({kind: 'clip', query: 'ocean waves'}, {}, {fetcher});
    expect(hit).toMatchObject({source: 'openverse', kind: 'photo', id: 'd'}); // the tall one wins
    expect(calls.every((u) => u.includes('openverse'))).toBe(true);
    expect(creditFor(hit!)).toBe('Photo by D on Openverse (CC0): https://ov/d');
  });

  it('never picks the same file twice in one video, and skips clips that are too short', async () => {
    const {fetcher} = fakeFetch({'api.openverse.org': openverse});
    const used = new Set<string>();
    const a = await findMedia({kind: 'photo', query: 'ocean'}, {}, {fetcher, used});
    const b = await findMedia({kind: 'photo', query: 'ocean'}, {}, {fetcher, used});
    const c = await findMedia({kind: 'photo', query: 'ocean'}, {}, {fetcher, used});
    expect([a?.id, b?.id]).toEqual(['d', 'c']);
    expect(c).toBeNull();

    const short = fakeFetch({
      'api.pexels.com/videos': {videos: [{id: 1, url: 'https://p/1', duration: 2, video_files: [{file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://v/1.mp4'}]}]},
      'api.pexels.com/v1': {photos: [{id: 2, url: 'https://p/2', photographer: 'P', width: 1000, height: 1500, src: {large2x: 'https://i/2.jpg'}}]},
    });
    const hit = await findMedia({kind: 'clip', query: 'rain'}, {pexels: 'k'}, {fetcher: short.fetcher, minSeconds: 4});
    expect(hit).toMatchObject({source: 'pexels', kind: 'photo', id: '2'});
  });

  it('does not let a script choose its own file, and allows at most two media scenes', () => {
    const schema = studioPlanSchema({seconds: 62, cta: 'follow'});
    const base = () => JSON.parse(planAnswer('Nova', {seconds: 62}));
    const media = {layout: 'media', kind: 'photo', query: 'ocean', caption: 'The ocean', icon: 'star'};
    const one = base();
    one.scenes[1].visual = media;
    expect(schema.safeParse(one).success).toBe(true);
    const own = base();
    own.scenes[1].visual = {...media, src: 'https://evil.example/x.jpg'};
    const bad = schema.safeParse(own);
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toMatch(/src/);
    const three = base();
    for (const i of [1, 2, 3]) three.scenes[i].visual = media;
    expect(JSON.stringify(schema.safeParse(three).error?.issues)).toMatch(/at most 2/);
  });
});

let h: Harness;
afterEach(() => h?.close());

describe('media scenes in a video', () => {
  const withMedia = (plan: any) => {
    plan.scenes[1].visual = {layout: 'media', kind: 'clip', query: 'venus clouds', caption: 'Thick clouds all the time', icon: 'star'};
    plan.scenes[3].visual = {layout: 'media', kind: 'photo', query: 'nike shoes', caption: 'Shoes', icon: 'star'};
    return plan;
  };

  it('fills found scenes with the file and credit, keeps the icon when nothing is found', async () => {
    const asked: string[] = [];
    let rendered: string[] | undefined;
    h = new Harness({
      userId: OWNER,
      ownerId: OWNER,
      editPlan: withMedia,
      findMedia: async (v, {dir, index}) => {
        asked.push(v.query);
        if (v.query !== 'venus clouds') return null;
        fs.mkdirSync(dir, {recursive: true});
        const file = path.join(dir, `scene${index + 1}.mp4`);
        fs.writeFileSync(file, 'clip');
        const hit: MediaHit = {source: 'pexels', id: '9', kind: 'clip', url: 'https://v/9.mp4', page: 'https://www.pexels.com/video/9', author: 'Ana', license: 'Pexels License', width: 1080, height: 1920, seconds: 30};
        return {file, publicName: `media/${path.basename(file)}`, hit};
      },
      renderer: {
        ...fakeRenderer,
        video: (async (o: {outPath: string; mediaPaths?: string[]}) => {
          rendered = o.mediaPaths;
          fs.writeFileSync(o.outPath, Buffer.from('fake mp4'));
        }) as any,
      },
    });
    await runOnboarding(h);
    const v = [...h.store.videos.values()].find((x) => x.plan?.scenes)!;
    const [clip, shoes] = [v.plan.scenes[1].visual, v.plan.scenes[3].visual];
    expect(clip).toMatchObject({layout: 'media', kind: 'clip', src: 'media/scene2.mp4', seconds: 15, credit: 'Clip by Ana on Pexels (Pexels License): https://www.pexels.com/video/9'});
    expect(shoes.src).toBeUndefined(); // no file: drawn with its icon
    expect(asked).toEqual(['venus clouds', 'nike shoes']);
    expect(v.plan.media_credits).toEqual([clip.credit]);
    expect(rendered).toHaveLength(1);
    expect(rendered![0]).toMatch(/scene2\.mp4$/);
  });
});
