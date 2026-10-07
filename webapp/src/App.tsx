import {useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {DashboardResponse} from '../../studio/lib/analytics';
import {Icon} from './icons';
import type {TelegramWebApp} from './main';

type Data = DashboardResponse;
type Video = Data['videos'][number];
type Range = 7 | 30 | 90 | 'all';
type Tab = 'overview' | 'library' | 'insights';
type SortKey = 'newest' | 'views' | 'likes' | 'engagement' | 'velocity';

const TABS: {id: Tab; label: string; icon: ReactNode}[] = [
  {id: 'overview', label: 'Overview', icon: Icon.grid},
  {id: 'library', label: 'Library', icon: Icon.film},
  {id: 'insights', label: 'Insights', icon: Icon.trend},
];
const RANGES: {id: Range; label: string; title: string}[] = [
  {id: 7, label: '7D', title: 'Last 7 days'},
  {id: 30, label: '30D', title: 'Last 30 days'},
  {id: 90, label: '90D', title: 'Last 90 days'},
  {id: 'all', label: 'All', title: 'All time'},
];
const SORTS: {id: SortKey; label: string}[] = [
  {id: 'newest', label: 'Newest'},
  {id: 'views', label: 'Most views'},
  {id: 'likes', label: 'Most likes'},
  {id: 'engagement', label: 'Best engagement'},
  {id: 'velocity', label: 'Fastest first 24h'},
];
const GOAL_LABEL: Record<string, string> = {followers: 'Grow followers', views: 'Get views', creator_rewards: 'Creator Rewards', traffic: 'Send traffic'};
const STATUS_LABEL: Record<string, string> = {planned: 'Planned', rendering: 'Being made', awaiting_approval: 'Needs your OK', approved: 'Approved', publishing: 'Posting now'};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- formatting
export const fmtNum = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
};
const fmtFull = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtPct = (r: number) => `${(r * 100).toFixed(r && r < 0.1 ? 1 : 0)}%`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`;
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const safeTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', {timeZone: tz});
    return tz;
  } catch {
    return 'UTC';
  }
};
/** "Today" / "Tomorrow" / "Wed 8 Oct" and "20:00", in the channel's timezone. */
function when(iso: string, tzRaw: string, nowIso: string) {
  const tz = safeTz(tzRaw);
  const d = new Date(iso);
  const now = new Date(nowIso);
  const key = (x: Date) => x.toLocaleDateString('en-CA', {timeZone: tz});
  const time = d.toLocaleTimeString('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit'});
  const day =
    key(d) === key(now) ? 'Today' : key(d) === key(new Date(now.getTime() + 864e5)) ? 'Tomorrow' : `${d.toLocaleDateString('en-GB', {timeZone: tz, weekday: 'short'})} ${shortDay(key(d))}`;
  return {day, time};
}
const postedDate = (iso: string, tz: string) => shortDay(new Date(iso).toLocaleDateString('en-CA', {timeZone: safeTz(tz)}));

// ---------------------------------------------------------------- app
export function App({tg}: {tg?: TelegramWebApp}) {
  const [range, setRange] = useState<Range>(30);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard?range=${range}`, {headers: {'x-telegram-init-data': tg?.initData ?? ''}})
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 401 ? 'Open the dashboard from the bot with /dashboard.' : body.error ?? `Error ${r.status}`);
        return body as Data;
      })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, tg, attempt]);

  const pick = <T,>(set: (v: T) => void, v: T) => {
    tg?.HapticFeedback?.selectionChanged();
    set(v);
  };

  if (error && !data)
    return (
      <div className="center" role="alert">
        <div className="state">
          <div className="state-icon">{Icon.alert}</div>
          <h1>Couldn't load your channel</h1>
          <p>{error}</p>
          <button className="btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  if (!data) return <Skeleton />;

  const fresh = data.insights.n === 0;
  const rangeTitle = RANGES.find((r) => r.id === range)!.title;
  return (
    <div className={`app${loading ? ' is-loading' : ''}`} aria-busy={loading}>
      <TopBar d={data} loading={loading} onRefresh={() => pick(setAttempt, attempt + 1)} />
      <Profile d={data} />
      <nav className="tabbar" aria-label="View">
        <div className="tabbar-in" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => (pick(setTab, t.id), window.scrollTo({top: 0}))}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
      {tab !== 'insights' && !fresh && (
        <div className="range-row">
          <h2>{rangeTitle}</h2>
          <div className="seg seg-sm" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={String(r.id)} aria-pressed={range === r.id} onClick={() => pick(setRange, r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <main key={tab} className="view">
        {tab === 'overview' && (fresh ? <Welcome d={data} /> : <Overview d={data} range={range} tg={tg} />)}
        {tab === 'library' && <Library d={data} tg={tg} />}
        {tab === 'insights' && <Insights d={data} />}
      </main>
      <footer className="foot">
        Updated {when(data.generatedAt, data.timezone, data.generatedAt).time} · times in {data.timezone.replace(/_/g, ' ')}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces
function Card({title, icon, aside, children, className = ''}: {title?: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-head">
          <h3>
            {icon && <span className="card-icon">{icon}</span>}
            {title}
          </h3>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** ▲/▼ chip. `ratio` is a relative change (0.24 = +24%), `abs` an absolute one. */
function Delta({ratio, abs}: {ratio?: number; abs?: number}) {
  const v = ratio ?? abs ?? 0;
  if (!Number.isFinite(v)) return null;
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  // Past +900% a percentage stops meaning much; say "12×" instead.
  const text = ratio !== undefined && ratio > 9 ? `${Math.round(ratio + 1)}×` : ratio !== undefined ? `${Math.abs(ratio * 100) >= 10 ? Math.round(Math.abs(ratio * 100)) : Math.abs(ratio * 100).toFixed(1).replace(/\.0$/, '')}%` : fmtNum(Math.abs(v));
  return (
    <span className={`delta ${dir}`}>
      <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'}</span>
      <span className="sr">{dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'no change'} </span>
      {text}
    </span>
  );
}
const change = (now: number, prev: number) => (prev > 0 ? (now - prev) / prev : undefined);

/** 12-ish point trend line for stat tiles. Hidden when there is nothing to show. */
function Spark({values}: {values: (number | null)[]}) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return <div className="spark spark-none" aria-hidden="true" />;
  const xs = values.length - 1 || 1;
  const min = Math.min(...pts.map((p) => p[1]));
  const max = Math.max(...pts.map((p) => p[1]));
  const y = (v: number) => (max === min ? 20 : 28 - ((v - min) / (max - min)) * 24);
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${((i / xs) * 100).toFixed(2)},${y(v).toFixed(2)}`).join('');
  const area = `${line}L${((pts.at(-1)![0] / xs) * 100).toFixed(2)},32L${((pts[0][0] / xs) * 100).toFixed(2)},32Z`;
  const last = pts.at(-1)!;
  return (
    <div className="spark" aria-hidden="true">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none">
        <path d={area} className="spark-area" />
        <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="spark-dot" style={{left: `${(last[0] / xs) * 100}%`, top: `${(y(last[1]) / 32) * 100}%`}} />
    </div>
  );
}

function Stat({icon, label, value, delta, note, spark}: {icon: ReactNode; label: string; value: string; delta?: ReactNode; note?: string; spark?: (number | null)[]}) {
  return (
    <div className="stat">
      <div className="stat-label">
        <span className="stat-icon">{icon}</span>
        {label}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{delta ?? <span className="stat-note">{note}</span>}</div>
      {spark && <Spark values={spark} />}
    </div>
  );
}

function ChartTip({active, payload, label, fmt}: {active?: boolean; payload?: readonly {value?: unknown; name?: unknown}[]; label?: unknown; fmt: (v: number) => string}) {
  if (!active || !payload?.length || payload[0].value === null || payload[0].value === undefined) return null;
  return (
    <div className="tip">
      <span className="tip-label">{shortDay(String(label))}</span>
      <span className="tip-value">{fmt(Number(payload[0].value))}</span>
    </div>
  );
}

function AxisEnds({days}: {days: string[]}) {
  if (days.length < 2) return null;
  return (
    <div className="axis-ends" aria-hidden="true">
      <span>{shortDay(days[0])}</span>
      {days.length > 6 && <span>{shortDay(days[Math.floor(days.length / 2)])}</span>}
      <span>{shortDay(days.at(-1)!)}</span>
    </div>
  );
}

/** Y ticks sit just above their gridline, left-aligned inside the plot (no axis gutter on a phone). */
const yAxis = {
  orientation: 'left',
  mirror: true,
  axisLine: false,
  tickLine: false,
  width: 1,
  tickCount: 3,
  tick: (p: {x: number | string; y: number | string; payload: {value: number}}) =>
    p.payload.value ? <text x={Number(p.x) + 2} y={Number(p.y) - 6} fontSize={10} fill="var(--hint)" className="ytick">{fmtNum(p.payload.value)}</text> : <g />,
} as const;

// ---------------------------------------------------------------- header
function TopBar({d, loading, onRefresh}: {d: Data; loading: boolean; onRefresh: () => void}) {
  const s = d.schedule;
  const live = !!s && s.times.length > 0;
  return (
    <div className="topbar">
      <span className="brand"><img src="/logo.svg" alt="" width="26" height="26" />Pip Studio</span>
      <span className="topbar-end">
        <span className={`live${live ? '' : ' off'}`}>
          <i aria-hidden="true" />
          {live ? (s!.mode === 'auto' ? 'Autopilot on' : 'Running') : 'Paused'}
        </span>
        <button className={`refresh${loading ? ' spinning' : ''}`} onClick={onRefresh} disabled={loading} aria-label="Refresh">{Icon.refresh}</button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- goal, momentum, records
/** TikTok's Creator Rewards bar: 10,000 followers and 100,000 views in the last 30 days. */
const REWARDS = {followers: 10_000, views: 100_000};
const MILESTONES = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 10_000_000) * 10_000_000;
const etaText = (left: number, perDay: number) => {
  if (left <= 0) return 'Reached';
  if (perDay <= 0) return 'Grows once followers come in';
  const days = Math.ceil(left / perDay);
  return days <= 1 ? 'About a day at this pace' : days > 365 ? 'Over a year at this pace' : `About ${days} days at this pace`;
};

function Progress({label, value, target, note}: {label: string; value: number; target: number; note: string}) {
  const pct = Math.min(1, target ? value / target : 0);
  return (
    <div className="prog">
      <div className="prog-top">
        <span className="prog-label">{label}</span>
        <span className="prog-num"><b>{fmtFull(value)}</b> / {fmtNum(target)}</span>
      </div>
      <div className="prog-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)} aria-label={label}>
        <i style={{width: `${Math.max(pct * 100, value > 0 ? 1.5 : 0)}%`}} />
      </div>
      <div className="prog-note">{pct >= 1 ? <b>Done</b> : <><b>{fmtFull(target - value)}</b> to go · {note}</>}</div>
    </div>
  );
}

function GoalCard({d}: {d: Data}) {
  const followers = d.account.followers;
  const views30 = d.kpis.growth.views.month;
  const perDay = d.kpis.growth.followers.week / 7;
  if (d.goal === 'creator_rewards') {
    const done = followers >= REWARDS.followers && views30 >= REWARDS.views;
    return (
      <Card title="Road to Creator Rewards" icon={Icon.target} className="goal-card" aside={done ? <span className="chip chip-accent">Eligible</span> : null}>
        <Progress label="Followers" value={followers} target={REWARDS.followers} note={etaText(REWARDS.followers - followers, perDay)} />
        <Progress label="Views, last 30 days" value={views30} target={REWARDS.views} note="Counts the last 30 days" />
        <p className="goal-foot">TikTok also needs you to be 18 or older. Pip checks the numbers, TikTok decides.</p>
      </Card>
    );
  }
  const target = nextMilestone(followers);
  const viewsTarget = nextMilestone(views30);
  return (
    <Card title="Next milestone" icon={Icon.target} className="goal-card">
      <Progress label="Followers" value={followers} target={target} note={etaText(target - followers, perDay)} />
      <Progress label="Views, last 30 days" value={views30} target={viewsTarget} note="Counts the last 30 days" />
    </Card>
  );
}

const dayKey = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-CA', {timeZone: safeTz(tz)});
/** Days in a row, ending today or yesterday, with at least one posted video. */
function postingStreak(d: Data) {
  const days = new Set(d.videos.map((v) => dayKey(v.postedAt, d.timezone)));
  let t = new Date(d.generatedAt).getTime();
  if (!days.has(dayKey(new Date(t).toISOString(), d.timezone))) t -= 864e5;
  let n = 0;
  while (days.has(dayKey(new Date(t).toISOString(), d.timezone))) (n++, (t -= 864e5));
  return n;
}

function Momentum({d}: {d: Data}) {
  const g = d.kpis.growth;
  const streak = postingStreak(d);
  const perDay = g.followers.week / 7;
  return (
    <section className="momentum" aria-label="Today">
      <div><span className="m-label">Today</span><b className={g.views.day > 0 ? 'pos' : ''}>{signed(g.views.day)}</b><span className="m-sub">views</span></div>
      <div><span className="m-label">Today</span><b className={g.followers.day > 0 ? 'pos' : ''}>{signed(g.followers.day)}</b><span className="m-sub">followers</span></div>
      <div><span className="m-label">Streak</span><b>{streak}</b><span className="m-sub">{streak === 1 ? 'day' : 'days'} in a row</span></div>
      <div><span className="m-label">Pace</span><b>{perDay >= 10 ? fmtNum(Math.round(perDay)) : perDay.toFixed(1).replace(/\.0$/, '')}</b><span className="m-sub">followers/day</span></div>
    </section>
  );
}

function Records({d}: {d: Data}) {
  const s = d.series;
  const best = <K extends 'views' | 'newFollowers' | 'likes'>(k: K) => s.reduce<(typeof s)[number] | null>((m, x) => (x[k] > (m?.[k] ?? 0) ? x : m), null);
  const v = best('views');
  const f = best('newFollowers');
  const l = best('likes');
  const rows = [
    v && {label: 'Most views in a day', value: fmtFull(v.views), day: v.day},
    f && {label: 'Most new followers in a day', value: `+${fmtFull(f.newFollowers)}`, day: f.day},
    l && {label: 'Most likes in a day', value: fmtFull(l.likes), day: l.day},
  ].filter(Boolean) as {label: string; value: string; day: string}[];
  if (!rows.length) return null;
  return (
    <Card title="Your records" icon={Icon.trophy} aside={<span className="muted small">This period</span>}>
      <ul className="records">
        {rows.map((x) => (
          <li key={x.label}>
            <span>{x.label}<small>{shortDay(x.day)}</small></span>
            <b>{x.value}</b>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The weekday and hour whose posts got the most median views, and whether it is one of the posting times. */
function BestSlot({d}: {d: Data}) {
  let top: {wd: number; h: number; v: number} | null = null;
  d.insights.heatmap.forEach((row, wd) => row.forEach((v, h) => v !== null && v > (top?.v ?? -1) && (top = {wd, h, v})));
  if (!top) return null;
  const t = top as {wd: number; h: number; v: number};
  const hh = `${String(t.h).padStart(2, '0')}:00`;
  const inSchedule = (d.schedule?.times ?? []).some((x) => Number(x.slice(0, 2)) === t.h);
  return (
    <section className="best-slot">
      <span className="poster-eyebrow">Your best time to post</span>
      <div className="best-when">{DAYS[t.wd]} <span>at</span> {hh}</div>
      <p><b>{fmtNum(t.v)}</b> median views for posts around this time.</p>
      <p className="best-tip">{inSchedule ? 'This hour is already one of your posting times.' : 'Not one of your posting times yet. Send /settings in the bot to add it.'}</p>
    </section>
  );
}

function Profile({d}: {d: Data}) {
  const a = d.account;
  const name = a.displayName || a.username || 'Your channel';
  const any = a.followers || a.likes || a.videoCount;
  return (
    <header className="profile">
      <div className="profile-row">
        {a.avatar ? <img className="avatar" src={a.avatar} alt="" /> : <div className="avatar ph" aria-hidden="true">{name[0]?.toUpperCase()}</div>}
        <div className="profile-text">
          <div className="name">{name}</div>
          <div className="handle">
            {a.username ? `@${a.username}` : 'TikTok'}
            <span className="goal">{GOAL_LABEL[d.goal] ?? d.goal}</span>
          </div>
        </div>
      </div>
      {any ? (
        <dl className="totals">
          <div><dt>Followers</dt><dd>{fmtNum(a.followers)}</dd></div>
          <div><dt>Likes</dt><dd>{fmtNum(a.likes)}</dd></div>
          <div><dt>Videos</dt><dd>{fmtNum(a.videoCount)}</dd></div>
        </dl>
      ) : null}
    </header>
  );
}

/** "13h 42m" until `iso`, ticking every 20 s. */
function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 60_000) return {h: 0, m: 0, soon: true};
  const min = Math.floor(ms / 60_000);
  return {h: Math.floor(min / 60), m: min % 60, soon: false};
}

function Countdown({iso}: {iso: string}) {
  const c = useCountdown(iso);
  if (!c) return null;
  if (c.soon) return <div className="count-big">Any minute</div>;
  const days = Math.floor(c.h / 24);
  return (
    <div className="count-big" aria-label={`in ${c.h} hours ${c.m} minutes`}>
      {days >= 2 ? (
        <>{days}<small>days</small></>
      ) : (
        <>
          {c.h > 0 && <>{c.h}<small>h</small></>}
          {String(c.m).padStart(c.h > 0 ? 2 : 1, '0')}<small>m</small>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- schedule
function NextPost({d, big = false}: {d: Data; big?: boolean}) {
  const s = d.schedule;
  const next = s?.upcoming[0];
  const at = next?.slotAt ?? s?.nextSlot;
  if (!s || !at)
    return (
      <Card className="next">
        <div className="next-row">
          <span className="next-icon">{Icon.calendar}</span>
          <div>
            <div className="next-title">No posting times set</div>
            <p className="muted">Send /settings in the bot to pick when videos go out.</p>
          </div>
        </div>
      </Card>
    );
  const w = when(at, d.timezone, d.generatedAt);
  const first = d.insights.n === 0;
  if (big)
    return (
      <section className="poster" aria-label={`${first ? 'Your first video posts' : 'Next post'} ${w.day} at ${w.time}`}>
        <div className="poster-top">
          <span className="poster-eyebrow">{first ? 'Your first video goes live in' : 'Next video goes live in'}</span>
          {next && <span className={`chip status-${next.status}`}>{STATUS_LABEL[next.status] ?? next.status}</span>}
        </div>
        <Countdown iso={at} />
        <div className="poster-when">
          {Icon.calendar}
          <span><b>{w.day}</b> at <b>{w.time}</b></span>
        </div>
        {next?.topic && <div className="poster-topic">{next.topic}</div>}
        {next?.status === 'awaiting_approval' && <p className="poster-hint">{Icon.chat} Approve it in the chat with Pip.</p>}
        {s.times.length > 0 && (
          <div className="poster-slots">
            <span>{s.postsPerDay === 1 ? 'Every day' : `${s.postsPerDay}× a day`}</span>
            {s.times.map((t) => <span key={t} className="slot">{t}</span>)}
          </div>
        )}
      </section>
    );
  return (
    <Card className="next">
      <div className="next-row">
        <span className="next-icon">{Icon.calendar}</span>
        <div className="next-main">
          <div className="eyebrow">{first ? 'Your first video posts' : 'Next post'}</div>
          <div className="next-title">
            {w.day} <span className="muted-strong">at</span> {w.time}
          </div>
          {next?.topic && <div className="next-topic">{next.topic}</div>}
        </div>
        {next && <span className={`chip status-${next.status}`}>{STATUS_LABEL[next.status] ?? next.status}</span>}
      </div>
      {next?.status === 'awaiting_approval' && <p className="next-hint">{Icon.chat} Approve it in the chat with Pip.</p>}
      {s.times.length > 0 && (
        <div className="slots">
          <span className="muted">{s.postsPerDay === 1 ? 'Every day at' : `${s.postsPerDay} a day at`}</span>
          {s.times.map((t) => <span key={t} className="slot">{t}</span>)}
        </div>
      )}
    </Card>
  );
}

function Upcoming({d}: {d: Data}) {
  const list = d.schedule?.upcoming ?? [];
  if (!list.length) return null;
  return (
    <Card title="Coming up" icon={Icon.clock}>
      <ul className="queue">
        {list.map((v) => {
          const w = when(v.slotAt, d.timezone, d.generatedAt);
          return (
            <li key={v.id}>
              <div className="queue-when"><b>{w.time}</b><span>{w.day}</span></div>
              <div className="queue-topic">{v.topic || 'Topic not picked yet'}</div>
              <span className={`chip status-${v.status}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- overview: first run
function Welcome({d}: {d: Data}) {
  const s = d.schedule;
  const approval = (s?.mode ?? 'approval') === 'approval';
  const time = s?.upcoming[0]?.slotAt ?? s?.nextSlot;
  const steps = [
    {title: 'Pip makes the video', text: 'Script, voice and edit, ready before the posting time.'},
    ...(approval ? [{title: 'You approve it', text: 'It arrives in the chat. Tap Approve, or skip it.'}] : []),
    {title: 'It posts to TikTok', text: time ? `${when(time, d.timezone, d.generatedAt).day} at ${when(time, d.timezone, d.generatedAt).time}.` : 'At your next posting time.'},
    {title: 'Stats show up here', text: 'First numbers about an hour after posting, then they update through the day.'},
  ];
  return (
    <>
      <NextPost d={d} big />
      <GoalCard d={d} />
      <div className="section-label">What happens next</div>
      <ol className="steps">
        {steps.map((x, i) => (
          <li key={x.title}>
            <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="step-title">{x.title}</div>
              <div className="step-text">{x.text}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="section-label">Your stats</div>
      <div className="stats stats-ghost">
        <Stat icon={Icon.eye} label="Views" value="—" note="After first post" />
        <Stat icon={Icon.users} label="Followers" value={d.account.followers ? fmtNum(d.account.followers) : '—'} note={d.account.followers ? 'On TikTok now' : 'After first post'} />
        <Stat icon={Icon.heart} label="Likes" value="—" note="After first post" />
        <Stat icon={Icon.pulse} label="Engagement" value="—" note="After first post" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- overview
function Overview({d, range, tg}: {d: Data; range: Range; tg?: TelegramWebApp}) {
  const k = d.kpis;
  const s = d.series;
  const days = s.map((x) => x.day);
  const rangeWord = range === 'all' ? '' : `${range} days`;
  const leadFollowers = d.goal === 'followers';
  const viewsDelta = change(k.views.value, k.views.prev);
  const likesDelta = change(k.likes.value, k.likes.prev);
  const tail = (xs: (number | null)[]) => xs.slice(-Math.min(xs.length, 30));
  const engagementSeries = s.map((x) => (x.views >= 100 ? x.engagement : null));
  const followerPts = s.map((x) => x.followers).filter((x): x is number => x !== null);
  const followerChart = followerPts.length >= 2 && Math.max(...followerPts) !== Math.min(...followerPts);
  const anyLikes = s.some((x) => x.likes > 0);
  const top = useMemo(() => [...d.videos].sort((a, b) => b.views - a.views)[0], [d.videos]);
  const posted = d.videos.length;
  const open = (url: string | null) => url && (tg?.openLink ? tg.openLink(url) : window.open(url, '_blank'));

  const hero = leadFollowers
    ? {label: 'Followers', icon: Icon.users, value: k.followers.value, delta: <Delta abs={k.followers.change} />, caption: range === 'all' ? 'in the last 30 days' : `in ${rangeWord}`, key: 'followers' as const}
    : {label: 'Views', icon: Icon.eye, value: k.views.value, delta: viewsDelta !== undefined ? <Delta ratio={viewsDelta} /> : null, caption: viewsDelta !== undefined ? `vs previous ${rangeWord}` : range === 'all' ? 'since you started' : 'first period with data', key: 'views' as const};
  const heroData = hero.key === 'followers' ? s.filter((x) => x.followers !== null) : s;

  return (
    <>
      <section className="card hero" aria-label={`${hero.label}: ${fmtFull(hero.value)}`}>
        <div className="hero-top">
          <div className="stat-label">
            <span className="stat-icon">{hero.icon}</span>
            {hero.label}
          </div>
        </div>
        <div className="hero-value">{fmtFull(hero.value)}</div>
        <div className="hero-delta">
          {hero.delta}
          <span className="muted">{hero.caption}</span>
        </div>
        {heroData.some((x) => (x[hero.key] ?? 0) > 0) ? (
          <div className="hero-chart">
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={heroData} margin={{top: 18, right: 0, left: 0, bottom: 0}}>
                <defs>
                  <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{stopColor: 'var(--accent)', stopOpacity: 0.16}} />
                    <stop offset="1" style={{stopColor: 'var(--accent)', stopOpacity: 0}} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="day" hide />
                <YAxis {...yAxis} tickFormatter={fmtNum} domain={hero.key === 'followers' ? ['dataMin', 'dataMax'] : [0, 'auto']} />
                <Tooltip content={(p) => <ChartTip {...p} fmt={fmtFull} />} cursor={{stroke: 'var(--line-strong)', strokeWidth: 1}} isAnimationActive={false} />
                <Area type="monotone" dataKey={hero.key} stroke="var(--accent)" strokeWidth={2} fill="url(#heroFill)" activeDot={{r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--accent)'}} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
            <AxisEnds days={heroData.map((x) => x.day)} />
          </div>
        ) : (
          <p className="chart-empty">No {hero.label.toLowerCase()} in this period yet.</p>
        )}
      </section>

      <Momentum d={d} />
      <GoalCard d={d} />

      <div className="stats">
        {leadFollowers ? (
          <Stat icon={Icon.eye} label="Views" value={fmtNum(k.views.value)} delta={viewsDelta !== undefined ? <Delta ratio={viewsDelta} /> : undefined} note="No earlier period" spark={tail(s.map((x) => x.views))} />
        ) : (
          <Stat icon={Icon.users} label="Followers" value={fmtNum(k.followers.value)} delta={k.followers.change ? <Delta abs={k.followers.change} /> : undefined} note="No change yet" spark={tail(s.map((x) => x.followers))} />
        )}
        <Stat icon={Icon.heart} label="Likes" value={fmtNum(k.likes.value)} delta={likesDelta !== undefined ? <Delta ratio={likesDelta} /> : undefined} note="No earlier period" spark={tail(s.map((x) => x.likes))} />
        <Stat icon={Icon.pulse} label="Engagement" value={fmtPct(k.engagement.value)} note="Likes, comments, shares per view" spark={tail(engagementSeries)} />
        <Stat icon={Icon.film} label="Videos posted" value={String(posted)} note={posted ? `${(posted / Math.max(1, days.length)).toFixed(1)} a day` : 'None in this period'} />
      </div>

      <NextPost d={d} big />

      <Records d={d} />

      {top && top.views > 0 && (
        <Card title="Top video" icon={Icon.trend} className="top">
          <button className="top-video" onClick={() => open(top.shareUrl)} aria-label={`${top.topic || top.caption}, ${fmtNum(top.views)} views. Open on TikTok`}>
            <div className="top-thumb">{top.thumb ? <img src={top.thumb} alt="" loading="lazy" /> : null}<span className="top-rank">#1</span></div>
            <div className="top-body">
              <div className="top-title">{top.topic || top.caption}</div>
              <div className="top-meta">
                {postedDate(top.postedAt, d.timezone)}
                {top.hookType && <> · {top.hookType} hook</>}
              </div>
              <div className="top-nums">
                <span><b>{fmtNum(top.views)}</b> views</span>
                <span><b>{fmtNum(top.likes)}</b> likes</span>
                <span><b>{fmtPct(top.engagement)}</b> eng.</span>
              </div>
              {top.viral && top.ratio ? <span className="chip chip-accent">{top.ratio.toFixed(1)}× your usual views</span> : null}
            </div>
            <span className="top-go">{Icon.external}</span>
          </button>
        </Card>
      )}

      <Card title="New followers" icon={Icon.users}>
        <div className="growth">
          <div><b className={k.growth.followers.day > 0 ? 'pos' : ''}>{signed(k.growth.followers.day)}</b><span>Today</span></div>
          <div><b className={k.growth.followers.week > 0 ? 'pos' : ''}>{signed(k.growth.followers.week)}</b><span>7 days</span></div>
          <div><b className={k.growth.followers.month > 0 ? 'pos' : ''}>{signed(k.growth.followers.month)}</b><span>30 days</span></div>
        </div>
        {followerChart && range !== 7 && !leadFollowers && (
          <div className="chart">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={s} margin={{top: 18, right: 0, left: 0, bottom: 0}}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="day" hide />
                <YAxis {...yAxis} tickFormatter={fmtNum} domain={['dataMin', 'dataMax']} />
                <Tooltip content={(p) => <ChartTip {...p} fmt={(v) => `${fmtFull(v)} followers`} />} cursor={{stroke: 'var(--line-strong)', strokeWidth: 1}} isAnimationActive={false} />
                <Area type="monotone" dataKey="followers" stroke="var(--accent-2)" strokeWidth={2} fill="var(--accent-2)" fillOpacity={0.1} connectNulls={false} activeDot={{r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--accent-2)'}} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
            <AxisEnds days={days} />
          </div>
        )}
      </Card>

      {anyLikes && (
        <Card title="Daily likes" icon={Icon.heart}>
          <div className="chart">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={s} margin={{top: 18, right: 0, left: 0, bottom: 0}} barCategoryGap={s.length > 40 ? 1 : 2}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="day" hide />
                <YAxis {...yAxis} tickFormatter={fmtNum} />
                <Tooltip content={(p) => <ChartTip {...p} fmt={(v) => `${fmtFull(v)} likes`} />} cursor={{fill: 'var(--grid)'}} isAnimationActive={false} />
                <Bar dataKey="likes" fill="var(--accent-2)" radius={[3, 3, 0, 0]} maxBarSize={14} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
            <AxisEnds days={days} />
          </div>
        </Card>
      )}

      {d.months.length > 0 && (
        <Card title="By month" icon={Icon.calendar}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Month</th><th>Videos</th><th>Views</th><th>Likes</th><th>Followers</th></tr>
              </thead>
              <tbody>
                {[...d.months].reverse().map((m) => (
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
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- library
type Unposted = Data['unposted'][number];
type Show = 'all' | 'posted' | 'unposted';
const UNPOSTED_LABEL: Record<string, string> = {
  rendering: 'Being made',
  awaiting_approval: 'Needs your OK',
  approved: 'Ready to post',
  publishing: 'Posting now',
  skipped: 'Not posted',
  failed: 'Did not post',
};

function Library({d, tg}: {d: Data; tg?: TelegramWebApp}) {
  const [sort, setSort] = useState<SortKey>('newest');
  const [show, setShow] = useState<Show>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [feedAt, setFeedAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const unposted = d.unposted ?? [];
  const posted = useMemo(() => {
    const by: Record<SortKey, (v: Video) => number> = {
      newest: (v) => new Date(v.postedAt).getTime(),
      views: (v) => v.views,
      likes: (v) => v.likes,
      engagement: (v) => v.engagement,
      velocity: (v) => v.velocity24h ?? -1,
    };
    return [...d.videos].sort((a, b) => by[sort](b) - by[sort](a));
  }, [d.videos, sort]);
  // "All" mixes both kinds, newest first; "Posted" keeps the chosen sort.
  const items = useMemo(() => {
    const p = posted.map((v) => ({kind: 'posted' as const, at: v.postedAt, v}));
    const u = unposted.map((v) => ({kind: 'unposted' as const, at: v.at, v}));
    const all = show === 'posted' ? p : show === 'unposted' ? u : [...p, ...u].sort((a, b) => b.at.localeCompare(a.at));
    const q = query.trim().toLowerCase();
    return q ? all.filter((it) => `${it.v.topic ?? ''} ${it.v.caption ?? ''}`.toLowerCase().includes(q)) : all;
  }, [posted, unposted, show, query]);
  const open = (url: string | null) => url && (tg?.openLink ? tg.openLink(url) : window.open(url, '_blank'));
  const sendToChat = async (v: Unposted) => {
    if (v.status === 'rendering') return setToast('This video is still being made.');
    setToast('Sending it to your chat…');
    const r = await fetch('/api/dashboard', {method: 'POST', headers: {'Content-Type': 'application/json', 'x-telegram-init-data': tg?.initData ?? ''}, body: JSON.stringify({send: v.id})}).catch(() => null);
    setToast(r?.ok ? 'Sent to your chat with Pip.' : 'Could not send it. Try /videos in the chat.');
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const total = d.videos.length + unposted.length;
  return (
    <>
      <Upcoming d={d} />
      {total > 0 && (
        <div className="seg seg-filter" role="tablist" aria-label="Which videos">
          {([['all', `All ${total}`], ['posted', `Posted ${d.videos.length}`], ['unposted', `Not posted ${unposted.length}`]] as [Show, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={show === id} onClick={() => setShow(id)}>{label}</button>
          ))}
        </div>
      )}
      {total > 4 && (
        <label className="search">
          {Icon.search}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your videos" aria-label="Search your videos" enterKeyHint="search" />
          {query ? <button onClick={() => setQuery('')} aria-label="Clear search">{Icon.close}</button> : null}
        </label>
      )}
      {show === 'posted' && posted.length > 1 && (
        <div className="library-bar">
          <span className="count">{posted.length} posted video{posted.length === 1 ? '' : 's'}</span>
          <label className="select">
            {Icon.sort}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort videos">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {!items.length && (
        <div className="card empty">
          <div className="state-icon">{Icon.film}</div>
          <h3>{query.trim() ? `No videos match “${query.trim()}”` : show === 'unposted' ? 'Every video was posted' : show === 'posted' && d.insights.n ? 'No videos posted in this period' : 'No videos yet'}</h3>
          <p>
            {query.trim()
              ? 'Try another word from the topic or caption.'
              : show === 'unposted'
              ? 'Videos you skip, that fail, or that wait for your OK show up here.'
              : show === 'posted' && d.insights.n
                ? 'Pick a longer range above to see older videos.'
                : 'Each video shows up here once Pip makes it, posted or not.'}
          </p>
        </div>
      )}
      <div className="library">
        {items.map((it) =>
          it.kind === 'posted' ? (
            <button key={it.v.id} className="clip" onClick={() => setFeedAt(items.indexOf(it))} aria-label={`${it.v.topic || it.v.caption}, ${fmtNum(it.v.views)} views. Play`}>
              <div className="frame">
                {it.v.thumb ? <img src={it.v.thumb} alt="" loading="lazy" /> : null}
                <div className="frame-tags">
                  {it.v.viral ? <span className="tag tag-accent">{it.v.ratio ? `${it.v.ratio.toFixed(1)}×` : 'Top'}</span> : null}
                  {it.v.experiment ? <span className="tag">Test</span> : null}
                </div>
                <span className="frame-views">{Icon.eye}{fmtNum(it.v.views)}</span>
              </div>
              <div className="clip-body">
                <span className="clip-title">{it.v.topic || it.v.caption}</span>
                <span className="clip-meta">
                  <span>{postedDate(it.v.postedAt, d.timezone)}</span>
                  <span className="clip-stat">{Icon.heart}{fmtNum(it.v.likes)}</span>
                  <span className="clip-stat">{Icon.comment}{fmtNum(it.v.comments)}</span>
                </span>
              </div>
            </button>
          ) : (
            <button key={it.v.id} className="clip clip-unposted" onClick={() => setFeedAt(items.indexOf(it))} aria-label={`${it.v.topic || it.v.caption || (it.v.test ? 'Test video' : 'Untitled video')}, ${it.v.test ? 'test video' : UNPOSTED_LABEL[it.v.status] ?? it.v.status}. Play`}>
              <div className="frame">
                {it.v.thumb ? <img src={it.v.thumb} alt="" loading="lazy" /> : null}
                <div className="frame-tags">
                  <span className={`tag tag-status tag-${it.v.test ? 'test' : it.v.status}`}>{it.v.test ? 'Test video' : UNPOSTED_LABEL[it.v.status] ?? it.v.status}</span>
                </div>
                <span className="frame-views">{it.v.playable ? <>{Icon.play}Play</> : <>{Icon.send}Watch in chat</>}</span>
              </div>
              <div className="clip-body">
                <span className="clip-title">{it.v.topic || it.v.caption || (it.v.test ? 'Test video' : 'Untitled video')}</span>
                <span className="clip-meta">
                  <span>{postedDate(it.v.at, d.timezone)}</span>
                  <span>Not on TikTok</span>
                </span>
              </div>
            </button>
          ),
        )}
      </div>
      {feedAt !== null && items.length ? (
        <Feed
          items={items}
          start={Math.min(feedAt, items.length - 1)}
          tz={d.timezone}
          src={(id) => `/api/video?id=${encodeURIComponent(id)}&t=${encodeURIComponent(d.playToken ?? '')}`}
          onClose={() => setFeedAt(null)}
          onOpen={open}
          onSend={sendToChat}
        />
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

type FeedItem = {kind: 'posted'; v: Video} | {kind: 'unposted'; v: Unposted};
const dayTime = (iso: string, tz: string) => {
  const t = new Date(iso).toLocaleTimeString('en-GB', {timeZone: safeTz(tz), hour: '2-digit', minute: '2-digit'});
  return `${postedDate(iso, tz)} at ${t}`;
};

/**
 * TikTok-style feed: one video per screen, swipe up and down, the one on screen plays on its own.
 * Only the video on screen and its neighbours get a source, so scrolling stays light on data.
 */
function Feed({items, start, tz, src, onClose, onOpen, onSend}: {items: FeedItem[]; start: number; tz: string; src: (id: string) => string; onClose: () => void; onOpen: (url: string | null) => void; onSend: (v: Unposted) => void}) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(start);
  const [muted, setMuted] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = start * el.clientHeight;
  }, [start]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const onScroll = () => {
    const el = box.current;
    if (!el || !el.clientHeight) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active) setActive(Math.max(0, Math.min(items.length - 1, i)));
  };
  // Portal to <body>: the tab view animates with a transform, which would trap a fixed overlay inside it.
  return createPortal(
    <div className="feed" role="dialog" aria-modal="true" aria-label="Your videos">
      <div className="feed-top">
        <button className="feed-btn" onClick={onClose} aria-label="Close">{Icon.close}</button>
        <span className="feed-count">{active + 1} / {items.length}</span>
        <button className="feed-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Sound on' : 'Sound off'}>{muted ? Icon.muted : Icon.sound}</button>
      </div>
      <div className="feed-scroll" ref={box} onScroll={onScroll}>
        {items.map((it, i) => (
          <Slide key={it.v.id} it={it} tz={tz} src={src} active={i === active} near={Math.abs(i - active) <= 1} muted={muted} onAutoMute={() => setMuted(true)} onOpen={onOpen} onSend={onSend} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Slide({it, tz, src, active, near, muted, onAutoMute, onOpen, onSend}: {it: FeedItem; tz: string; src: (id: string) => string; active: boolean; near: boolean; muted: boolean; onAutoMute: () => void; onOpen: (url: string | null) => void; onSend: (v: Unposted) => void}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const v = it.v;
  const title = v.topic || v.caption || (it.kind === 'unposted' && it.v.test ? 'Test video' : 'Untitled video');
  const playable = v.playable && !failed;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.pause();
      return;
    }
    setPaused(false);
    // Phones block autoplay with sound until the user taps; then play muted and show the sound button.
    el.play().catch(() => {
      el.muted = true;
      onAutoMute();
      el.play().catch(() => setPaused(true));
    });
  }, [active, near]);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().then(() => setPaused(false)).catch(() => undefined);
    else (el.pause(), setPaused(true));
  };
  return (
    <section className="slide">
      {playable && near ? (
        <video
          ref={ref}
          src={src(v.id)}
          poster={v.thumb ?? undefined}
          preload="auto"
          playsInline
          loop
          muted={muted}
          onClick={toggle}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          onError={() => setFailed(true)}
        />
      ) : v.thumb ? (
        <img className="slide-still" src={v.thumb} alt="" loading="lazy" />
      ) : (
        <div className="slide-still" />
      )}
      {playable && active && waiting && <span className="slide-spin" aria-label="Loading" />}
      {playable && paused && !waiting && <span className="slide-paused" aria-hidden="true">{Icon.play}</span>}
      {!playable && (
        <div className="slide-cta">
          {it.kind === 'posted' ? (
            <button className="btn" onClick={() => onOpen(it.v.shareUrl)}>Watch on TikTok</button>
          ) : it.v.status === 'rendering' ? (
            <p>Pip is still making this video.</p>
          ) : (
            <button className="btn" onClick={() => onSend(it.v)}>Send to chat</button>
          )}
        </div>
      )}

      {it.kind === 'posted' && (
        <div className="rail">
          <span>{Icon.eye}<b>{fmtNum(it.v.views)}</b></span>
          <span>{Icon.heart}<b>{fmtNum(it.v.likes)}</b></span>
          <span>{Icon.comment}<b>{fmtNum(it.v.comments)}</b></span>
          <span>{Icon.share}<b>{fmtNum(it.v.shares)}</b></span>
          {it.v.shareUrl ? <button onClick={() => onOpen(it.v.shareUrl)} aria-label="Open on TikTok">{Icon.external}<b>TikTok</b></button> : null}
        </div>
      )}
      <div className="slide-info">
        <div className="slide-tags">
          {it.kind === 'posted' ? (
            <>
              <span className="tag tag-accent">Posted</span>
              {it.v.viral && it.v.ratio ? <span className="tag">{it.v.ratio.toFixed(1)}× usual</span> : null}
              {it.v.experiment ? <span className="tag">Test</span> : null}
            </>
          ) : (
            <span className={`tag tag-status tag-${it.v.test ? 'test' : it.v.status}`}>{it.v.test ? 'Test video' : UNPOSTED_LABEL[it.v.status] ?? it.v.status}</span>
          )}
        </div>
        <h3 className="slide-title">{title}</h3>
        <p className="slide-when">
          {Icon.calendar}
          {it.kind === 'posted' ? dayTime(it.v.postedAt, tz) : `${it.v.test ? 'Made' : 'Planned for'} ${dayTime(it.v.at, tz)}`}
        </p>
        {it.kind === 'posted' && (
          <p className="slide-stats">
            <b>{fmtPct(it.v.engagement)}</b> engagement
            {it.v.velocity24h !== null && it.v.velocity24h !== undefined ? <> · <b>{fmtNum(it.v.velocity24h)}</b> views in first 24h</> : null}
            {it.v.hookType ? <> · {it.v.hookType} hook</> : null}
          </p>
        )}
      </div>
      {playable && <i className="slide-bar" style={{transform: `scaleX(${progress})`}} aria-hidden="true" />}
    </section>
  );
}

// ---------------------------------------------------------------- insights
function Insights({d}: {d: Data}) {
  const ins = d.insights;
  const min = ins.minVideos ?? 15;
  if (ins.n === 0)
    return (
      <div className="card empty">
        <div className="state-icon">{Icon.trend}</div>
        <h3>Insights start after your first videos</h3>
        <p>Pip compares your videos to find which topics, hooks and posting times work best for your channel.</p>
        <Meter n={0} min={min} />
      </div>
    );
  const max = Math.max(1, ...ins.heatmap.flat().map((x) => x ?? 0));
  const anyHeat = ins.heatmap.some((r) => r.some((c) => c !== null));
  return (
    <>
      {ins.tooSmall && (
        <div className="card note">
          <div className="note-head">
            <span className="card-icon">{Icon.info}</span>
            <b>Early days</b>
          </div>
          <p>Patterns get reliable after {min} videos. Treat these as first hints.</p>
          <Meter n={ins.n} min={min} />
        </div>
      )}
      <BestSlot d={d} />
      <Card title="What's working" icon={Icon.trend} aside={ins.weekStart ? <span className="muted small">Week of {shortDay(ins.weekStart)}</span> : null}>
        {ins.summary ? <p className="summary">{ins.summary}</p> : <p className="muted">Your first weekly report arrives on Monday.</p>}
        {ins.patterns.length > 0 && (
          <ul className="patterns">
            {ins.patterns.slice(0, 6).map((p) => (
              <li key={p.feature + p.value}>
                <span className={`lift ${p.lift >= 1 ? 'up' : 'down'}`}>{p.lift >= 1 ? '▲' : '▼'} {p.lift.toFixed(1)}×</span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {ins.changes.length > 0 && (
        <Card title="Changes for next week" icon={Icon.check}>
          <ul className="changes">{ins.changes.map((c) => <li key={c}><span className="tick">{Icon.check}</span>{c}</li>)}</ul>
        </Card>
      )}
      <Card title="Best posting times" icon={Icon.clock}>
        <p className="muted small">Median views by day and hour, {d.timezone.replace(/_/g, ' ')}.</p>
        {anyHeat ? (
          <>
            <div className="heat" role="img" aria-label="Heatmap of median views by weekday and hour">
              <div className="hrow head">
                <span />
                {Array.from({length: 24}, (_, h) => <span key={h}>{h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
              </div>
              {ins.heatmap.map((row, wd) => (
                <div key={wd} className="hrow">
                  <span className="hday">{DAYS[wd]}</span>
                  {row.map((c, h) => (
                    <span key={h} className={`cell${c === null ? ' cell-none' : ''}`} title={c === null ? `${DAYS[wd]} ${h}:00 · no videos` : `${DAYS[wd]} ${h}:00 · ${fmtNum(c)} median views`} style={c === null ? undefined : {background: `color-mix(in oklab, var(--accent) ${Math.round(30 + 70 * (c / max))}%, var(--surface-2))`}} />
                  ))}
                </div>
              ))}
            </div>
            <div className="heat-legend" aria-hidden="true">
              <span>Fewer views</span>
              <i style={{background: 'linear-gradient(90deg, color-mix(in oklab, var(--accent) 30%, var(--surface-2)), var(--accent))'}} />
              <span>More</span>
            </div>
          </>
        ) : (
          <p className="muted">Not enough videos yet.</p>
        )}
      </Card>
      <Ranked title="Best topics" rows={ins.bestTopics} />
      <Ranked title="Best hooks" rows={ins.bestHooks} />
    </>
  );
}

function Meter({n, min}: {n: number; min: number}) {
  return (
    <div className="meter">
      <div className="meter-bar" role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(n, min)}>
        <i style={{width: `${Math.min(100, (100 * n) / min)}%`}} />
      </div>
      <span>{Math.min(n, min)} of {min} videos</span>
    </div>
  );
}

function Ranked({title, rows}: {title: string; rows: {label: string; medianViews: number; n: number}[]}) {
  const max = Math.max(1, ...rows.map((r) => r.medianViews));
  return (
    <Card title={title} aside={rows.length ? <span className="muted small">Median views</span> : null}>
      {!rows.length && <p className="muted">Not enough videos yet.</p>}
      <ul className="ranked">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="rank-top">
              <span className="rank-label">{r.label}</span>
              <span className="rank-num"><b>{fmtNum(r.medianViews)}</b> · {r.n} video{r.n === 1 ? '' : 's'}</span>
            </div>
            <div className="bar"><i className={i === 0 ? 'lead' : ''} style={{width: `${(100 * r.medianViews) / max}%`}} /></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- loading
function Skeleton() {
  return (
    <div className="app" role="status" aria-label="Loading your channel">
      <div className="profile">
        <div className="profile-row">
          <div className="avatar sk" />
          <div className="profile-text">
            <div className="sk sk-line" style={{width: 140}} />
            <div className="sk sk-line sm" style={{width: 100}} />
          </div>
        </div>
      </div>

      <div className="range-row"><div className="sk sk-line" style={{width: 110}} /><div className="sk" style={{width: 168, height: 36, borderRadius: 10}} /></div>
      <div className="view">
      <div className="card hero"><div className="sk sk-line sm" style={{width: 70}} /><div className="sk" style={{width: 150, height: 40, margin: '12px 0'}} /><div className="sk" style={{height: 170}} /></div>
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="stat"><div className="sk sk-line sm" style={{width: 70}} /><div className="sk" style={{width: 80, height: 26, marginTop: 10}} /><div className="sk" style={{height: 32, marginTop: 16}} /></div>)}</div>
      </div>
    </div>
  );
}
