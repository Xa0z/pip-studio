import fs from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll, describe, expect, it} from 'vitest';

const dir = 'supabase/migrations';
const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

let db: PGlite;
const fails = async (q: string) => {
  await expect(db.exec(q)).rejects.toThrow();
};

describe('Supabase migration (run in PGlite)', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(sql);
    await db.exec(`
      insert into users (id, first_name) values (1, 'A'), (2, 'B');
      insert into characters (id, user_id, name, status, code, voice_id) values ('00000000-0000-0000-0000-000000000001', 1, 'Nova', 'locked', 'code', 'af_heart');
      insert into videos (id, user_id, slot_at, status) values ('00000000-0000-0000-0000-0000000000a1', 1, '2026-10-05T18:00:00Z', 'posted');
      insert into video_metrics (video_id, checkpoint, views) values ('00000000-0000-0000-0000-0000000000a1', '1h', 10);
      insert into account_metrics (user_id, followers) values (1, 100);
    `);
  }, 60000);

  it('turns on row level security for every table', async () => {
    const r = await db.query<{relname: string; relrowsecurity: boolean}>(`select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace`);
    const tables = ['users', 'tiktok_accounts', 'claude_credentials', 'settings', 'characters', 'videos', 'video_metrics', 'account_metrics', 'patterns', 'jobs'];
    for (const t of tables) expect(r.rows.find((x) => x.relname === t)?.relrowsecurity, t).toBe(true);
  });

  it('never updates or deletes metric snapshots', async () => {
    await fails(`update video_metrics set views = 99`);
    await fails(`delete from video_metrics`);
    await fails(`delete from account_metrics`);
    await fails(`insert into video_metrics (video_id, checkpoint, views) values ('00000000-0000-0000-0000-0000000000a1', '1h', 11)`);
  });

  it('keeps a locked character exactly the same', async () => {
    await fails(`update characters set code = 'other' where name = 'Nova'`);
    await fails(`update characters set voice_id = 'am_adam' where name = 'Nova'`);
    await fails(`update characters set status = 'candidate' where name = 'Nova'`);
    await fails(`insert into characters (user_id, name, status) values (1, 'Second', 'locked')`);
    await db.exec(`update characters set status = 'archived' where name = 'Nova'`);
    await fails(`update characters set status = 'locked' where name = 'Nova'`);
    const r = await db.query<{code: string}>(`select code from characters where name = 'Nova'`);
    expect(r.rows[0].code).toBe('code');
  });

  it('allows only one real video per slot', async () => {
    await fails(`insert into videos (user_id, slot_at) values (1, '2026-10-05T18:00:00Z')`);
    await db.exec(`insert into videos (user_id, slot_at, is_dry_run) values (1, '2026-10-05T18:00:00Z', true)`);
  });

  it('checks settings', async () => {
    await fails(`insert into settings (user_id, niches, goal, timezone, posts_per_day, post_times) values (2, '{a,b,c}', 'views', 'UTC', 1, '{19:00}')`);
    await fails(`insert into settings (user_id, niches, goal, timezone, posts_per_day, post_times) values (2, '{a}', 'views', 'UTC', 2, '{19:00}')`);
    await db.exec(`insert into settings (user_id, niches, goal, timezone, posts_per_day, post_times) values (2, '{a}', 'views', 'UTC', 2, '{12:00,20:00}')`);
  });

  it('counts GitHub minutes per month', async () => {
    await db.query(`select add_actions_minutes(12.5)`);
    const r = await db.query<{t: string}>(`select add_actions_minutes(3) as t`);
    expect(Number(r.rows[0].t)).toBe(15.5);
  });

  it('delete_user_data removes everything for that user, snapshots included', async () => {
    await db.query(`select delete_user_data(1)`);
    for (const t of ['users where id = 1', 'characters where user_id = 1', 'videos where user_id = 1', 'video_metrics', 'account_metrics where user_id = 1']) {
      const r = await db.query<{n: number}>(`select count(*)::int as n from ${t}`);
      expect(r.rows[0].n, t).toBe(0);
    }
    const other = await db.query<{n: number}>(`select count(*)::int as n from users where id = 2`);
    expect(other.rows[0].n).toBe(1);
    // and normal deletes are still blocked afterwards
    await db.exec(`insert into account_metrics (user_id, followers) values (2, 5)`);
    await fails(`delete from account_metrics where user_id = 2`);
  });
});
