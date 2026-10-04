/** How the user's goal changes planning and scoring. */
export type Goal = 'followers' | 'views' | 'creator_rewards' | 'traffic';
export type CtaType = 'follow' | 'comment' | 'link';

export type GoalConfig = {
  label: string;
  emoji: string;
  cta: CtaType;
  /** Video length in seconds: [min, max] for normal videos. */
  length: [number, number];
  hookStyles: string[];
  /** One line for the planner. */
  planning: string;
  /** How analytics scores a video for this goal (also explained in reports). */
  scoreNote: string;
};

export const GOALS: Record<Goal, GoalConfig> = {
  followers: {
    label: 'Grow followers',
    emoji: '📈',
    cta: 'follow',
    length: [40, 55],
    hookStyles: ['question', 'promise', 'shock'],
    planning: 'Make viewers want more from this channel: end with a reason to follow (series, "part 2 tomorrow").',
    scoreNote: 'Followers can\'t be traced to one video in TikTok\'s API, so videos are scored by shares, comments and likes (what makes people follow).',
  },
  views: {
    label: 'Get max views',
    emoji: '👀',
    cta: 'comment',
    length: [30, 40],
    hookStyles: ['shock', 'question', 'number'],
    planning: 'Short and punchy for full watch-through. Strongest fact first. Ask a question that makes people comment.',
    scoreNote: 'Videos are scored by views.',
  },
  creator_rewards: {
    label: 'Creator Rewards (videos over 1 min)',
    emoji: '💵',
    cta: 'follow',
    length: [62, 62],
    hookStyles: ['question', 'shock', 'story'],
    planning: 'Exactly 62 seconds. Keep attention to the end: tease the best fact early, pay it off near the end.',
    scoreNote: 'Videos are scored by views (only videos over 1 minute count for Creator Rewards).',
  },
  traffic: {
    label: 'Send traffic to my link',
    emoji: '🔗',
    cta: 'link',
    length: [30, 45],
    hookStyles: ['promise', 'question', 'number'],
    planning: 'Give real value, then point to the link in bio for more. Never say the link is in the video.',
    scoreNote: 'Link clicks aren\'t in TikTok\'s API, so videos are scored by comments and shares (people who act), plus views.',
  },
};

export const HOOK_TYPES = ['question', 'shock', 'number', 'myth', 'story', 'promise'] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export type MetricRow = {views: number; likes: number; comments: number; shares: number};

/** One number per video that says how well it did for this goal. */
export function goalScore(goal: Goal, m: MetricRow): number {
  switch (goal) {
    case 'views':
    case 'creator_rewards':
      return m.views;
    case 'followers':
      return m.likes + 2 * m.comments + 3 * m.shares;
    case 'traffic':
      return 3 * m.comments + 3 * m.shares + m.views / 100;
  }
}

/** Length for the next video: Creator Rewards is always 62 s; others vary inside the goal's range. */
export function pickLength(goal: Goal, seed: number): number {
  const [a, b] = GOALS[goal].length;
  if (a === b) return a;
  const steps = Math.floor((b - a) / 5);
  return a + 5 * (Math.abs(seed) % (steps + 1));
}

export const ctaLabel = (cta: CtaType, characterName: string | null) =>
  cta === 'link' ? '🔗 Link in bio' : cta === 'comment' ? '💬 Comment below' : characterName ? `+ Follow ${characterName}` : '+ Follow';
