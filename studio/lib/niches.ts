/** The 8 niches that work well with animated, code-drawn videos. */
export type NicheId = 'science' | 'history' | 'psychology' | 'money' | 'tech' | 'motivation' | 'animals' | 'language';

export type Niche = {id: NicheId | string; label: string; emoji: string; guide: string; icons: string[]; hashtags: string[]};

export const NICHES: Niche[] = [
  {
    id: 'science',
    label: 'Science & space',
    emoji: '🔭',
    guide: 'True, well documented science and space facts (NASA, ESA, NOAA, Britannica, textbooks).',
    icons: ['sun', 'planet', 'earth', 'rocket', 'galaxy', 'atom', 'dna', 'brain', 'bolt', 'magnet'],
    hashtags: ['#science', '#space', '#didyouknow', '#facts'],
  },
  {
    id: 'history',
    label: 'History',
    emoji: '🏛',
    guide: 'Surprising but well documented history facts. Give years and places exactly; no legends told as facts (say "legend says" if needed).',
    icons: ['scroll', 'castle', 'crown', 'calendar', 'globe', 'book', 'clock', 'trophy'],
    hashtags: ['#history', '#historyfacts', '#didyouknow', '#learnontiktok'],
  },
  {
    id: 'psychology',
    label: 'Psychology',
    emoji: '🧠',
    guide: 'Psychology effects with a real, named research basis (e.g. "the spacing effect"). No pop-psych myths, no diagnosis, no medical advice.',
    icons: ['brain', 'smile', 'eye', 'speech', 'heart', 'lightbulb', 'target', 'clock'],
    hashtags: ['#psychology', '#psychologyfacts', '#mindset', '#didyouknow'],
  },
  {
    id: 'money',
    label: 'Money tips',
    emoji: '💰',
    guide: 'General, widely accepted personal finance ideas (budgeting, compound interest, emergency funds). Never promise returns, never name stocks or coins to buy. Add "not financial advice" in the caption.',
    icons: ['coin', 'chart', 'wallet', 'piggybank', 'calendar', 'target', 'lock', 'trophy'],
    hashtags: ['#moneytips', '#personalfinance', '#finance', '#savingmoney'],
  },
  {
    id: 'tech',
    label: 'Tech & AI',
    emoji: '🤖',
    guide: 'Useful tech and AI tips and true facts about how tech works. No brand logos; name products only in plain text when needed.',
    icons: ['robot', 'chip', 'laptop', 'phone', 'lightbulb', 'bolt', 'lock', 'globe'],
    hashtags: ['#tech', '#ai', '#techtips', '#learnontiktok'],
  },
  {
    id: 'motivation',
    label: 'Motivation & quotes',
    emoji: '🔥',
    guide: 'Motivation with practical takeaways. Quotes must be real and correctly attributed (well documented sources only), or clearly original. No fake quotes.',
    icons: ['trophy', 'target', 'fire', 'star', 'quote', 'mountain', 'sun', 'smile'],
    hashtags: ['#motivation', '#mindset', '#selfimprovement', '#quotes'],
  },
  {
    id: 'animals',
    label: 'Animal facts',
    emoji: '🐾',
    guide: 'True, well documented animal facts (National Geographic, Britannica, zoo and university sources).',
    icons: ['paw', 'octopus', 'whale', 'bird', 'bee', 'turtle', 'fish', 'butterfly'],
    hashtags: ['#animals', '#animalfacts', '#nature', '#didyouknow'],
  },
  {
    id: 'language',
    label: 'Language learning',
    emoji: '🗣',
    guide: 'Short English lessons: useful phrases, word origins, common mistakes. Every example sentence must be correct, natural English.',
    icons: ['speech', 'book', 'globe', 'quote', 'lightbulb', 'calendar', 'star', 'smile'],
    hashtags: ['#learnenglish', '#english', '#languagelearning', '#learnontiktok'],
  },
];

export const nicheById = (id: string): Niche =>
  NICHES.find((n) => n.id === id) ?? {
    id,
    label: id.replace(/^custom:/, ''),
    emoji: '✏️',
    guide: `Videos about "${id.replace(/^custom:/, '')}". Only accurate, well documented information.`,
    icons: ['lightbulb', 'star', 'book', 'globe', 'target', 'chart', 'clock', 'smile'],
    hashtags: ['#didyouknow', '#learnontiktok', '#facts'],
  };

export const nicheLabel = (id: string) => {
  const n = nicheById(id);
  return `${n.emoji} ${n.label}`;
};

/** Rotates niches: the next video uses the niche used least recently. */
export function nextNiche(niches: string[], recent: string[]): string {
  if (niches.length === 1) return niches[0];
  const last = recent.at(-1);
  return niches.find((n) => n !== last) ?? niches[0];
}
