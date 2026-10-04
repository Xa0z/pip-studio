/** The JSON Claude returns for a Pip Studio video (any niche, 30 to 62 s). Built on Pip Explains' scene schema. */
import {z} from 'zod';
import {countWords, SceneSchema, type Scene} from '../../src/schema.js';
import {wordRange} from '../../src/timeline.js';
import {HOOK_TYPES, type CtaType} from './goals.js';

export const CAPTION_STYLES = ['question', 'statement', 'list', 'challenge'] as const;

export type StudioPlanOptions = {seconds: number; cta: CtaType};

/** Scene count grows with length: 6 to 8 for 30 s, 8 to 12 for 62 s. */
export const sceneRange = (seconds: number) => ({min: seconds >= 55 ? 8 : seconds >= 40 ? 7 : 6, max: seconds >= 55 ? 12 : seconds >= 40 ? 10 : 8});

export function studioPlanSchema(opts: StudioPlanOptions) {
  const words = wordRange(opts.seconds);
  const scenes = sceneRange(opts.seconds);
  return z
    .object({
      niche: z.string().trim().min(1).max(60),
      category: z.string().trim().min(2).max(40),
      topic: z.string().trim().min(3).max(80),
      mainFact: z.string().trim().min(5).max(240),
      supportingDetails: z.array(z.string().trim().min(3).max(240)).min(2).max(3),
      source: z.string().trim().min(3).max(200),
      hookType: z.enum(HOOK_TYPES),
      captionStyle: z.enum(CAPTION_STYLES),
      caption: z.string().trim().min(10).max(150),
      hashtags: z.array(z.string().regex(/^#[a-z0-9_]{2,30}$/, 'hashtags must look like #space (lowercase, no spaces)')).min(3).max(5),
      scenes: z.array(SceneSchema).min(scenes.min).max(scenes.max),
    })
    .superRefine((plan, ctx) => {
      const s = plan.scenes as Scene[];
      const issue = (message: string) => ctx.addIssue({code: z.ZodIssueCode.custom, message, path: ['scenes']});
      if (s[0]?.role !== 'hook') issue('scene 1 must have role "hook"');
      if (s[s.length - 2]?.role !== 'recap') issue('the second to last scene must have role "recap"');
      if (s[s.length - 1]?.role !== 'cta') issue('the last scene must have role "cta"');
      s.slice(1, -2).forEach((sc, i) => {
        if (sc.role !== 'fact') issue(`scene ${i + 2} must have role "fact"`);
        if (!sc.visual) issue(`fact scene ${i + 2} needs a "visual"`);
      });
      if (s[0] && countWords(s[0].narration) > 9) issue('hook narration must be 9 words or fewer (it has to fit in 3 seconds)');
      const recap = s[s.length - 2];
      if (recap && (!recap.bullets || recap.bullets.length < 2)) issue('recap scene needs 2 or 3 "bullets"');
      const cta = s[s.length - 1]?.narration ?? '';
      if (opts.cta === 'follow' && !/follow/i.test(cta)) issue('cta narration must ask viewers to follow');
      if (opts.cta === 'comment' && !/comment/i.test(cta)) issue('cta narration must ask viewers to comment');
      if (opts.cta === 'link' && !(/link/i.test(cta) && /bio/i.test(cta))) issue('cta narration must point to the link in bio');
      const total = s.reduce((n, sc) => n + countWords(sc.narration), 0);
      if (total < words.min || total > words.max) issue(`total narration must be ${words.min} to ${words.max} words, it is ${total}`);
      const layouts = s.map((sc) => sc.visual?.layout).filter(Boolean) as string[];
      for (let i = 1; i < layouts.length; i++) if (layouts[i] === layouts[i - 1]) issue(`two scenes in a row use layout "${layouts[i]}"; alternate layouts`);
      if (new Set(layouts).size < 3) issue('use at least 3 different layouts');
      s.forEach((sc, i) => {
        for (const h of sc.highlight) if (!sc.headline.toLowerCase().includes(h.toLowerCase())) issue(`scene ${i + 1}: highlight "${h}" is not in its headline`);
      });
      if (/#/.test(plan.caption)) issue('no hashtags inside the caption');
    });
}

export type StudioPlan = z.infer<ReturnType<typeof studioPlanSchema>>;
