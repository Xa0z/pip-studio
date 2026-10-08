import {useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import type {DashboardResponse} from '../../studio/lib/analytics';
import {Icon} from './icons';
import type {TelegramWebApp} from './main';

type Data = DashboardResponse;
type Video = Data['videos'][number];
type Range = 7 | 30 | 90 | 'all';
type Tab = 'home' | 'library' | 'goals' | 'insights' | 'schedule';
type SortKey = 'newest' | 'views' | 'likes' | 'engagement' | 'velocity';

/** Bottom bar: two tabs, the raised Goals button in the middle, two tabs. */
const NAV: {id: Tab; label: string; icon: ReactNode}[] = [
  {id: 'home', label: 'Home', icon: Icon.home},
  {id: 'library', label: 'Library', icon: Icon.film},
  {id: 'goals', label: 'Goals', icon: Icon.target},
  {id: 'insights', label: 'Insights', icon: Icon.trend},
  {id: 'schedule', label: 'Schedule', icon: Icon.calendar},
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
const STATUS_LABEL: Record<string, string> = {planned: 'Planned', rendering: 'Being made', awaiting_approval: 'Needs your OK', approved: 'Approved', publishing: 'Posting now'};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
  const [tab, setTab] = useState<Tab>('home');
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
  const go = (t: Tab) => {
    pick(setTab, t);
    window.scrollTo({top: 0});
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

  const onRange = (r: Range) => pick(setRange, r);
  return (
    <div className={`app${loading ? ' is-loading' : ''}`} aria-busy={loading}>
      <TopBar d={data} loading={loading} onRefresh={() => pick(setAttempt, attempt + 1)} />
      <main key={tab} className="view">
        {tab === 'home' && <Home d={data} range={range} onRange={onRange} go={go} tg={tg} />}
        {tab === 'library' && <Library d={data} tg={tg} range={range} onRange={onRange} />}
        {tab === 'goals' && <Goals d={data} />}
        {tab === 'insights' && <Insights d={data} />}
        {tab === 'schedule' && <Schedule d={data} />}
      </main>
      <footer className="foot">
        Updated {when(data.generatedAt, data.timezone, data.generatedAt).time} · times in {data.timezone.replace(/_/g, ' ')}
      </footer>
      <nav className="dock" aria-label="Sections">
        <div className="dock-in" role="tablist">
          {NAV.map((t) => (
            <button key={t.id} role="tab" className={t.id === 'goals' ? 'dock-main' : undefined} aria-selected={tab === t.id} aria-label={t.label} title={t.label} onClick={() => go(t.id)}>
              {t.icon}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces
/** Headline in two voices: a sans first line and a serif second line. */
function PageHead({top, accent, text}: {top: string; accent: string; text?: string}) {
  return (
    <header className="page-head">
      <h1>
        {top}
        <em>{accent}</em>
      </h1>
      {text && <p>{text}</p>}
    </header>
  );
}

/** Numbered section title, like "1  Best time to post". */
function Section({n, title, children}: {n: number; title: string; children: ReactNode}) {
  return (
    <section className="section">
      <h2 className="section-title"><span>{n}</span>{title}</h2>
      {children}
    </section>
  );
}

function Tile({label, icon, children, className = '', aside}: {label?: string; icon?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode}) {
  return (
    <section className={`tile ${className}`}>
      {(label || aside) && (
        <header className="tile-head">
          <span className="tile-label">{icon}{label}</span>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** Small "+12%" / "−3" badge. `ratio` is a relative change (0.24 = +24%), `abs` an absolute one. */
function Badge({ratio, abs}: {ratio?: number; abs?: number}) {
  const v = ratio ?? abs ?? 0;
  if (!Number.isFinite(v)) return null;
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  // Past +900% a percentage stops meaning much; say "12×" instead.
  const text =
    ratio !== undefined && ratio > 9
      ? `${Math.round(ratio + 1)}×`
      : ratio !== undefined
        ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(ratio * 100) >= 10 ? Math.round(Math.abs(ratio * 100)) : Math.abs(ratio * 100).toFixed(1).replace(/\.0$/, '')}%`
        : signed(v);
  return (
    <span className={`badge ${dir}`}>
      <span className="sr">{dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'no change'} </span>
      {text}
    </span>
  );
}
const change = (now: number, prev: number) => (prev > 0 ? (now - prev) / prev : undefined);

function RangePills({range, onRange}: {range: Range; onRange: (r: Range) => void}) {
  return (
    <div className="ranges" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button key={String(r.id)} aria-pressed={range === r.id} aria-label={r.title} onClick={() => onRange(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** 30-ish point trend line for stat tiles. Hidden when there is nothing to show. */
function Spark({values}: {values: (number | null)[]}) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return null;
  const xs = values.length - 1 || 1;
  const min = Math.min(...pts.map((p) => p[1]));
  const max = Math.max(...pts.map((p) => p[1]));
  const y = (v: number) => (max === min ? 20 : 28 - ((v - min) / (max - min)) * 24);
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${((i / xs) * 100).toFixed(2)},${y(v).toFixed(2)}`).join('');
  return (
    <div className="spark" aria-hidden="true">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none">
        <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
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

function TopBar({d, loading, onRefresh}: {d: Data; loading: boolean; onRefresh: () => void}) {
  const a = d.account;
  const name = a.displayName || a.username || 'Your channel';
  const s = d.schedule;
  const live = !!s && s.times.length > 0;
  return (
    <div className="topbar">
      <span className="who">
        {a.avatar ? <img className="who-avatar" src={a.avatar} alt="" /> : <span className="who-avatar ph" aria-hidden="true">{name[0]?.toUpperCase()}</span>}
        <span className="who-name">{a.username ? `@${a.username}` : name}</span>
      </span>
      <span className="topbar-end">
        <span className={`live${live ? '' : ' off'}`} title={live ? (s!.mode === 'auto' ? 'Autopilot on' : 'Running') : 'Paused'}>
          <i aria-hidden="true" />
          {live ? (s!.mode === 'auto' ? 'Autopilot' : 'Running') : 'Paused'}
        </span>
        <button className={`round${loading ? ' spinning' : ''}`} onClick={onRefresh} disabled={loading} aria-label="Refresh">{Icon.refresh}</button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- goals math
/** TikTok's Creator Rewards bar: 10,000 followers and 100,000 views in the last 30 days. */
const REWARDS = {followers: 10_000, views: 100_000};
const STREAK_GOAL = 7;
const MILESTONES = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 10_000_000) * 10_000_000;
const daysTo = (left: number, perDay: number) => (left <= 0 ? 0 : perDay > 0 ? Math.ceil(left / perDay) : null);
const etaShort = (days: number | null) => (days === null ? 'Not yet' : days === 0 ? 'Done' : days <= 1 ? '~1 day' : days > 365 ? '1 year +' : `~${days} days`);

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

type GoalRow = {id: string; icon: ReactNode; title: string; sub: string; value: number; target: number; perDay: number | null; fmt: (n: number) => string};
function goalRows(d: Data): GoalRow[] {
  const followers = d.account.followers;
  const views30 = d.kpis.growth.views.month;
  const followersPerDay = d.kpis.growth.followers.week / 7;
  const rewards = d.goal === 'creator_rewards';
  const fTarget = rewards ? REWARDS.followers : nextMilestone(followers);
  const vTarget = rewards ? REWARDS.views : nextMilestone(views30);
  return [
    {id: 'followers', icon: Icon.users, title: rewards ? `${fmtNum(fTarget)} followers` : `Reach ${fmtNum(fTarget)} followers`, sub: rewards ? 'Creator Rewards · Followers' : 'Next milestone · Followers', value: followers, target: fTarget, perDay: followersPerDay, fmt: fmtFull},
    {id: 'views', icon: Icon.eye, title: `${fmtNum(vTarget)} views in 30 days`, sub: rewards ? 'Creator Rewards · Views' : 'Next milestone · Views', value: views30, target: vTarget, perDay: null, fmt: fmtFull},
    {id: 'streak', icon: Icon.calendar, title: `Post ${STREAK_GOAL} days in a row`, sub: 'Habit · Posting streak', value: Math.min(postingStreak(d), STREAK_GOAL), target: STREAK_GOAL, perDay: 1, fmt: (n) => `${n} day${n === 1 ? '' : 's'}`},
  ];
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
  if (c.soon) return <span className="count">Any minute</span>;
  const days = Math.floor(c.h / 24);
  return (
    <span className="count" aria-label={`in ${c.h} hours ${c.m} minutes`}>
      {days >= 2 ? (
        <>{days}<small>days</small></>
      ) : (
        <>
          {c.h > 0 && <>{c.h}<small>h</small></>}
          {String(c.m).padStart(c.h > 0 ? 2 : 1, '0')}<small>m</small>
        </>
      )}
    </span>
  );
}

/** The soft light-blue card: one message from Pip and one action. */
function Nudge({kicker, icon, title, children, action}: {kicker: string; icon: ReactNode; title: ReactNode; children?: ReactNode; action?: {label: string; onClick: () => void}}) {
  return (
    <section className="nudge">
      <span className="nudge-kicker">{icon}{kicker}</span>
      <div className="nudge-row">
        <h3 className="nudge-title">{title}</h3>
        {action && <button className="nudge-btn" onClick={action.onClick}>{action.label}</button>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- home
function Home({d, range, onRange, go, tg}: {d: Data; range: Range; onRange: (r: Range) => void; go: (t: Tab) => void; tg?: TelegramWebApp}) {
  if (d.insights.n === 0) return <Welcome d={d} go={go} />;
  const k = d.kpis;
  const s = d.series;
  const rangeTitle = RANGES.find((r) => r.id === range)!.title;
  const leadFollowers = d.goal === 'followers';
  const viewsDelta = change(k.views.value, k.views.prev);
  const likesDelta = change(k.likes.value, k.likes.prev);
  const tail = (xs: (number | null)[]) => xs.slice(-Math.min(xs.length, 30));
  const top = [...d.videos].sort((a, b) => b.views - a.views)[0];
  const open = (url: string | null) => url && (tg?.openLink ? tg.openLink(url) : window.open(url, '_blank'));
  const hero = leadFollowers
    ? {label: 'Followers', value: k.followers.value, badge: <Badge abs={k.followers.change} />, caption: range === 'all' ? 'in the last 30 days' : `in ${range} days`, key: 'followers' as const}
    : {label: 'Total views', value: k.views.value, badge: viewsDelta !== undefined ? <Badge ratio={viewsDelta} /> : null, caption: viewsDelta !== undefined ? `vs the ${range === 'all' ? 'period' : `${range} days`} before` : range === 'all' ? 'since you started' : 'first period with data', key: 'views' as const};
  const heroData = hero.key === 'followers' ? s.filter((x) => x.followers !== null) : s;
  const goal = goalRows(d)[0];
  const eta = daysTo(goal.target - goal.value, goal.perDay ?? 0);
  const next = d.schedule?.upcoming[0];
  const nextAt = next?.slotAt ?? d.schedule?.nextSlot;

  return (
    <>
      <section className="balance" aria-label={`${hero.label}: ${fmtFull(hero.value)}`}>
        <span className="balance-label">{hero.label} <i>·</i> {rangeTitle}</span>
        <div className="balance-value">{fmtFull(hero.value)}</div>
        <div className="balance-delta">{hero.badge}<span>{hero.caption}</span></div>
      </section>
      {heroData.some((x) => (x[hero.key] ?? 0) > 0) ? (
        <div className="big-chart">
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={heroData} margin={{top: 8, right: 0, left: 0, bottom: 0}}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={hero.key === 'followers' ? ['dataMin', 'dataMax'] : [0, 'auto']} />
              <Tooltip content={(p) => <ChartTip {...p} fmt={fmtFull} />} cursor={{stroke: 'var(--text)', strokeWidth: 1, strokeDasharray: '3 3'}} isAnimationActive={false} />
              <Area type="linear" dataKey={hero.key} stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.22} activeDot={{r: 5, stroke: 'var(--bg)', strokeWidth: 2, fill: 'var(--text)'}} animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="chart-empty">No {hero.label.toLowerCase()} in this period yet.</p>
      )}
      <RangePills range={range} onRange={onRange} />

      <div className="tiles">
        {leadFollowers ? (
          <Tile label="Views" icon={Icon.eye}>
            <div className="tile-badge">{viewsDelta !== undefined ? <Badge ratio={viewsDelta} /> : <span className="badge flat">New</span>}</div>
            <div className="tile-value">{fmtNum(k.views.value)}</div>
            <Spark values={tail(s.map((x) => x.views))} />
          </Tile>
        ) : (
          <Tile label="Followers" icon={Icon.users}>
            <div className="tile-badge"><Badge abs={k.followers.change} /></div>
            <div className="tile-value">{fmtNum(k.followers.value)}</div>
            <Spark values={tail(s.map((x) => x.followers))} />
          </Tile>
        )}
        <Tile label="Likes" icon={Icon.heart}>
          <div className="tile-badge">{likesDelta !== undefined ? <Badge ratio={likesDelta} /> : <span className="badge flat">New</span>}</div>
          <div className="tile-value">{fmtNum(k.likes.value)}</div>
          <Spark values={tail(s.map((x) => x.likes))} />
        </Tile>
        <Tile label="Engagement" icon={Icon.pulse}>
          <div className="tile-badge"><span className="badge flat">per view</span></div>
          <div className="tile-value">{fmtPct(k.engagement.value)}</div>
          <Spark values={tail(s.map((x) => (x.views >= 100 ? x.engagement : null)))} />
        </Tile>
        <Tile label="Posted" icon={Icon.film}>
          <div className="tile-badge"><span className="badge flat">{d.videos.length ? `${(d.videos.length / Math.max(1, s.length)).toFixed(1)} a day` : 'None yet'}</span></div>
          <div className="tile-value">{d.videos.length}</div>
          <p className="tile-note">videos in this period</p>
        </Tile>
      </div>

      <Nudge
        kicker="Pip forecast"
        icon={Icon.target}
        title={eta === 0 ? `You reached ${fmtNum(goal.target)} followers!` : <>How soon can you reach <b>{fmtNum(goal.target)}</b> followers?</>}
        action={{label: 'Find out', onClick: () => go('goals')}}
      />

      <Today d={d} />

      {nextAt && (
        <Tile label="Next post" icon={Icon.clock} aside={next ? <span className={`chip status-${next.status}`}>{STATUS_LABEL[next.status] ?? next.status}</span> : null} className="next-tile">
          <button className="row-link" onClick={() => go('schedule')}>
            <span>
              <b className="next-when">{when(nextAt, d.timezone, d.generatedAt).day} at {when(nextAt, d.timezone, d.generatedAt).time}</b>
              {next?.topic && <span className="next-topic">{next.topic}</span>}
            </span>
            {Icon.chevron}
          </button>
        </Tile>
      )}

      {top && top.views > 0 && (
        <Tile label="Top video" icon={Icon.trend}>
          <button className="top-video" onClick={() => open(top.shareUrl)} aria-label={`${top.topic || top.caption}, ${fmtNum(top.views)} views. Open on TikTok`}>
            <div className="top-thumb">{top.thumb ? <img src={top.thumb} alt="" loading="lazy" /> : null}<span className="top-rank">#1</span></div>
            <div className="top-body">
              <div className="top-title">{top.topic || top.caption}</div>
              <div className="top-meta">{postedDate(top.postedAt, d.timezone)}{top.hookType && <> · {top.hookType} hook</>}</div>
              <div className="top-nums">
                <span><b>{fmtNum(top.views)}</b> views</span>
                <span><b>{fmtNum(top.likes)}</b> likes</span>
              </div>
              {top.viral && top.ratio ? <span className="badge up">{top.ratio.toFixed(1)}× your usual</span> : null}
            </div>
          </button>
        </Tile>
      )}

      <Records d={d} />
      <MoreCharts d={d} range={range} />
    </>
  );
}

function Today({d}: {d: Data}) {
  const g = d.kpis.growth;
  const streak = postingStreak(d);
  const perDay = g.followers.week / 7;
  return (
    <div className="tiles tiles-4" aria-label="Today">
      <div className="mini"><span>Views today</span><b>{signed(g.views.day)}</b></div>
      <div className="mini"><span>Followers today</span><b>{signed(g.followers.day)}</b></div>
      <div className="mini"><span>Posting streak</span><b>{streak}<small> day{streak === 1 ? '' : 's'}</small></b></div>
      <div className="mini"><span>New followers a day</span><b>{perDay >= 10 ? fmtNum(Math.round(perDay)) : perDay.toFixed(1).replace(/\.0$/, '')}</b></div>
    </div>
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
    <Tile label="Your records" icon={Icon.trophy} aside={<span className="tile-aside">This period</span>}>
      <ul className="list">
        {rows.map((x) => (
          <li key={x.label}>
            <span>{x.label}<small>{shortDay(x.day)}</small></span>
            <b>{x.value}</b>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function MoreCharts({d, range}: {d: Data; range: Range}) {
  const s = d.series;
  const k = d.kpis;
  const followerPts = s.map((x) => x.followers).filter((x): x is number => x !== null);
  const followerChart = followerPts.length >= 2 && Math.max(...followerPts) !== Math.min(...followerPts) && range !== 7 && d.goal !== 'followers';
  const anyLikes = s.some((x) => x.likes > 0);
  return (
    <>
      <Tile label="New followers" icon={Icon.users}>
        <div className="growth">
          <div><b>{signed(k.growth.followers.day)}</b><span>Today</span></div>
          <div><b>{signed(k.growth.followers.week)}</b><span>7 days</span></div>
          <div><b>{signed(k.growth.followers.month)}</b><span>30 days</span></div>
        </div>
        {followerChart && (
          <div className="chart">
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={s} margin={{top: 8, right: 0, left: 0, bottom: 0}}>
                <XAxis dataKey="day" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip content={(p) => <ChartTip {...p} fmt={(v) => `${fmtFull(v)} followers`} />} cursor={{stroke: 'var(--text)', strokeWidth: 1, strokeDasharray: '3 3'}} isAnimationActive={false} />
                <Area type="linear" dataKey="followers" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.18} connectNulls={false} activeDot={{r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--text)'}} animationDuration={500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Tile>
      {anyLikes && (
        <Tile label="Daily likes" icon={Icon.heart}>
          <div className="chart">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={s} margin={{top: 8, right: 0, left: 0, bottom: 0}} barCategoryGap={s.length > 40 ? 1 : 2}>
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip content={(p) => <ChartTip {...p} fmt={(v) => `${fmtFull(v)} likes`} />} cursor={{fill: 'var(--surface-2)'}} isAnimationActive={false} />
                <Bar dataKey="likes" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={14} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tile>
      )}
      {d.months.length > 0 && (
        <Tile label="By month" icon={Icon.calendar}>
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
        </Tile>
      )}
    </>
  );
}

// ---------------------------------------------------------------- home: first run
function Welcome({d, go}: {d: Data; go: (t: Tab) => void}) {
  const s = d.schedule;
  const approval = (s?.mode ?? 'approval') === 'approval';
  const at = s?.upcoming[0]?.slotAt ?? s?.nextSlot;
  const w = at ? when(at, d.timezone, d.generatedAt) : null;
  const steps = [
    {title: 'Pip makes the video', text: 'Script, voice and edit, ready before the posting time.'},
    ...(approval ? [{title: 'You approve it', text: 'It arrives in the chat. Tap Approve, or skip it.'}] : []),
    {title: 'It posts to TikTok', text: w ? `${w.day} at ${w.time}.` : 'At your next posting time.'},
    {title: 'Stats show up here', text: 'First numbers about an hour after posting, then they update through the day.'},
  ];
  return (
    <>
      <section className="balance">
        <span className="balance-label">{at ? 'Your first video goes live in' : 'No posting times yet'}</span>
        <div className="balance-value">{at ? <Countdown iso={at} /> : '—'}</div>
        <div className="balance-delta">{w ? <span>{w.day} at {w.time}</span> : <span>Send /settings in the bot to pick times.</span>}</div>
      </section>
      {s && s.times.length > 0 && (
        <div className="ranges static" aria-label="Posting times">
          {s.times.map((t) => <span key={t}>{t}</span>)}
        </div>
      )}
      <Nudge kicker="Pip forecast" icon={Icon.target} title={<>How soon can you reach <b>{fmtNum(goalRows(d)[0].target)}</b> followers?</>} action={{label: 'Goals', onClick: () => go('goals')}} />
      <Section n={1} title="What happens next">
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
      </Section>
      <Section n={2} title="Your stats">
        <div className="tiles">
          {[['Views', Icon.eye], ['Followers', Icon.users], ['Likes', Icon.heart], ['Engagement', Icon.pulse]].map(([label, icon]) => (
            <Tile key={label as string} label={label as string} icon={icon as ReactNode} className="ghost">
              <div className="tile-value">—</div>
              <p className="tile-note">After the first post</p>
            </Tile>
          ))}
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- goals
function Goals({d}: {d: Data}) {
  const rows = goalRows(d);
  const open = rows.filter((g) => g.value < g.target);
  const main = rows[0];
  const perDay = main.perDay ?? 0;
  const eta = daysTo(main.target - main.value, perDay);
  const count = open.length;
  return (
    <>
      <PageHead
        top={count ? `You have ${count}` : 'You reached'}
        accent={count ? `goal${count === 1 ? '' : 's'} in progress` : 'every goal'}
        text="Pip tracks these from your TikTok numbers. Time estimates use your pace from the last 7 days."
      />
      <section className="nudge">
        <span className="nudge-kicker">{Icon.trend}{eta === 0 ? 'Goal reached' : perDay > 0 ? "You're on your way" : 'Getting started'}</span>
        <p className="nudge-text">
          {eta === 0
            ? `You passed ${fmtFull(main.target)} followers.`
            : perDay > 0
              ? `At ${perDay >= 10 ? fmtNum(Math.round(perDay)) : perDay.toFixed(1)} new followers a day, you reach ${fmtFull(main.target)} followers in about ${eta} day${eta === 1 ? '' : 's'}.`
              : 'Once followers start coming in, Pip shows how long the goal takes at your pace.'}
        </p>
        <div className="scale" aria-hidden="true">
          <span>{fmtNum(main.value)}</span>
          <b>{etaShort(eta)}</b>
          <span>{fmtNum(main.target)}</span>
        </div>
      </section>
      <ul className="goals">
        {rows.map((g) => {
          const pct = Math.min(1, g.target ? g.value / g.target : 0);
          return (
            <li key={g.id} className="goal">
              <div className="goal-top">
                <span className="goal-icon">{g.icon}</span>
                <span className="goal-text">
                  <b>{g.title}</b>
                  <small>{g.sub}</small>
                </span>
                {pct >= 1 ? <span className="badge up">Done</span> : <span className="goal-pct">{Math.floor(pct * 100)}%</span>}
              </div>
              <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={Math.min(g.value, g.target)} aria-label={g.title}>
                <i style={{width: `${Math.max(pct * 100, g.value > 0 ? 1.5 : 0)}%`}} />
              </div>
              <div className="goal-ends">
                <span>{g.fmt(g.value)}</span>
                <span>{g.fmt(g.target)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {d.goal === 'creator_rewards' && <p className="fine">TikTok also needs you to be 18 or older. Pip checks the numbers, TikTok decides.</p>}
    </>
  );
}

// ---------------------------------------------------------------- schedule
function Schedule({d}: {d: Data}) {
  const s = d.schedule;
  const next = s?.upcoming[0];
  const at = next?.slotAt ?? s?.nextSlot;
  if (!s || !at)
    return (
      <>
        <PageHead top="No posting" accent="times yet" text="Send /settings in the bot to pick when videos go out." />
      </>
    );
  const w = when(at, d.timezone, d.generatedAt);
  return (
    <>
      <PageHead top="Next video" accent="goes live in" />
      <section className="poster" aria-label={`Next post ${w.day} at ${w.time}`}>
        <div className="poster-top">
          <span className="poster-eyebrow">{w.day} at {w.time}</span>
          {next && <span className={`chip status-${next.status}`}>{STATUS_LABEL[next.status] ?? next.status}</span>}
        </div>
        <div className="poster-count"><Countdown iso={at} /></div>
        {next?.topic && <div className="poster-topic">{next.topic}</div>}
        {next?.status === 'awaiting_approval' && <p className="poster-hint">{Icon.chat} Approve it in the chat with Pip.</p>}
      </section>
      <Section n={1} title="Posting times">
        <div className="ranges static">
          {s.times.map((t) => <span key={t}>{t}</span>)}
        </div>
        <p className="fine">{s.postsPerDay === 1 ? 'One video every day' : `${s.postsPerDay} videos a day`}, {s.mode === 'auto' ? 'posted on autopilot' : 'each sent to you to approve first'}. Change this with /settings in the bot.</p>
      </Section>
      {s.upcoming.length > 0 && (
        <Section n={2} title="Coming up">
          <ul className="queue">
            {s.upcoming.map((v) => {
              const x = when(v.slotAt, d.timezone, d.generatedAt);
              return (
                <li key={v.id}>
                  <div className="queue-when"><b>{x.time}</b><span>{x.day}</span></div>
                  <div className="queue-topic">{v.topic || 'Topic not picked yet'}</div>
                  <span className={`chip status-${v.status}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- insights
function Insights({d}: {d: Data}) {
  const ins = d.insights;
  const min = ins.minVideos ?? 15;
  if (ins.n === 0)
    return (
      <>
        <PageHead top="What works" accent="for your channel" text="Pip compares your videos to find which topics, hooks and posting times work best. It starts after your first videos." />
        <Tile className="empty">
          <div className="state-icon">{Icon.trend}</div>
          <h3>No videos to compare yet</h3>
          <Meter n={0} min={min} />
        </Tile>
      </>
    );
  const max = Math.max(1, ...ins.heatmap.flat().map((x) => x ?? 0));
  const anyHeat = ins.heatmap.some((r) => r.some((c) => c !== null));
  let best: {wd: number; h: number; v: number} | null = null;
  ins.heatmap.forEach((row, wd) => row.forEach((v, h) => v !== null && v > (best?.v ?? -1) && (best = {wd, h, v})));
  const b = best as {wd: number; h: number; v: number} | null;
  const inSchedule = b && (d.schedule?.times ?? []).some((x) => Number(x.slice(0, 2)) === b.h);
  let n = 0;
  return (
    <>
      <PageHead top="What works" accent="for your channel" text={`Based on ${ins.n} video${ins.n === 1 ? '' : 's'}.${ins.weekStart ? ` Weekly report from ${shortDay(ins.weekStart)}.` : ''}`} />
      {ins.tooSmall && (
        <Tile className="note">
          <p><b>Early days.</b> Patterns get reliable after {min} videos. Treat these as first hints.</p>
          <Meter n={ins.n} min={min} />
        </Tile>
      )}
      {b && (
        <Section n={++n} title="Best time to post">
          <div className="tiles">
            <Tile label="Best slot" icon={Icon.clock} className="lit">
              <div className="tile-value">{DAYS[b.wd]} {String(b.h).padStart(2, '0')}:00</div>
              <p className="tile-note">{DAYS_LONG[b.wd]}s around {String(b.h).padStart(2, '0')}:00</p>
            </Tile>
            <Tile label="Median views" icon={Icon.eye}>
              <div className="tile-value">{fmtNum(b.v)}</div>
              <p className="tile-note">{inSchedule ? 'Already one of your times' : 'Add it with /settings'}</p>
            </Tile>
          </div>
        </Section>
      )}
      <Section n={++n} title="What's working">
        <Tile>
          {ins.summary ? <p className="summary">{ins.summary}</p> : <p className="muted">Your first weekly report arrives on Monday.</p>}
          {ins.patterns.length > 0 && (
            <ul className="patterns">
              {ins.patterns.slice(0, 6).map((p) => (
                <li key={p.feature + p.value}>
                  <span className={`badge ${p.lift >= 1 ? 'up' : 'down'}`}>{p.lift.toFixed(1)}×</span>
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </Section>
      {ins.changes.length > 0 && (
        <Section n={++n} title="Changes for next week">
          <Tile>
            <ul className="changes">{ins.changes.map((c) => <li key={c}><span className="tick">{Icon.check}</span>{c}</li>)}</ul>
          </Tile>
        </Section>
      )}
      <Section n={++n} title="Views by day and hour">
        <Tile>
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
              <p className="fine">Median views, {d.timezone.replace(/_/g, ' ')} time. Brighter is better.</p>
            </>
          ) : (
            <p className="muted">Not enough videos yet.</p>
          )}
        </Tile>
      </Section>
      <Section n={++n} title="Best topics">
        <Ranked rows={ins.bestTopics} />
      </Section>
      <Section n={++n} title="Best hooks">
        <Ranked rows={ins.bestHooks} />
      </Section>
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

function Ranked({rows}: {rows: {label: string; medianViews: number; n: number}[]}) {
  const max = Math.max(1, ...rows.map((r) => r.medianViews));
  return (
    <Tile>
      {!rows.length && <p className="muted">Not enough videos yet.</p>}
      <ul className="ranked">
        {rows.map((r, i) => (
          <li key={r.label}>
            <div className="rank-top">
              <span className="rank-label">{r.label}</span>
              <span className="rank-num"><b>{fmtNum(r.medianViews)}</b> median · {r.n} video{r.n === 1 ? '' : 's'}</span>
            </div>
            <div className="bar"><i className={i === 0 ? 'lead' : ''} style={{width: `${(100 * r.medianViews) / max}%`}} /></div>
          </li>
        ))}
      </ul>
    </Tile>
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

function Library({d, tg, range, onRange}: {d: Data; tg?: TelegramWebApp; range: Range; onRange: (r: Range) => void}) {
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
      <PageHead top="Your library" accent={`${total} video${total === 1 ? '' : 's'}`} text="Tap any video to watch it full screen, then swipe up for the next one." />
      <RangePills range={range} onRange={onRange} />
      {total > 0 && (
        <div className="pills" role="tablist" aria-label="Which videos">
          {([['all', `All ${total}`], ['posted', `Posted ${d.videos.length}`], ['unposted', `Not posted ${unposted.length}`]] as [Show, string][]).map(([id, label]) => (
            <button key={id} className="pill" role="tab" aria-selected={show === id} onClick={() => setShow(id)}>{label}</button>
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
          <span className="lib-count">{posted.length} posted video{posted.length === 1 ? '' : 's'}</span>
          <label className="select">
            {Icon.sort}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort videos">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {!items.length && (
        <div className="tile empty">
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


// ---------------------------------------------------------------- loading
function Skeleton() {
  return (
    <div className="app" role="status" aria-label="Loading your channel">
      <div className="topbar">
        <div className="sk" style={{width: 150, height: 40, borderRadius: 99}} />
        <div className="sk" style={{width: 40, height: 40, borderRadius: 99}} />
      </div>
      <div className="view">
        <div className="balance">
          <div className="sk sk-line sm" style={{width: 120}} />
          <div className="sk" style={{width: 220, height: 56, margin: '14px 0 12px'}} />
          <div className="sk sk-line sm" style={{width: 160}} />
        </div>
        <div className="sk" style={{height: 190, borderRadius: 20}} />
        <div className="tiles">{[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{height: 132, borderRadius: 22}} />)}</div>
      </div>
    </div>
  );
}
