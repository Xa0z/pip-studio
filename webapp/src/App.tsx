import {useEffect, useMemo, useState} from 'react';
import {Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {Dashboard} from '../../studio/lib/analytics';
import type {TelegramWebApp} from './main';

type Range = 7 | 30 | 90 | 'all';
type Tab = 'overview' | 'videos' | 'insights';
type SortKey = 'newest' | 'views' | 'likes' | 'engagement' | 'velocity';

const RANGES: {id: Range; label: string}[] = [
  {id: 7, label: '7 days'},
  {id: 30, label: '30 days'},
  {id: 90, label: '90 days'},
  {id: 'all', label: 'All time'},
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

  if (error && !data) return <div className="center"><div className="card"><b>Can't load your stats</b><p className="muted">{error}</p></div></div>;
  if (!data) return <div className="center muted">Loading your stats…</div>;

  return (
    <div className={`app ${loading ? 'is-loading' : ''}`}>
      <AccountCard d={data} />
      <div className="chips" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={String(r.id)} className={`chip ${range === r.id ? 'on' : ''}`} onClick={() => pick(setRange, r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="tabs" role="tablist">
        {(['overview', 'videos', 'insights'] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => pick(setTab, t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview d={data} />}
      {tab === 'videos' && <Videos d={data} tg={tg} />}
      {tab === 'insights' && <Insights d={data} />}
      <p className="foot muted">Updated {new Date(data.generatedAt).toLocaleString()} · times in {data.timezone}</p>
    </div>
  );
}

function AccountCard({d}: {d: Dashboard}) {
  const a = d.account;
  return (
    <div className="card account">
      {a.avatar ? <img className="avatar" src={a.avatar} alt="" /> : <div className="avatar ph">{(a.username ?? '?')[0]?.toUpperCase()}</div>}
      <div className="who">
        <div className="name">{a.displayName ?? a.username ?? 'Your channel'}</div>
        <div className="muted">@{a.username ?? '—'} · {GOAL_LABEL[d.goal] ?? d.goal}</div>
      </div>
      <div className="acct-stats">
        <div><b>{fmtNum(a.followers)}</b><span>followers</span></div>
        <div><b>{fmtNum(a.likes)}</b><span>likes</span></div>
        <div><b>{fmtNum(a.videoCount)}</b><span>videos</span></div>
      </div>
    </div>
  );
}

function Kpi({label, value, sub, tone}: {label: string; value: string; sub?: string; tone?: 'up' | 'down' | null}) {
  return (
    <div className="kpi">
      <span className="muted">{label}</span>
      <b>{value}</b>
      {sub && <span className={`sub ${tone ?? ''}`}>{sub}</span>}
    </div>
  );
}

const vsPrev = (now: number, prev: number) => {
  if (!prev) return {sub: 'no earlier data', tone: null};
  const ch = (now - prev) / prev;
  return {sub: `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch * 100).toFixed(0)}% vs before`, tone: ch >= 0 ? ('up' as const) : ('down' as const)};
};

function ChartCard({title, children}: {title: string; children: React.ReactElement}) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="chart">
        <ResponsiveContainer width="100%" height={180}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const axis = {tick: {fontSize: 11, fill: 'var(--hint)'}, tickLine: false, axisLine: false} as const;
const tip = {contentStyle: {background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)', fontSize: 12}, labelFormatter: (l: unknown) => shortDay(String(l))};

function Overview({d}: {d: Dashboard}) {
  const k = d.kpis;
  const views = vsPrev(k.views.value, k.views.prev);
  const likes = vsPrev(k.likes.value, k.likes.prev);
  const s = d.series;
  return (
    <>
      <div className="kpis">
        <Kpi label="Followers" value={fmtNum(k.followers.value)} sub={`${signed(k.followers.change)} in range`} tone={k.followers.change >= 0 ? 'up' : 'down'} />
        <Kpi label="Views" value={fmtNum(k.views.value)} {...views} />
        <Kpi label="Likes" value={fmtNum(k.likes.value)} {...likes} />
        <Kpi label="Engagement" value={fmtPct(k.engagement.value)} sub="likes+comments+shares ÷ views" />
      </div>
      <div className="card growth">
        <h3>New followers</h3>
        <div className="row3">
          <div><b>{signed(k.growth.followers.day)}</b><span className="muted">today</span></div>
          <div><b>{signed(k.growth.followers.week)}</b><span className="muted">7 days</span></div>
          <div><b>{signed(k.growth.followers.month)}</b><span className="muted">30 days</span></div>
        </div>
      </div>
      <ChartCard title="Followers">
        <AreaChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <defs>
            <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={fmtNum} width={44} domain={['dataMin', 'auto']} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtNum(Number(v))} />
          <Area type="monotone" dataKey="followers" name="Followers" stroke="var(--accent)" strokeWidth={2.5} fill="url(#gF)" />
        </AreaChart>
      </ChartCard>
      <ChartCard title="Daily views">
        <BarChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={fmtNum} width={44} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtNum(Number(v))} cursor={{fill: 'var(--line)'}} />
          <Bar dataKey="views" name="Views" fill="var(--cyan)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Daily likes">
        <BarChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={fmtNum} width={44} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtNum(Number(v))} cursor={{fill: 'var(--line)'}} />
          <Bar dataKey="likes" name="Likes" fill="var(--pink)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>
      <ChartCard title="Engagement rate">
        <LineChart data={s} margin={{top: 6, right: 6, left: -12, bottom: 0}}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} {...axis} />
          <Tooltip {...tip} formatter={(v) => fmtPct(Number(v))} />
          <Line type="monotone" dataKey="engagement" name="Engagement" stroke="var(--green)" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ChartCard>
      <div className="card">
        <h3>By month</h3>
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
      </div>
    </>
  );
}

function Videos({d, tg}: {d: Dashboard; tg?: TelegramWebApp}) {
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
      <div className="sortbar">
        <span className="muted">{list.length} video{list.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort videos">
          <option value="newest">Newest</option>
          <option value="views">Most views</option>
          <option value="likes">Most likes</option>
          <option value="engagement">Best engagement</option>
          <option value="velocity">Fastest first 24h</option>
        </select>
      </div>
      {!list.length && <div className="card muted">No posted videos in this range yet.</div>}
      {list.map((v) => (
        <button key={v.id} className="card video" onClick={() => open(v.shareUrl)}>
          {v.thumb ? <img className="thumb" src={v.thumb} alt="" loading="lazy" /> : <div className="thumb ph" />}
          <div className="vbody">
            <div className="badges">
              {v.viral && <span className="badge viral">🔥 Viral {v.ratio ? `${v.ratio.toFixed(1)}×` : ''}</span>}
              {v.experiment && <span className="badge exp">🧪 Test</span>}
            </div>
            <div className="vtitle">{v.topic || v.caption}</div>
            <div className="muted small">{new Date(v.postedAt).toLocaleDateString(undefined, {day: 'numeric', month: 'short'})}{v.hookType ? ` · ${v.hookType} hook` : ''}</div>
            <div className="vstats">
              <span>👁 {fmtNum(v.views)}</span>
              <span>❤️ {fmtNum(v.likes)}</span>
              <span>💬 {fmtNum(v.comments)}</span>
              <span>↗ {fmtNum(v.shares)}</span>
              <span className="eng">{fmtPct(v.engagement)}</span>
            </div>
          </div>
        </button>
      ))}
    </>
  );
}

function Insights({d}: {d: Dashboard}) {
  const ins = d.insights;
  const max = Math.max(1, ...ins.heatmap.flat().map((x) => x ?? 0));
  return (
    <>
      {ins.tooSmall && (
        <div className="card note">
          <b>Only {ins.n} video{ins.n === 1 ? '' : 's'} so far.</b> Patterns need at least 15 videos to mean much, so treat everything here as early hints.
        </div>
      )}
      <div className="card">
        <h3>What's working</h3>
        {ins.summary ? <p>{ins.summary}</p> : <p className="muted">Your first weekly report arrives on Monday.</p>}
        {ins.patterns.slice(0, 6).map((p) => (
          <div key={p.feature + p.value} className="pattern">
            <span className={`lift ${p.lift >= 1 ? 'up' : 'down'}`}>{p.lift >= 1 ? '▲' : '▼'} {p.lift.toFixed(1)}×</span>
            <span>{p.text}</span>
          </div>
        ))}
        {ins.changes.length > 0 && (
          <>
            <h4>Changes I'm making</h4>
            <ul>{ins.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          </>
        )}
      </div>
      <div className="card">
        <h3>Best posting times</h3>
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
      </div>
      <Ranked title="Best topics" rows={ins.bestTopics} />
      <Ranked title="Best hooks" rows={ins.bestHooks} />
    </>
  );
}

function Ranked({title, rows}: {title: string; rows: {label: string; medianViews: number; n: number}[]}) {
  const max = Math.max(1, ...rows.map((r) => r.medianViews));
  return (
    <div className="card">
      <h3>{title}</h3>
      {!rows.length && <p className="muted">Not enough videos yet.</p>}
      {rows.map((r) => (
        <div key={r.label} className="rank">
          <div className="rank-top"><span>{r.label}</span><span className="muted small">{fmtNum(r.medianViews)} median · {r.n} video{r.n === 1 ? '' : 's'}</span></div>
          <div className="bar"><i style={{width: `${(100 * r.medianViews) / max}%`}} /></div>
        </div>
      ))}
    </div>
  );
}
