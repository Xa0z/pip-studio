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
  claudeAgain: (): Keyboard => [[b('🔑 Connect Claude again', 'cl:again')]],
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
    rows.push([b('📣 Marketing videos for my business instead', 'mk:on')]);
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
    rows.push([b(`${current === 'auto' ? '✅ ' : ''}✨ Colours made just for me`, 'th:auto')]);
    rows.push([b(`${current === 'brand' ? '✅ ' : ''}🏷 My brand colours or logo`, 'th:brand'), b(`${current === 'custom' ? '✅ ' : ''}🎨 Pick 2 colours`, 'th:custom')]);
    return rows;
  },
  brandFound: (): Keyboard => [[b('✅ Use these', 'th:usebrand'), b('✏️ Type them instead', 'th:brand')]],
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
  /** The home menu (/start and /menu once setup is done). */
  home: (mode: 'approval' | 'auto', paused: boolean, dashboardUrl: string): Keyboard => [
    [b('🎬 My videos', 'vd:list:0'), b(mode === 'auto' ? '⚡ Mode: Full auto' : '✋ Mode: Review', 'md:menu')],
    [b('📈 Stats', 'hm:stats'), b('🏆 Top videos', 'hm:top')],
    [{text: '📊 Dashboard', web_app: {url: dashboardUrl}}, b('⚙️ Settings', 'hm:settings')],
    [b('📣 Marketing', 'mk:menu'), paused ? b('▶️ Resume posting', 'hm:resume') : b('⏸ Pause posting', 'hm:pause')],
    [b('❓ All commands', 'hm:help')],
  ],
  backHome: (): Keyboard => [[b('🏠 Menu', 'hm:home')]],
  /** The "My videos" list: one button per video, page arrows, the mode switch and the dashboard. */
  videos: (items: {id: string; label: string}[], page: number, pages: number, mode: 'approval' | 'auto', dashboardUrl: string): Keyboard => [
    ...items.map((x) => [b(x.label, `vd:show:${x.id}`)]),
    ...(pages > 1 ? [[...(page > 0 ? [b('⬅️ Newer', `vd:list:${page - 1}`)] : []), ...(page < pages - 1 ? [b('Older ➡️', `vd:list:${page + 1}`)] : [])]] : []),
    [mode === 'auto' ? b('✋ Switch to review and approve', `md:approval:${page}`) : b('⚡ Switch to full auto', `md:auto:${page}`)],
    [{text: '📊 Open the full library', web_app: {url: dashboardUrl}}],
  ],
  modeSwitch: (mode: 'approval' | 'auto'): Keyboard => [
    [b(`${mode === 'approval' ? '✅ ' : ''}✋ Review and approve`, 'md:approval')],
    [b(`${mode === 'auto' ? '✅ ' : ''}⚡ Full auto`, 'md:auto')],
    [b('🎬 My videos', 'vd:list:0')],
  ],
  settings: (): Keyboard => [
    [b('🎬 My videos', 'vd:list:0')],
    [b('🎯 Niche', 'st:niche'), b('🏁 Goal', 'st:goal')],
    [b('🕘 Schedule', 'st:schedule'), b('🔢 Posts per day', 'st:ppd')],
    [b('✋/⚡ Mode', 'md:menu'), b('🎨 Video theme', 'st:theme')],
    [b('📣 Marketing videos', 'mk:menu'), b('🧑‍🎨 New character', 'st:newchar')],
    [b('📚 Business knowledge', 'kn:menu')],
  ],
  refNotes: (): Keyboard => [[b('No changes', 'mk:nonotes')]],
  dailyRefs: (hasPrevious: boolean): Keyboard => [[b('🎬 Send new references', 'mk:refs')], ...(hasPrevious ? [[b('🔁 Reuse my last ones', 'mk:same')]] : [])],
  marketingMenu: (): Keyboard => [
    [b('🎬 Send new references', 'mk:refs')],
    [b('📚 Business knowledge', 'kn:menu'), b('🏪 Change summary', 'mk:business')],
    [b('🎓 Switch back to explainer videos', 'mk:off')],
  ],
  knowledgeMenu: (count: number, explainer: boolean, useInExplainers: boolean): Keyboard => [
    [b('➕ Add knowledge', 'kn:add')],
    ...(count ? [[b('🗑 Remove one', 'kn:rm'), b('🧹 Clear all', 'kn:clear')]] : []),
    ...(explainer ? [[b(useInExplainers ? '✅ Used in my explainer videos' : '⬜ Use in my explainer videos too', 'kn:explainers')]] : []),
  ],
  knowledgeDone: (): Keyboard => [[b('✅ Done', 'kn:done')]],
  knowledgeRemove: (items: {id: string; label: string}[]): Keyboard => [...items.map((x) => [b(`🗑 ${x.label}`, `kn:del:${x.id}`)]), [b('⬅️ Back', 'kn:menu')]],
  knowledgeClear: (): Keyboard => [[b('Yes, clear it all', 'kn:clear:yes'), b('Cancel', 'kn:menu')]],
  confirmNewCharacter: (): Keyboard => [[b('Yes, new character', 'st:newchar:yes'), b('Cancel', 'st:cancel')]],
  disconnect: (): Keyboard => [[b('Yes, delete everything', 'dc:yes')], [b('No, keep it', 'dc:no')]],
  dashboard: (url: string): Keyboard => [[{text: '📊 Open dashboard', web_app: {url}}]],
};
