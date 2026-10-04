import {useEffect, useMemo, useState} from 'react';
import {Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {Dashboard} from '../../studio/lib/analytics';
import type {TelegramWebApp} from './main';

type Range = 7 | 30 | 90 | 'all';
type Tab = 'overview' | 'library' | 'insights';
const TABS: {id: Tab; label: string}[] = [
  {id: 'overview', label: 'Overview'},
  {id: 'library', label: 'Library'},
  {id: 'insights', label: 'Insights'},
];
type SortKey = 'newest' | 'views' | 'likes' | 'engagement' | 'velocity';

const RANGES: {id: Range; label: string}[] = [
  {id: 7, label: '7D'},
  {id: 30, label: '30D'},
  {id: 90, label: '90D'},
  {id: 'all', label: 'All'},
];

const GOAL_LABEL: Record<string, string> = {followers: 'Grow followers', views: 'Get views', creator_rewards: 'Creator Rewards', traffic: 'Send traffic'};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtNum = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(Math.abs(n) >= 1e4 ? 0 : 1)}K` : String(Math.round(n));
const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`;
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]}`;
const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleString('en', {month: 'long', year: 'numeric', timeZone: 'UTC'});

export function App({tg}: {tg?: TelegramWebApp}) {
  const [range, setRange] = useState<Range>(30);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard?range=${range}`, {headers: {'x-telegram-init-data': tg?.initData ?? ''}})
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 401 ? 'Please open the dashboard from the bot with /dashboard.' : body.error ?? `Error ${r.status}`);
        return body as Dashboard;
      })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, tg]);

  const pick = <T,>(set: (v: T) => void, v: T) => {
    tg?.HapticFeedback?.selectionChanged();
    set(v);
  };

  if (error && !data)
    return (
      <div className="center" role="alert">
        <div className="msg"><h1>Couldn't load your channel</h1><p className="muted">{error}</p></div>
      </div>
    );
  if (!data) return <div className="center muted" role="status">Loading channel…</div>;

  return (
    <div className={`app ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
      <Channel d={data} />
      <div className="controls">
        <div className="tabs" role="tablist" aria-label="View" style={{margin: 0, borderBottom: 0}}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => pick(setTab, t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={String(r.id)} aria-pressed={range === r.id} onClick={() => pick(setRange, r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <main>
        {tab === 'overview' && <Overview d={data} />}
        {tab === 'library' && <Library d={data} tg={tg} />}
        {tab === 'insights' && <Insights d={data} />}
      </main>
      <p className="foot muted">Updated {new Date(data.generatedAt).toLocaleString()} · times in {data.timezone}</p>
    </div>
  );
}

function Channel({d}: {d: Dashboard}) {
  const a = d.account;
  return (
    <header className="channel">
      {a.avatar ? <img className="avatar" src={a.avatar} alt="" /> : <div className="avatar ph" aria-hidden="true">{(a.username ?? '?')[0]?.toUpperCase()}</div>}
      <div>
        <div className="name">{a.displayName ?? a.username ?? 'Your channel'}</div>
        <div className="meta">@{a.username ?? '—'} · {GOAL_LABEL[d.goal] ?? d.goal}</div>
      </div>
      <div className="channel-stats">
        <span><b>{fmtNum(a.followers)}</b>followers</span>
        <span><b>{fmtNum(a.likes)}</b>likes</span>
        <span><b>{fmtNum(a.videoCount)}</b>videos</span>
      </div>
    </header>
  );
}

function Stat({label, value, sub, tone}: {label: string; value: string; sub?: string; tone?: 'up' | 'down' | null}) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className={`sub ${tone ?? ''}`}>{sub}</span>}
    </div>
  );
}

const Icon = {
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>,
  comment: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>,
  share: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12v8h16v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>,
};

const vsPrev = (now: number, prev: number) => {
  if (!prev) return {sub: 'no earlier data', tone: null};
  const ch = (now - prev) / prev;
  return {sub: `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch * 100).toFixed(0)}% vs before`, tone: ch >= 0 ? ('up' as const) : ('down' as const)};
};

function ChartCard({title, children}: {title: string; children: React.ReactElement}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="chart">
        <ResponsiveContainer width="100%" height={180}>
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const axis = {tick: {fontSize: 11, fill: 'var(--hint)'}, tickLine: false, axisLine: false} as const;
const tip = {contentStyle: {background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', fontSize: 12}, labelFormatter: (l: unknown) => shortDay(String(l))};

function Overview({d}: {d: Dashboard}) {
  const k = d.kpis;
  const views = vsPrev(k.views.value, k.views.prev);
  const likes = vsPrev(k.likes.value, k.likes.prev);
  const s = d.series;
  return (
    <>
      <div className="stats">
        <Stat label="Followers" value={fmtNum(k.followers.value)} sub={`${signed(k.followers.change)} in range`} tone={k.followers.change >= 0 ? 'up' : 'down'} />
        <Stat label="Views" value={fmtNum(k.views.value)} {...views} />
        <Stat label="Likes" value={fmtNum(k.likes.value)} {...likes} />
        <Stat label="Engagement" value={fmtPct(k.engagement.value)} sub="likes+comments+shares ÷ views" />
      </div>
      <section className="section">
        <h2>New followers</h2>
        <div className="row3">
          <div><b>{signed(k.growth.followers.day)}</b><span className="muted">today</span></div>
          <div><b>{signed(k.growth.followers.week)}</b><span className="muted">7 days</span></div>
          <div><b>{signed(k.growth.followers.month)}</b><span className="muted">30 days</span></div>
        </div>
      </section>
      <ChartCard title="Followers">
        <AreaChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={fmtNum} width={44} domain={['dataMin', 'auto']} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtNum(Number(v))} />
          <Area type="monotone" dataKey="followers" name="Followers" stroke="var(--accent)" strokeWidth={2} fill="var(--accent-soft)" fillOpacity={0.25} />
        </AreaChart>
      </ChartCard>
      <ChartCard title="Daily views">
        <BarChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={fmtNum} width={44} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtNum(Number(v))} cursor={{fill: 'var(--line)'}} />
          <Bar dataKey="views" name="Views" fill="var(--accent-2)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Daily likes">
        <BarChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={fmtNum} width={44} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtNum(Number(v))} cursor={{fill: 'var(--line)'}} />
          <Bar dataKey="likes" name="Likes" fill="var(--accent-soft)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Engagement rate">
        {/* Days with under 100 new views are left blank: a handful of views makes the ratio meaningless. */}
        <LineChart data={s.map((x) => ({...x, engagement: x.views >= 100 ? x.engagement : null}))} margin={{top: 6, right: 6, left: 0, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} width={40} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtPct(Number(v))} />
          <Line type="monotone" dataKey="engagement" name="Engagement" stroke="var(--accent)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>
      <section className="section">
        <h2>By month</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Month</th><th>Videos</th><th>Views</th><th>Likes</th><th>New followers</th></tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.month}>
                  <td>{monthName(m.month)}</td>
                  <td>{m.videosPosted}</td>
                  <td>{fmtNum(m.views)}</td>
                  <td>{fmtNum(m.likes)}</td>
                  <td>{signed(m.newFollowers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Library({d, tg}: {d: Dashboard; tg?: TelegramWebApp}) {
  const [sort, setSort] = useState<SortKey>('newest');
  const list = useMemo(() => {
    const by: Record<SortKey, (v: Dashboard['videos'][number]) => number> = {
      newest: (v) => new Date(v.postedAt).getTime(),
      views: (v) => v.views,
      likes: (v) => v.likes,
      engagement: (v) => v.engagement,
      velocity: (v) => v.velocity24h ?? -1,
    };
    return [...d.videos].sort((a, b) => by[sort](b) - by[sort](a));
  }, [d.videos, sort]);
  const open = (url: string | null) => url && (tg?.openLink ? tg.openLink(url) : window.open(url, '_blank'));
  return (
    <>
      <div className="library-bar">
        <span className="muted">{list.length} posted video{list.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort videos">
          <option value="newest">Newest</option>
          <option value="views">Most views</option>
          <option value="likes">Most likes</option>
          <option value="engagement">Best engagement</option>
          <option value="velocity">Fastest first 24h</option>
        </select>
      </div>
      {!list.length && <p className="empty">No posted videos in this range. New videos show up here after they post.</p>}
      <div className="library">
        {list.map((v) => (
          <button key={v.id} className="clip" onClick={() => open(v.shareUrl)} aria-label={`${v.topic || v.caption}, ${fmtNum(v.views)} views. Open on TikTok`}>
            <div className="frame">
              {v.thumb ? <img src={v.thumb} alt="" loading="lazy" /> : null}
              {v.viral ? <span className="tag viral">Viral{v.ratio ? ` ${v.ratio.toFixed(1)}×` : ''}</span> : v.experiment ? <span className="tag">Test</span> : null}
              <span className="date">{new Date(v.postedAt).toLocaleDateString(undefined, {day: 'numeric', month: 'short'})}</span>
            </div>
            <span className="title">{v.topic || v.caption}</span>
            {v.hookType && <span className="sub">{v.hookType} hook</span>}
            <span className="metrics">
              <span>{Icon.eye}{fmtNum(v.views)}</span>
              <span>{Icon.heart}{fmtNum(v.likes)}</span>
              <span>{Icon.comment}{fmtNum(v.comments)}</span>
              <span>{Icon.share}{fmtNum(v.shares)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function Insights({d}: {d: Dashboard}) {
  const ins = d.insights;
  const max = Math.max(1, ...ins.heatmap.flat().map((x) => x ?? 0));
  return (
    <>
      {ins.tooSmall && (
        <p className="note">
          <b>Only {ins.n} video{ins.n === 1 ? '' : 's'} so far.</b> Patterns need at least 15 videos to mean much, so treat everything here as early hints.
        </p>
      )}
      <section className="section">
        <h2>What's working</h2>
        {ins.summary ? <p>{ins.summary}</p> : <p className="muted">Your first weekly report arrives on Monday.</p>}
        {ins.patterns.slice(0, 6).map((p) => (
          <div key={p.feature + p.value} className="pattern">
            <span className={`lift ${p.lift >= 1 ? 'up' : 'down'}`}>{p.lift >= 1 ? '▲' : '▼'} {p.lift.toFixed(1)}×</span>
            <span>{p.text}</span>
          </div>
        ))}
        {ins.changes.length > 0 && (
          <>
            <h3>Changes for next week</h3>
            <ul>{ins.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          </>
        )}
      </section>
      <section className="section">
        <h2>Best posting times</h2>
        <p className="muted small">Median views by day and hour ({d.timezone}). Empty cells have no videos yet.</p>
        <div className="heat">
          <div className="hrow head">
            <span />
            {Array.from({length: 24}, (_, h) => <span key={h}>{h % 6 === 0 ? h : ''}</span>)}
          </div>
          {ins.heatmap.map((row, wd) => (
            <div key={wd} className="hrow">
              <span className="muted">{DAYS[wd]}</span>
              {row.map((c, h) => (
                <span key={h} className="cell" title={c === null ? 'no videos' : `${fmtNum(c)} views`} style={{background: c === null ? 'var(--line)' : `color-mix(in srgb, var(--accent) ${Math.round(20 + 80 * (c / max))}%, transparent)`}} />
              ))}
            </div>
          ))}
        </div>
      </section>
      <Ranked title="Best topics" rows={ins.bestTopics} />
      <Ranked title="Best hooks" rows={ins.bestHooks} />
    </>
  );
}

function Ranked({title, rows}: {title: string; rows: {label: string; medianViews: number; n: number}[]}) {
  const max = Math.max(1, ...rows.map((r) => r.medianViews));
  return (
    <section className="section">
      <h2>{title}</h2>
      {!rows.length && <p className="muted">Not enough videos yet.</p>}
      {rows.map((r) => (
        <div key={r.label} className="rank">
          <div className="rank-top"><span>{r.label}</span><span className="muted small">{fmtNum(r.medianViews)} median · {r.n} video{r.n === 1 ? '' : 's'}</span></div>
          <div className="bar"><i style={{width: `${(100 * r.medianViews) / max}%`}} /></div>
        </div>
      ))}
    </section>
  );
}
