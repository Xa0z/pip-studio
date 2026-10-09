/**
 * TikTok app-review demo: the raw screen recording (public/demo.mp4, 2252x1396) cut into shots,
 * each cropped to what matters (never the personal Telegram chat list), with a side panel that
 * names the product and scopes being shown.
 */
import React from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

export const FPS = 30;
export const W = 1920;
export const H = 1080;
const SRC_W = 2252;
const SRC_H = 1396;
const FONT = 'Inter, "Inter Display", system-ui, sans-serif';

const C = {
  bg: '#07080c',
  panel: '#0f1218',
  line: 'rgba(255,255,255,0.08)',
  text: '#f4f6fb',
  dim: '#9aa3b5',
  faint: '#5b6476',
  accent: '#8fd3ff',
  pink: '#fe2c55',
  cyan: '#25f4ee',
};

const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish'] as const;
type Scope = (typeof SCOPES)[number];

type Rect = {x: number; y: number; w: number; h: number};
type Chapter = {product: string; title: string; body: string; scopes: Scope[]};
type Mark = {from: number; to: number; rect: Rect; label?: string};
type Shot = {chapter: number; from: number; to: number; rate: number; crop: Rect; marks?: Mark[]};

const CHAPTERS: Chapter[] = [
  {product: 'Login Kit', title: 'Connect TikTok', body: 'In our Telegram bot the user taps Connect TikTok. It opens TikTok’s authorize page with our client key, redirect URI and scopes.', scopes: [...SCOPES]},
  {product: 'Login Kit', title: 'User approves access', body: 'TikTok shows every permission Pip Studio asks for. The user reviews them and taps Continue.', scopes: [...SCOPES]},
  {product: 'Login Kit', title: 'Account connected', body: 'Back in Telegram we confirm the account with its avatar, @username and follower, like and video counts.', scopes: ['user.info.basic', 'user.info.profile', 'user.info.stats']},
  {product: 'Pip Studio', title: 'Channel setup', body: 'The user picks a niche, goal, character, voice, look and posting schedule. Pip then makes the first video.', scopes: []},
  {product: 'Content Posting API', title: 'Review before posting', body: 'We query creator_info first. The user picks who can see the video (no default), sees the AI-generated label and Music Usage Confirmation, then taps Post.', scopes: ['video.publish']},
  {product: 'Display API', title: 'Dashboard', body: 'The dashboard shows the connected profile, goals from account stats, and the Library of the user’s videos.', scopes: ['user.info.profile', 'user.info.stats', 'video.list']},
  {product: 'Content Posting API', title: 'Posted to TikTok', body: 'The video is uploaded with Direct Post. When TikTok finishes, the bot confirms and links to it.', scopes: ['video.publish']},
  {product: 'Content Posting API', title: 'Live on TikTok', body: 'The video is on @codewave79, Private while the app is in sandbox, and labeled as AI-generated.', scopes: ['video.publish']},
  {product: 'Website', title: 'shadhealth.com', body: 'Our website explains the service and links the Terms of Service and the Privacy Policy, which lists each scope.', scopes: []},
];

// Crops in source pixels.
const CHAT: Rect = {x: 880, y: 100, w: 860, h: 1296};
const SHOTS: Shot[] = [
  {chapter: 0, from: 0.0, to: 0.6, rate: 1, crop: {x: 860, y: 380, w: 900, h: 1016}},
  {chapter: 0, from: 0.6, to: 1.55, rate: 0.3, crop: {x: 860, y: 380, w: 900, h: 1016}, marks: [{from: 0.4, to: 3.2, rect: {x: 905, y: 515, w: 470, h: 230}, label: 'Requested scopes'}]},
  {chapter: 1, from: 12.6, to: 25.6, rate: 1.25, crop: {x: 690, y: 150, w: 880, h: 1240}, marks: [{from: 1.0, to: 7.5, rect: {x: 745, y: 640, w: 770, h: 560}, label: '5 permissions'}]},
  {chapter: 2, from: 25.8, to: 29.4, rate: 1, crop: {x: 620, y: 400, w: 1020, h: 640}},
  {chapter: 2, from: 33.0, to: 36.5, rate: 1, crop: CHAT, marks: [{from: 0.3, to: 3.5, rect: {x: 960, y: 845, w: 340, h: 70}, label: 'Profile + stats'}]},
  {chapter: 3, from: 36.5, to: 96.0, rate: 4, crop: CHAT},
  {chapter: 3, from: 96.0, to: 103.6, rate: 1.25, crop: CHAT},
  {chapter: 4, from: 103.6, to: 113.0, rate: 1, crop: {x: 900, y: 470, w: 820, h: 926}, marks: [
    {from: 0.6, to: 3.2, rect: {x: 960, y: 1105, w: 640, h: 80}, label: 'AI label + Music Usage Confirmation'},
    {from: 3.4, to: 6.0, rect: {x: 955, y: 1195, w: 650, h: 60}, label: 'Privacy from creator_info'},
    {from: 6.2, to: 8.6, rect: {x: 955, y: 1255, w: 650, h: 60}, label: 'Post'},
  ]},
  {chapter: 5, from: 122.0, to: 168.0, rate: 2, crop: {x: 820, y: 150, w: 620, h: 1080}},
  {chapter: 6, from: 168.0, to: 175.5, rate: 1, crop: {x: 880, y: 560, w: 860, h: 836}, marks: [{from: 2.6, to: 7.4, rect: {x: 960, y: 1100, w: 630, h: 140}, label: 'Posted'}]},
  {chapter: 7, from: 177.6, to: 184.4, rate: 1, crop: {x: 0, y: 0, w: 1600, h: 1396}},
  {chapter: 7, from: 184.4, to: 194.0, rate: 1, crop: {x: 0, y: 0, w: 1600, h: 1396}, marks: [
    {from: 0.2, to: 3.0, rect: {x: 130, y: 30, w: 700, h: 46}, label: 'tiktok.com/@codewave79/video/…'},
    {from: 3.4, to: 9.4, rect: {x: 15, y: 1100, w: 330, h: 150}, label: 'Private · AI-generated'},
  ]},
  {chapter: 8, from: 199.0, to: 213.5, rate: 1, crop: {x: 0, y: 0, w: SRC_W, h: SRC_H}, marks: [{from: 0.2, to: 3.6, rect: {x: 140, y: 30, w: 330, h: 46}, label: 'shadhealth.com'}]},
];

const INTRO = 4.5 * FPS;
const OUTRO = 6 * FPS;
const shotLen = (s: Shot) => Math.round(((s.to - s.from) / s.rate) * FPS);
const starts: number[] = [];
let acc = INTRO;
for (const s of SHOTS) {
  starts.push(acc);
  acc += shotLen(s);
}
const BODY_END = acc;
export const TOTAL = BODY_END + OUTRO;
const chapterStart = CHAPTERS.map((_, i) => starts[SHOTS.findIndex((s) => s.chapter === i)]);
const chapterEnd = CHAPTERS.map((_, i) => (i + 1 < CHAPTERS.length ? chapterStart[i + 1] : BODY_END));

// ---------- pieces ----------

const lastIndex = <T,>(xs: T[], ok: (x: T, i: number) => boolean) => {
  for (let i = xs.length - 1; i >= 0; i--) if (ok(xs[i], i)) return i;
  return -1;
};

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const appear = (f: number, delay = 0, dur = 14) => interpolate(f - delay, [0, dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

const Chip: React.FC<{label: string; on: boolean; delay: number; f: number}> = ({label, on, delay, f}) => {
  const a = appear(f, delay);
  return (
    <div style={{
      fontFamily: '"DejaVu Sans Mono", monospace', fontSize: 22, padding: '9px 16px', borderRadius: 999,
      border: `1.5px solid ${on ? C.accent : C.line}`, color: on ? C.bg : C.faint,
      background: on ? C.accent : 'transparent', opacity: on ? 0.35 + 0.65 * a : 0.9,
      transform: `translateY(${(1 - a) * 8}px)`, display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{width: 8, height: 8, borderRadius: 8, background: on ? C.bg : C.faint}} />
      {label}
    </div>
  );
};

const Brand: React.FC = () => (
  <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
    <div style={{width: 44, height: 44, borderRadius: 12, background: C.accent, color: C.bg, fontWeight: 800, fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>P</div>
    <div>
      <div style={{fontSize: 24, fontWeight: 700, color: C.text}}>Pip Studio</div>
      <div style={{fontSize: 17, color: C.dim}}>TikTok integration demo · Sandbox</div>
    </div>
  </div>
);

const SidePanel: React.FC<{frame: number}> = ({frame}) => {
  const i = Math.max(0, lastIndex(chapterStart, (s) => frame >= s));
  const ch = CHAPTERS[i];
  const f = frame - chapterStart[i];
  const shot = lastIndex(SHOTS, (_, k) => frame >= starts[k]);
  const rate = shot >= 0 ? SHOTS[shot].rate : 1;
  return (
    <div style={{position: 'absolute', left: 64, top: 56, width: 560, bottom: 120, display: 'flex', flexDirection: 'column'}}>
      <Brand />
      <div style={{marginTop: 'auto', marginBottom: 'auto'}}>
        <div style={{opacity: appear(f), transform: `translateX(${(1 - appear(f)) * -24}px)`, display: 'flex', alignItems: 'center', gap: 14}}>
          <span style={{fontSize: 22, fontWeight: 700, color: C.faint, fontVariantNumeric: 'tabular-nums'}}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{fontSize: 22, fontWeight: 700, color: C.accent, letterSpacing: 1.5, textTransform: 'uppercase'}}>{ch.product}</span>
        </div>
        <div style={{fontSize: 62, fontWeight: 800, color: C.text, lineHeight: 1.05, marginTop: 16, letterSpacing: -1.5, opacity: appear(f, 3), transform: `translateY(${(1 - appear(f, 3)) * 18}px)`}}>{ch.title}</div>
        <div style={{fontSize: 27, color: C.dim, lineHeight: 1.45, marginTop: 22, opacity: appear(f, 7), transform: `translateY(${(1 - appear(f, 7)) * 14}px)`}}>{ch.body}</div>
        <div style={{marginTop: 34, fontSize: 18, fontWeight: 600, color: C.faint, letterSpacing: 1.5, textTransform: 'uppercase', opacity: appear(f, 10)}}>Scopes in this step</div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14}}>
          {SCOPES.map((s, k) => <Chip key={s} label={s} on={ch.scopes.includes(s)} delay={12 + k * 3} f={f} />)}
        </div>
        {rate > 1.3 ? (
          <div style={{marginTop: 28, display: 'inline-flex', alignSelf: 'flex-start', fontSize: 20, fontWeight: 700, color: C.text, background: 'rgba(255,255,255,0.08)', padding: '8px 16px', borderRadius: 10}}>⏩ {rate}× speed</div>
        ) : null}
      </div>
    </div>
  );
};

const Progress: React.FC<{frame: number}> = ({frame}) => (
  <div style={{position: 'absolute', left: 64, right: 64, bottom: 44, display: 'flex', gap: 8}}>
    {CHAPTERS.map((ch, i) => {
      const p = interpolate(frame, [chapterStart[i], chapterEnd[i]], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      const active = frame >= chapterStart[i] && frame < chapterEnd[i];
      return (
        <div key={i} style={{flex: chapterEnd[i] - chapterStart[i], minWidth: 0}}>
          <div style={{fontSize: 15, fontWeight: 600, color: active ? C.text : C.faint, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{ch.title}</div>
          <div style={{height: 5, borderRadius: 5, background: C.line, overflow: 'hidden'}}>
            <div style={{width: `${p * 100}%`, height: '100%', background: C.accent}} />
          </div>
        </div>
      );
    })}
  </div>
);

// Footage card: the right side of the frame.
const AREA = {x: 680, y: 40, w: 1176, h: 900};

const ShotView: React.FC<{shot: Shot; len: number}> = ({shot, len}) => {
  const f = useCurrentFrame();
  const {crop} = shot;
  const s = Math.min(AREA.w / crop.w, AREA.h / crop.h);
  const bw = crop.w * s;
  const bh = crop.h * s;
  const left = AREA.x + (AREA.w - bw) / 2;
  const top = AREA.y + (AREA.h - bh) / 2;
  const a = appear(f, 0, 10);
  const out = interpolate(f, [len - 6, len], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // Slow push-in keeps static screens alive.
  const zoom = interpolate(f, [0, len], [1, 1.035], {extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left, top, width: bw, height: bh, opacity: a * out, transform: `scale(${(0.97 + 0.03 * a) * zoom})`, transformOrigin: 'center'}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', outline: `1px solid ${C.line}`}}>
        <OffthreadVideo
          src={staticFile('demo.mp4')}
          startFrom={Math.round(shot.from * FPS)}
          playbackRate={shot.rate}
          volume={shot.rate === 1 ? 1 : 0}
          style={{position: 'absolute', width: SRC_W * s, height: SRC_H * s, left: -crop.x * s, top: -crop.y * s, maxWidth: 'none'}}
        />
      </div>
      {(shot.marks ?? []).map((m, k) => {
        const m0 = Math.round(m.from * FPS);
        const m1 = Math.round(m.to * FPS);
        if (f < m0 || f > m1) return null;
        const pop = spring({frame: f - m0, fps: FPS, config: {damping: 14, stiffness: 160}});
        const fade = interpolate(f, [m1 - 8, m1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const pad = 10;
        const x = (m.rect.x - crop.x) * s - pad;
        const y = (m.rect.y - crop.y) * s - pad;
        const w = m.rect.w * s + pad * 2;
        const h = m.rect.h * s + pad * 2;
        const labelAbove = y > 56;
        return (
          <div key={k} style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity: fade * Math.min(1, pop * 1.4), transform: `scale(${1.08 - 0.08 * pop})`}}>
            <div style={{position: 'absolute', inset: 0, borderRadius: 12, border: `3px solid ${C.pink}`, boxShadow: `0 0 0 9999px rgba(0,0,0,${0.35 * pop}), 0 0 24px ${C.pink}`}} />
            {m.label ? (
              <div style={{position: 'absolute', left: 0, [labelAbove ? 'bottom' : 'top']: h + 8, background: C.pink, color: '#fff', fontSize: 22, fontWeight: 700, padding: '7px 14px', borderRadius: 9, whiteSpace: 'nowrap'}}>{m.label}</div>
            ) : null}
          </div>
        );
      })}
      {shot.rate > 1.3 ? (
        <div style={{position: 'absolute', right: 16, top: 16, background: 'rgba(0,0,0,0.7)', color: C.text, fontSize: 20, fontWeight: 700, padding: '6px 12px', borderRadius: 8}}>⏩ {shot.rate}×</div>
      ) : null}
    </div>
  );
};

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const out = interpolate(f, [INTRO - 10, INTRO], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: out}}>
      <div style={{textAlign: 'center', width: 1400}}>
        <div style={{display: 'inline-flex', opacity: appear(f)}}><Brand /></div>
        <div style={{fontSize: 96, fontWeight: 800, color: C.text, letterSpacing: -3, marginTop: 34, opacity: appear(f, 4), transform: `translateY(${(1 - appear(f, 4)) * 24}px)`}}>
          TikTok integration, end to end
        </div>
        <div style={{fontSize: 32, color: C.dim, marginTop: 18, opacity: appear(f, 9)}}>Pip Studio makes short explainer videos and posts them to the creator’s own TikTok.</div>
        <div style={{display: 'flex', justifyContent: 'center', gap: 14, marginTop: 50, opacity: appear(f, 14)}}>
          {['Login Kit', 'Content Posting API'].map((p) => (
            <div key={p} style={{fontSize: 26, fontWeight: 700, color: C.text, border: `1.5px solid ${C.accent}`, padding: '10px 22px', borderRadius: 999}}>{p}</div>
          ))}
        </div>
        <div style={{display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 20}}>
          {SCOPES.map((s, k) => <Chip key={s} label={s} on delay={18 + k * 3} f={f} />)}
        </div>
        <div style={{fontSize: 22, color: C.faint, marginTop: 40, opacity: appear(f, 30)}}>Sandbox app · website shadhealth.com · recorded on {'Oct 10, 2026'}</div>
      </div>
    </AbsoluteFill>
  );
};

const OUTRO_ROWS: [Scope | string, string][] = [
  ['Login Kit', 'Connect TikTok from the Telegram bot'],
  ['user.info.basic', 'open_id, avatar and display name of the connected account'],
  ['user.info.profile', '@username on approval messages and the dashboard'],
  ['user.info.stats', 'Followers, likes and video counts, and goals'],
  ['video.list', 'Library of the user’s videos with their stats'],
  ['video.publish', 'creator_info, privacy choice, Direct Post'],
];

const Outro: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{width: 1240}}>
        <div style={{fontSize: 70, fontWeight: 800, color: C.text, letterSpacing: -2, opacity: appear(f)}}>Everything shown in this demo</div>
        <div style={{marginTop: 40, display: 'flex', flexDirection: 'column', gap: 18}}>
          {OUTRO_ROWS.map(([k, v], i) => (
            <div key={k} style={{display: 'flex', alignItems: 'center', gap: 22, opacity: appear(f, 6 + i * 4), transform: `translateX(${(1 - appear(f, 6 + i * 4)) * -30}px)`}}>
              <div style={{width: 40, height: 40, borderRadius: 40, background: C.accent, color: C.bg, fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>✓</div>
              <div style={{fontFamily: k.includes('.') ? '"DejaVu Sans Mono", monospace' : FONT, fontSize: 28, fontWeight: 700, color: C.text, width: 330}}>{k}</div>
              <div style={{fontSize: 28, color: C.dim}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop: 50, fontSize: 24, color: C.faint, opacity: appear(f, 40)}}>Pip Studio · shadhealth.com · @PipStudio_bot</div>
      </div>
    </AbsoluteFill>
  );
};

const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <div style={{position: 'absolute', width: 1100, height: 1100, borderRadius: '50%', left: 900 + Math.sin(t / 5) * 60, top: -400 + Math.cos(t / 6) * 40, background: 'radial-gradient(circle, rgba(143,211,255,0.13), transparent 65%)'}} />
      <div style={{position: 'absolute', width: 900, height: 900, borderRadius: '50%', left: -300 + Math.cos(t / 7) * 50, top: 450, background: 'radial-gradient(circle, rgba(254,44,85,0.08), transparent 65%)'}} />
    </AbsoluteFill>
  );
};

export const Demo: React.FC<{sfx: boolean}> = ({sfx}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const bodyOpacity = interpolate(frame, [INTRO - 4, INTRO + 8, BODY_END - 8, BODY_END], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{fontFamily: FONT, background: C.bg}}>
      <Backdrop />
      <Sequence durationInFrames={INTRO}><Intro /></Sequence>
      {SHOTS.map((s, k) => (
        <Sequence key={k} from={starts[k]} durationInFrames={shotLen(s)}>
          <ShotView shot={s} len={shotLen(s)} />
        </Sequence>
      ))}
      {frame >= INTRO - 4 && frame < BODY_END ? (
        <AbsoluteFill style={{opacity: bodyOpacity}}>
          <SidePanel frame={frame} />
          <Progress frame={frame} />
        </AbsoluteFill>
      ) : null}
      <Sequence from={BODY_END} durationInFrames={durationInFrames - BODY_END}><Outro /></Sequence>
      {sfx
        ? [...chapterStart, BODY_END].map((at, k) => (
            <Sequence key={`w${k}`} from={Math.max(0, at - 6)} durationInFrames={FPS}>
              <Audio src={staticFile('sfx/whoosh.wav')} volume={0.18} />
            </Sequence>
          ))
        : null}
    </AbsoluteFill>
  );
};
