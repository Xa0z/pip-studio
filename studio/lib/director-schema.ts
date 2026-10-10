/**
 * The JSON Claude returns when it plans a video as a creative director (step 1 of 2).
 * Unlike the layout plan there is no fixed structure: beats say what is said and what the
 * viewer should see in free words, and "brief" is the prompt for the second Claude call,
 * which writes the whole video as Remotion code (studio/worker/director.ts).
 */
import {z} from 'zod';
import {countWords, ICONS, MAX_MEDIA_SCENES, SceneSchema, type Scene} from '../../src/schema.js';
import {wordRange} from '../../src/timeline.js';
import {HOOK_TYPES} from './goals.js';
import {CAPTION_STYLES, sceneRange, type StudioPlanOptions} from './plan-schema.js';

export const BeatSchema = SceneSchema.extend({
  /** What the viewer sees and how it moves, in plain words (for the code-writing step). */
  idea: z.string().trim().min(10).max(600),
  /** Shown if the episode code can't be used and the video falls back to the scene layouts. */
  icon: z.enum(ICONS).optional(),
});
export type BeatPlan = z.infer<typeof BeatSchema>;

export function directorPlanSchema(opts: StudioPlanOptions) {
  const words = wordRange(opts.seconds);
  const scenes = sceneRange(opts.seconds);
  return z
    .object({
      niche: z.string().trim().min(1).max(60),
      category: z.string().trim().min(2).max(40),
      topic: z.string().trim().min(3).max(80),
      /** The kind of video this one is, in a few words ("myth vs fact", "countdown", "tiny story"...). */
      format: z.string().trim().min(3).max(60),
      mainFact: z.string().trim().min(5).max(240),
      supportingDetails: z.array(z.string().trim().min(3).max(240)).min(1).max(4),
      source: z.string().trim().min(3).max(200),
      hookType: z.enum(HOOK_TYPES),
      captionStyle: z.enum(CAPTION_STYLES),
      caption: z.string().trim().min(10).max(150),
      hashtags: z.array(z.string().regex(/^#[a-z0-9_]{2,30}$/, 'hashtags must look like #space (lowercase, no spaces)')).min(3).max(5),
      /** The creative brief for the animator: look, motion, pacing, 3D, how the character acts. */
      brief: z.string().trim().min(300).max(6000),
      scenes: z.array(BeatSchema).min(scenes.min).max(scenes.max),
    })
    .superRefine((plan, ctx) => {
      const s = plan.scenes as Scene[];
      const issue = (message: string) => ctx.addIssue({code: z.ZodIssueCode.custom, message, path: ['scenes']});
      if (s[0]?.role !== 'hook') issue('beat 1 must have role "hook"');
      if (s[s.length - 1]?.role !== 'cta') issue('the last beat must have role "cta"');
      s.slice(1, -1).forEach((sc, i) => {
        if (sc.role === 'hook' || sc.role === 'cta') issue(`beat ${i + 2} must have role "fact" or "recap"`);
      });
      if (s[0] && countWords(s[0].narration) > 9) issue('hook narration must be 9 words or fewer (it has to fit in 3 seconds)');
      s.forEach((sc, i) => {
        if (countWords(sc.narration) > 24) issue(`beat ${i + 1} has more than 24 words; split it so no beat runs longer than 8 seconds`);
        for (const h of sc.highlight) if (!sc.headline.toLowerCase().includes(h.toLowerCase())) issue(`beat ${i + 1}: highlight "${h}" is not in its headline`);
      });
      const cta = s[s.length - 1]?.narration ?? '';
      if (opts.cta === 'follow' && !/follow/i.test(cta)) issue('cta narration must ask viewers to follow');
      if (opts.cta === 'comment' && !/comment/i.test(cta)) issue('cta narration must ask viewers to comment');
      if (opts.cta === 'link' && !(/link/i.test(cta) && /bio/i.test(cta))) issue('cta narration must point to the link in bio');
      const total = s.reduce((n, sc) => n + countWords(sc.narration), 0);
      if (total < words.min || total > words.max) issue(`total narration must be ${words.min} to ${words.max} words, it is ${total}`);
      if (/#/.test(plan.caption)) issue('no hashtags inside the caption');
      const media = s.filter((sc) => sc.visual?.layout === 'media');
      if (media.length > MAX_MEDIA_SCENES) issue(`ask for a real photo or clip ("media") at most ${MAX_MEDIA_SCENES} times`);
      if (s.some((sc) => sc.visual?.layout === 'media' && sc.visual.src)) issue('leave "src" out of media visuals (code fills it in)');
    });
}

export type DirectorPlan = z.infer<ReturnType<typeof directorPlanSchema>>;
