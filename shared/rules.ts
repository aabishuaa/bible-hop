// Appendix A — every tunable value, with its default and allowed range.
// Code reads these from the active rule set and never hard-codes them.

export interface RuleSet {
  'oil.start': number;
  'oil.capacity': number;
  'oil.hop': number;
  'oil.revisit': number;
  'oil.widow': number;
  'oil.graceRelight': number;
  'gate.manna': number;
  'cord.verses': number;
  'wilderness.hops': number;
  'strikes.max': number;
  'lookBack.salt': number;
  'grace.perDay': number;
  'calf.multiplier': number;
  'tier.crumb': number;
  'tier.loaf': number;
  'tier.fish': number;
  'tier.pearl': number;
  'tier.nugget': number;
  'tier.nuggetMax': number;
  'tier.loafMin': number;
  'tier.fishMin': number;
  'tier.pearlMin': number;
  'ref.book': number;
  'ref.chapter': number;
  'ref.exact': number;
  'match.P': number;
  'match.R': number;
  'match.S': number;
  'match.auto': number;
  'match.refP': number;
  'match.refR': number;
  'match.refS': number;
  'match.tie': number;
  'match.doorPreference': number;
  'match.listMax': number;
  'match.listMinWords': number;
  'match.minWords': number;
  'match.maxChars': number;
  'ai.confidence': number;
  'ai.sharedWords': number;
  'ai.timeoutSeconds': number;
  'ai.perPlayerPerDay': number;
  'ai.cacheHours': number;
  'clock.lateWarningMinutes': number;
  'stuck.reminderAfter': number;
  'scribe.repeatDays': number;
  'scribe.chapterDays': number;
  'scribe.bookDays': number;
  'scribe.autofillHours': number;
  'scribe.waysHomeMin': number;
  'scribe.fallbackWaysHome': number;
  'scribe.ratingHardMax': number;
  'scribe.ratingMediumMax': number;
  'scribe.longVerseWords': number;
  'scribe.storehouseLow': number;
  'data.typedTextDays': number;
  'limits.hopsPerSecond': number;
  'limits.hopsPerDay': number;
  // Feature switches (rule 16.7)
  'feature.irregularForms': boolean;
  'feature.aiCheck': boolean;
  'feature.wordingSwitch': boolean;
  'feature.berean': boolean;
  'feature.sundaySchool': boolean;
  'feature.revelation': boolean;
  'feature.achievements': boolean;
}

export type RuleKey = keyof RuleSet;

export interface RuleSpec {
  key: RuleKey;
  default: number | boolean;
  min?: number;
  max?: number;
  step?: number;
  group: string;
  sets: string;
}

const N = (key: RuleKey, def: number, min: number, max: number, group: string, sets: string, step = 1): RuleSpec => ({ key, default: def, min, max, step, group, sets });
const F = (key: RuleKey, def: boolean, sets: string): RuleSpec => ({ key, default: def, group: 'Features', sets });

export const RULE_SPECS: RuleSpec[] = [
  N('oil.start', 12, 6, 24, 'Lamp oil', 'Drops at the start of the day'),
  N('oil.capacity', 12, 6, 24, 'Lamp oil', 'Most drops the lamp holds (at least oil.start)'),
  N('oil.hop', 1, 1, 3, 'Lamp oil', 'Drops a hop burns'),
  N('oil.revisit', 3, 1, 6, 'Lamp oil', 'Drops a revisit burns'),
  N('oil.widow', 3, 0, 6, 'Lamp oil', "Drops Widow's Oil adds"),
  N('oil.graceRelight', 3, 1, 12, 'Lamp oil', 'Drops Grace relights'),
  N('gate.manna', 50, 0, 200, 'Coming home', 'Manna needed to come home'),
  N('cord.verses', 3, 1, 6, 'Coming home', 'Different verses to visit before heading home'),
  N('calf.multiplier', 2, 0, 5, 'Coming home', 'Fatted Calf, times the homecoming tier value'),
  N('wilderness.hops', 40, 10, 100, 'Limits', 'Hop limit'),
  N('strikes.max', 3, 1, 5, 'Limits', 'Strikes in a row before the rooster crows'),
  N('lookBack.salt', 10, 0, 50, 'Limits', 'Extra manna a look back costs'),
  N('grace.perDay', 1, 0, 3, 'Limits', 'Graces per day'),
  N('tier.crumb', 1, 0, 100, 'Tiers', 'Crumb value'),
  N('tier.loaf', 5, 0, 100, 'Tiers', 'Loaf value'),
  N('tier.fish', 10, 0, 100, 'Tiers', 'Fish value'),
  N('tier.pearl', 25, 0, 100, 'Tiers', 'Pearl value'),
  N('tier.nugget', 50, 0, 200, 'Tiers', 'Golden Nugget value (it also opens the Golden Road home)'),
  N('tier.nuggetMax', 2, 2, 5, 'Tiers', 'Most verses a word may be in to be a Golden Nugget'),
  N('tier.loafMin', 300, 50, 2000, 'Tiers', 'Verse count that makes a Loaf'),
  N('tier.fishMin', 30, 5, 299, 'Tiers', 'Verse count that makes a Fish'),
  N('tier.pearlMin', 2, 2, 5, 'Tiers', 'Verse count that makes a Pearl; below it is a Wall'),
  N('ref.book', 1.25, 1, 3, 'Reference bonus', 'Right book', 0.05),
  N('ref.chapter', 1.5, 1, 3, 'Reference bonus', 'Right chapter', 0.05),
  N('ref.exact', 2, 1, 3, 'Reference bonus', 'Exact verse', 0.05),
  N('match.P', 0.5, 0, 1, 'Recognition', 'A candidate fits: share of typed words found', 0.01),
  N('match.R', 0.2, 0, 1, 'Recognition', 'A candidate fits: share of the verse typed', 0.01),
  N('match.S', 0.45, 0, 1, 'Recognition', 'A candidate fits: overall score', 0.01),
  N('match.auto', 0.55, 0, 1, 'Recognition', 'Chosen without asking', 0.01),
  N('match.refP', 0.45, 0, 1, 'Recognition', 'A reference-led match: typed words found', 0.01),
  N('match.refR', 0.2, 0, 1, 'Recognition', 'A reference-led match: share of the verse typed', 0.01),
  N('match.refS', 0.3, 0, 1, 'Recognition', 'A reference-led match: overall score', 0.01),
  N('match.tie', 0.06, 0, 0.3, 'Recognition', 'Margin that makes candidates rivals', 0.01),
  N('match.doorPreference', 0.15, 0, 0.5, 'Recognition', 'Margin for preferring verses with the door word', 0.01),
  N('match.listMax', 3, 1, 5, 'Recognition', 'Most rivals offered in a list'),
  N('match.listMinWords', 4, 2, 8, 'Recognition', 'Meaning words needed before a list is offered'),
  N('match.minWords', 2, 1, 4, 'Recognition', 'Meaning words needed to try matching'),
  N('match.maxChars', 1000, 200, 2000, 'Recognition', 'Characters matched'),
  N('ai.confidence', 0.6, 0, 1, 'AI check', 'Lowest AI confidence accepted', 0.01),
  N('ai.sharedWords', 2, 0, 4, 'AI check', 'Meaning words an AI proposal must share with the verse'),
  N('ai.timeoutSeconds', 8, 2, 30, 'AI check', 'AI check timeout'),
  N('ai.perPlayerPerDay', 30, 0, 100, 'AI check', 'AI checks per player per day'),
  N('ai.cacheHours', 24, 0, 72, 'AI check', 'How long AI answers are cached'),
  N('clock.lateWarningMinutes', 30, 0, 120, 'Clock', 'Warning before a late start'),
  N('stuck.reminderAfter', 3, 1, 10, 'Clock', 'Failures in one verse before the look-back reminder'),
  N('scribe.repeatDays', 365, 0, 3650, 'Scribes', 'Days before a verse may be home again'),
  N('scribe.chapterDays', 30, 0, 365, 'Scribes', 'Same-chapter warning window'),
  N('scribe.bookDays', 7, 0, 90, 'Scribes', 'Same-book warning window'),
  N('scribe.autofillHours', 48, 12, 168, 'Scribes', 'When an empty date is filled before it opens'),
  N('scribe.waysHomeMin', 2, 2, 6, 'Scribes', 'Ways home needed to schedule a verse'),
  N('scribe.fallbackWaysHome', 4, 2, 10, 'Scribes', 'Ways home for the emergency fallback'),
  N('scribe.ratingHardMax', 3, 2, 10, 'Scribes', 'Most ways home that still rates Hard'),
  N('scribe.ratingMediumMax', 6, 3, 20, 'Scribes', 'Most ways home that still rates Medium'),
  N('scribe.longVerseWords', 60, 20, 120, 'Scribes', 'Long-verse warning'),
  N('scribe.storehouseLow', 14, 0, 60, 'Scribes', 'Storehouse warning'),
  N('data.typedTextDays', 30, 0, 365, 'Data', 'Days typed text is kept'),
  N('limits.hopsPerSecond', 1, 1, 10, 'Data', 'Hop attempts per second, per player'),
  N('limits.hopsPerDay', 300, 50, 2000, 'Data', 'Hop attempts per day, per player'),
  F('feature.irregularForms', true, 'Irregular forms count as the same word (spake = speak)'),
  F('feature.aiCheck', true, 'The AI check for paraphrases and other translations'),
  F('feature.wordingSwitch', true, 'Players can switch between the KJV and the WEB'),
  F('feature.berean', true, 'Berean Mode (hard mode)'),
  F('feature.sundaySchool', true, 'Sunday School (practice)'),
  F('feature.revelation', true, "Revelation (the day's shared results)"),
  F('feature.achievements', true, 'Achievements'),
];

export function defaultRules(): RuleSet {
  return Object.fromEntries(RULE_SPECS.map((s) => [s.key, s.default])) as unknown as RuleSet;
}

/** Checks a proposed rule set against the allowed ranges. Returns a list of problems. */
export function validateRules(r: RuleSet): string[] {
  const problems: string[] = [];
  for (const s of RULE_SPECS) {
    const v = r[s.key];
    if (typeof s.default === 'boolean') {
      if (typeof v !== 'boolean') problems.push(`${s.key} must be on or off`);
      continue;
    }
    if (typeof v !== 'number' || Number.isNaN(v)) problems.push(`${s.key} must be a number`);
    else if (v < s.min! || v > s.max!) problems.push(`${s.key} must be between ${s.min} and ${s.max}`);
  }
  if (r['oil.capacity'] < r['oil.start']) problems.push('oil.capacity must be at least oil.start');
  if (r['tier.fishMin'] >= r['tier.loafMin']) problems.push('tier.fishMin must be below tier.loafMin');
  if (r['tier.pearlMin'] >= r['tier.fishMin']) problems.push('tier.pearlMin must be below tier.fishMin');
  if (r['tier.nuggetMax'] >= r['tier.fishMin']) problems.push('tier.nuggetMax must be below tier.fishMin');
  if (r['scribe.ratingHardMax'] >= r['scribe.ratingMediumMax']) problems.push('scribe.ratingHardMax must be below scribe.ratingMediumMax');
  return problems;
}

export type Tier = 'crumb' | 'loaf' | 'fish' | 'pearl' | 'nugget' | 'wall';
export const TIER_NAMES: Record<Tier, string> = { crumb: 'Crumb', loaf: 'Loaf', fish: 'Fish', pearl: 'Pearl', nugget: 'Golden Nugget', wall: 'Wall' };

export function tierValue(tier: Tier, r: RuleSet): number {
  return tier === 'crumb' ? r['tier.crumb'] : tier === 'loaf' ? r['tier.loaf'] : tier === 'fish' ? r['tier.fish'] : tier === 'pearl' ? r['tier.pearl'] : tier === 'nugget' ? r['tier.nugget'] : 0;
}

/** Rule 6.1: rounded half up. */
export function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5 + 1e-9);
}
