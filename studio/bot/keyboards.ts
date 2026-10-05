/** Inline keyboards (plain JSON, used by both the bot and the worker). */
import {GOALS, type Goal} from '../lib/goals.js';
import {NICHES} from '../lib/niches.js';
import {COMMON_TIMEZONES} from '../lib/schedule.js';
import type {Keyboard} from '../lib/telegram.js';
import {PRESET_IDS, PRESETS} from '../../src/themes.js';

const b = (text: string, data: string) => ({text, callback_data: data});

export const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: '🌍 Everyone',
  MUTUAL_FOLLOW_FRIENDS: '👥 Friends',
  FOLLOWER_OF_CREATOR: '👤 Followers',
  SELF_ONLY: '🔒 Only me',
};

export const K = {
  letsGo: (): Keyboard => [[b("Let's go 🚀", 'ob:go')]],
  next: (): Keyboard => [[b('Next ➡️', 'ob:next')]],
  connectTikTok: (url: string): Keyboard => [[{text: '🔗 Connect TikTok', url}]],
  claudeHelp: (owner: boolean): Keyboard => (owner ? [] : [[b('Where do I get this?', 'cl:help')]]),
  claudeAgain: (): Keyboard => [[b('Paste a new token', 'cl:again')]],
  niches: (picked: string[]): Keyboard => {
    const rows: Keyboard = [];
    for (let i = 0; i < NICHES.length; i += 2) {
      rows.push(
        NICHES.slice(i, i + 2).map((n) => b(`${picked.includes(n.id) ? '✅ ' : ''}${n.emoji} ${n.label}`, `n:${n.id}`)),
      );
    }
    const custom = picked.find((p) => p.startsWith('custom:'));
    rows.push([b(custom ? `✅ ✏️ ${custom.slice(7)}` : '✏️ Custom', 'n:custom')]);
    rows.push([b(`Done (${picked.length}/2)`, 'n:done')]);
    return rows;
  },
  goals: (): Keyboard => (Object.keys(GOALS) as Goal[]).map((g) => [b(`${GOALS[g].emoji} ${GOALS[g].label}`, `g:${g}`)]),
  characterYesNo: (owner = false): Keyboard => [
    [b('Yes, make me a character', 'ch:yes')],
    [b('No, text and visuals only', 'ch:no')],
    ...(owner ? [[b('🤖 Use Pip', 'ch:pip')]] : []),
  ],
  pickCharacter: (versions: number[] = [1, 2, 3]): Keyboard => [
    versions.map((v) => b(`Choose ${v}`, `ch:pick:${v}`)),
    [b('🔄 Make 3 new ones', 'ch:more'), b('✏️ Change description', 'ch:desc')],
  ],
  voices: (ids: string[]): Keyboard => [ids.map((id, i) => b(`Voice ${i + 1}`, `v:${id}`))],
  timezones: (): Keyboard => {
    const rows: Keyboard = [];
    for (let i = 0; i < COMMON_TIMEZONES.length; i += 2) rows.push(COMMON_TIMEZONES.slice(i, i + 2).map((t, j) => b(t.label, `tz:${i + j}`)));
    rows.push([b('⌨️ Type it', 'tz:type')]);
    return rows;
  },
  postsPerDay: (): Keyboard => [[b('1', 'ppd:1'), b('2', 'ppd:2'), b('3', 'ppd:3')]],
  times: (): Keyboard => [[b('👍 Use these', 'tm:ok'), b('✏️ Change times', 'tm:edit')]],
  mode: (): Keyboard => [[b('✋ Approval mode', 'm:approval')], [b('⚡ Full auto', 'm:auto')]],
  themes: (current?: string): Keyboard => {
    const rows: Keyboard = [];
    for (let i = 0; i < PRESET_IDS.length; i += 3)
      rows.push(PRESET_IDS.slice(i, i + 3).map((id, j) => b(`${current === id ? '✅ ' : ''}${i + j + 1}. ${PRESETS[id].label}`, `th:${id}`)));
    rows.push([b(`${current === 'custom' ? '✅ ' : ''}🎨 My own colours`, 'th:custom')]);
    return rows;
  },
  summary: (): Keyboard => [[b('🚀 Start my channel', 'sum:start')], [b('✏️ Change something', 'sum:edit')]],
  editPick: (): Keyboard => [
    [b('Niche', 'ed:niche'), b('Goal', 'ed:goal')],
    [b('Character', 'ed:character'), b('Schedule', 'ed:schedule')],
    [b('Mode', 'ed:mode'), b('Video theme', 'ed:theme')],
    [b('⬅️ Back to summary', 'ed:back')],
  ],
  preview: (): Keyboard => [[b('👍 Looks good', 'pv:ok'), b('🔄 Make another test', 'pv:again')]],
  approval: (videoId: string, options: string[], chosen: string | null): Keyboard => [
    options.map((o, i) => b(`${chosen === o ? '✅ ' : ''}${PRIVACY_LABELS[o] ?? o}`, `ap:pv:${videoId}:${i}`)),
    [b('✅ Post', `ap:post:${videoId}`), b('⏭ Skip', `ap:skip:${videoId}`), b('🔄 Regenerate', `ap:regen:${videoId}`)],
  ],
  openTikTok: (url: string | null): Keyboard => (url ? [[{text: 'Open on TikTok', url}]] : []),
  retry: (data: string): Keyboard => [[b('🔁 Retry', data)]],
  settings: (): Keyboard => [
    [b('🎯 Niche', 'st:niche'), b('🏁 Goal', 'st:goal')],
    [b('🕘 Schedule', 'st:schedule'), b('🔢 Posts per day', 'st:ppd')],
    [b('✋/⚡ Mode', 'st:mode'), b('🎨 Video theme', 'st:theme')],
    [b('🧑‍🎨 Create new character', 'st:newchar')],
  ],
  confirmNewCharacter: (): Keyboard => [[b('Yes, new character', 'st:newchar:yes'), b('Cancel', 'st:cancel')]],
  disconnect: (): Keyboard => [[b('Yes, delete everything', 'dc:yes')], [b('No, keep it', 'dc:no')]],
  dashboard: (url: string): Keyboard => [[{text: '📊 Open dashboard', web_app: {url}}]],
};
