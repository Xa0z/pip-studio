import {z} from 'zod';

export const CATEGORIES = ['space', 'human_body', 'animals', 'nature', 'physics'] as const;
export type Category = (typeof CATEGORIES)[number];

export const EXPRESSIONS = ['happy', 'surprised', 'thinking', 'excited', 'wink'] as const;
export const POSES = ['idle', 'pointing', 'waving', 'jumping'] as const;

// Icons drawn in code (remotion/components/Icons.tsx). Claude may only pick from this list.
export const ICONS = [
  // space
  'sun', 'moon', 'planet', 'earth', 'star', 'rocket', 'comet', 'galaxy', 'blackhole', 'astronaut',
  // human body
  'heart', 'brain', 'eye', 'bone', 'dna', 'lungs', 'tooth', 'cell', 'hand', 'ear',
  // animals
  'paw', 'fish', 'bird', 'octopus', 'bee', 'butterfly', 'whale', 'turtle', 'ant', 'snail',
  // nature
  'leaf', 'tree', 'flower', 'mountain', 'volcano', 'wave', 'cloud', 'snowflake', 'fire', 'drop',
  // physics / general
  'atom', 'bolt', 'magnet', 'clock', 'thermometer', 'lightbulb', 'ruler', 'weight', 'speed', 'sound',
  // general (money, tech, history, mind, language, motivation)
  'coin', 'chart', 'wallet', 'piggybank', 'phone', 'laptop', 'robot', 'chip', 'book', 'scroll',
  'crown', 'castle', 'globe', 'speech', 'quote', 'trophy', 'target', 'smile', 'calendar', 'lock',
] as const;
export type IconName = (typeof ICONS)[number];

export const LAYOUTS = ['bigNumber', 'compare', 'iconGrid', 'orbit', 'steps', 'spotlight'] as const;
export type LayoutName = (typeof LAYOUTS)[number];

const Icon = z.enum(ICONS);
const shortText = (max: number) => z.string().trim().min(1).max(max);

export const VisualSchema = z.discriminatedUnion('layout', [
  z.object({
    layout: z.literal('bigNumber'),
    value: z.number().finite().nonnegative(),
    decimals: z.number().int().min(0).max(2).optional(),
    prefix: shortText(4).optional(),
    unit: z.string().trim().max(14),
    label: shortText(40),
    icon: Icon,
  }),
  z.object({
    layout: z.literal('compare'),
    unit: z.string().trim().max(14),
    items: z
      .array(z.object({label: shortText(18), value: z.number().finite().positive(), icon: Icon}))
      .min(2)
      .max(4),
  }),
  z.object({
    layout: z.literal('iconGrid'),
    icon: Icon,
    count: z.number().int().min(1).max(30),
    label: shortText(40),
  }),
  z.object({
    layout: z.literal('orbit'),
    center: Icon,
    satellite: Icon,
    label: shortText(40),
  }),
  z.object({
    layout: z.literal('steps'),
    steps: z.array(z.object({icon: Icon, text: shortText(22)})).min(2).max(4),
  }),
  z.object({
    layout: z.literal('spotlight'),
    icon: Icon,
    caption: shortText(60),
  }),
]);
export type Visual = z.infer<typeof VisualSchema>;

export const SceneSchema = z.object({
  role: z.enum(['hook', 'fact', 'recap', 'cta']),
  narration: z.string().trim().min(2).max(320),
  headline: shortText(48),
  highlight: z.array(z.string().trim().min(1)).max(3).default([]),
  pip: z.object({expression: z.enum(EXPRESSIONS), pose: z.enum(POSES)}),
  visual: VisualSchema.optional(),
  bullets: z.array(shortText(32)).max(3).optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const countWords = wordCount;

export const PlanSchema = z
  .object({
    category: z.enum(CATEGORIES),
    topic: shortText(80),
    mainFact: shortText(240),
    supportingDetails: z.array(shortText(240)).min(2).max(3),
    source: shortText(200),
    caption: z.string().trim().min(10).max(150),
    hashtags: z
      .array(z.string().regex(/^#[a-z0-9_]{2,30}$/, 'hashtags must look like #space (lowercase, no spaces)'))
      .min(3)
      .max(5),
    scenes: z.array(SceneSchema).min(8).max(12),
  })
  .superRefine((plan, ctx) => {
    const s = plan.scenes;
    const issue = (message: string, path: (string | number)[] = ['scenes']) =>
      ctx.addIssue({code: z.ZodIssueCode.custom, message, path});

    if (s[0]?.role !== 'hook') issue('scene 1 must have role "hook"');
    if (s[s.length - 2]?.role !== 'recap') issue('the second to last scene must have role "recap"');
    if (s[s.length - 1]?.role !== 'cta') issue('the last scene must have role "cta"');
    s.slice(1, -2).forEach((sc, i) => {
      if (sc.role !== 'fact') issue(`scene ${i + 2} must have role "fact"`);
      if (!sc.visual) issue(`fact scene ${i + 2} needs a "visual"`, ['scenes', i + 1, 'visual']);
    });
    if (s[0] && wordCount(s[0].narration) > 9) issue('hook narration must be 9 words or fewer (it has to fit in 3 seconds)');
    const recap = s[s.length - 2];
    if (recap && (!recap.bullets || recap.bullets.length < 2)) issue('recap scene needs 2 or 3 "bullets"');
    const cta = s[s.length - 1];
    if (cta && !/follow/i.test(cta.narration)) issue('cta narration must ask viewers to follow');

    const total = s.reduce((n, sc) => n + wordCount(sc.narration), 0);
    if (total < 145 || total > 170) issue(`total narration must be 150 to 165 words, it is ${total}`);

    const layouts = s.map((sc) => sc.visual?.layout).filter(Boolean) as string[];
    for (let i = 1; i < layouts.length; i++) {
      if (layouts[i] === layouts[i - 1]) issue(`two scenes in a row use layout "${layouts[i]}"; alternate layouts`);
    }
    if (new Set(layouts).size < 3) issue('use at least 3 different layouts');

    s.forEach((sc, i) => {
      for (const h of sc.highlight) {
        if (!sc.headline.toLowerCase().includes(h.toLowerCase())) {
          issue(`scene ${i + 1}: highlight "${h}" is not in its headline`, ['scenes', i, 'highlight']);
        }
      }
    });
  });
export type Plan = z.infer<typeof PlanSchema>;

// ---------- Render input (built by code from plan + voice) ----------

export type Word = {text: string; start: number; end: number}; // seconds

export type TimedScene = Scene & {from: number; durationInFrames: number};

export type VideoProps = {
  episode: number;
  title: string;
  scenes: TimedScene[];
  words: Word[];
  voiceFile: string | null; // file name inside the render's public dir
  musicFile: string | null;
  /** Video length in frames. Default 1860 (62 s). */
  totalFrames?: number;
  /** Key in remotion/character/registry.tsx. Default "pip"; null = no character (text and visuals only). */
  character?: string | null;
  /** Button text on the last scene. Default "+ Follow Pip". */
  ctaLabel?: string;
};
