// Appendix D — the message catalog, in plain language first.
// The meaning, the rule and the scripture behind each message are kept; the heavier jargon is not.
import type { GraceLoss, LossInfo, LossReason, MessageView } from './types.ts';

type P = Record<string, string | number | undefined>;
type Tone = MessageView['tone'];

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

const CATALOG: Record<string, { tone: Tone; text: (p: P) => string }> = {
  'hop.ok': {
    tone: 'good',
    text: (p) => {
      const as = p.form && String(p.form).toLowerCase() !== String(p.word).toLowerCase() ? ` (as \u201c${p.form}\u201d)` : '';
      const parts = [`${p.ref} through \u201c${p.word}\u201d${as}`, `+${p.n} manna`];
      if (p.bonus === 'exact') parts.push('exact reference \u00d72');
      else if (p.bonus === 'chapter') parts.push('right chapter \u00d71.5');
      else if (p.bonus === 'book') parts.push('right book \u00d71.25');
      if (p.revisit) parts.push(`return visit, ${p.oil} oil`);
      if (p.widow) parts.push(`+${p.widow} oil from this verse`);
      return parts.join(' \u00b7 ');
    },
  },
  'hop.nugget': { tone: 'good', text: (p) => `Golden Nugget! The Golden Road home is open: one tap takes you home for ${p.n} manna.` },
  'hop.goldenHome': { tone: 'good', text: (p) => `Home by the Golden Road. The feast adds ${p.n} manna.` },
  'golden.closed': { tone: 'warn', text: () => 'The Golden Road opens only from the verse a Golden Nugget brought you to.' },
  'hop.home': { tone: 'good', text: (p) => `Home through “${p.word}”. The homecoming feast adds ${p.n} manna.` },
  'refuse.same': { tone: 'warn', text: () => 'You are already standing on that verse. Hop somewhere new.' },
  'refuse.entry': { tone: 'warn', text: (p) => `You already came through the “${p.word}” door into ${p.ref}. Choose a different word.` },
  'refuse.entryHome': { tone: 'warn', text: (p) => `You left home through “${p.word}”. Come home through a different word, not another form of it.` },
  'refuse.exit': { tone: 'warn', text: (p) => `You already used “${p.word}” in this verse, and its other forms share that door. Pick another word.` },
  'refuse.wall': { tone: 'warn', text: (p) => `“${p.word}” appears only in this verse. It is a wall, not a door.` },
  'refuse.cord': { tone: 'warn', text: (p) => `Not yet. Visit ${plural(Number(p.n), 'more verse')} before heading home.` },
  'refuse.crumb': { tone: 'warn', text: (p) => `No crumbs at the gate. Come home through a real word, not “${p.word}”.` },
  'refuse.manna': { tone: 'warn', text: (p) => `You need ${p.need} manna to come home. You have ${p.m}.` },
  'refuse.repeat': { tone: 'warn', text: (p) => `No vain repetitions: “${p.word}” has already carried you once today.` },
  'refuse.noRef': { tone: 'warn', text: () => 'Berean Mode: add at least the book and chapter to hop.' },
  'refuse.noDoor': { tone: 'warn', text: () => 'Tap a word in the verse first. That word is your door.' },
  'strike.word': { tone: 'bad', text: (p) => `${p.ref} is a real verse, but it doesn’t contain “${p.word}” or any form of it. Strike ${p.n} of ${p.max}.` },
  'strike.nomatch': { tone: 'bad', text: (p) => `That doesn’t match a verse I can find. Strike ${p.n} of ${p.max}.` },
  gap: { tone: 'warn', text: (p) => `${p.ref} doesn’t have “${p.word}” in its KJV or WEB wording, so this hop can’t count. No strike.` },
  'ask.short': { tone: 'warn', text: () => 'Type more of the verse. A few words at least, so it can be recognized.' },
  'ask.more': { tone: 'warn', text: () => 'Several verses fit that. Type more of it, or add the reference.' },
  'ask.refrain': { tone: 'warn', text: () => 'That line appears in many verses. Add the reference.' },
  'ask.refOnly': { tone: 'warn', text: () => 'Type the words of the verse. The reference goes in its own box.' },
  'ask.long': { tone: 'info', text: () => 'That’s more than one verse. Type just the one you mean.' },
  'ask.weak': { tone: 'warn', text: () => 'I can’t place that verse yet. Add more of its wording, or its reference.' },
  'ask.aiDown': { tone: 'warn', text: () => 'The verse check is busy. Type more of the exact wording, or add the reference.' },
  'confirm.one': { tone: 'info', text: () => 'Is this the verse you meant?' },
  'confirm.ai': { tone: 'info', text: () => 'The AI check reads that as this verse. Is it the one you meant?' },
  'confirm.choose': { tone: 'info', text: () => 'That wording fits more than one verse. Which one did you mean?' },
  'confirm.no': { tone: 'info', text: () => 'Okay. Try more of the wording, or add the reference.' },
  'confirm.lamp': { tone: 'warn', text: (p) => `This return visit burns ${plural(Number(p.burn), 'drop')} and you have ${p.d}. Your lamp will go out.` },
  'confirm.gone': { tone: 'info', text: () => 'That choice is no longer waiting. Carry on from here.' },
  'lookback.done': { tone: 'info', text: (p) => `You looked back to ${p.ref}. That cost ${p.n} manna.` },
  'lookback.none': { tone: 'warn', text: () => 'There is no hop to undo yet.' },
  'stuck.hint': { tone: 'info', text: (p) => `Stuck? You can look back to ${p.ref}. It costs the manna that hop earned, plus ${p.salt}.` },
  'time.late': { tone: 'warn', text: (p) => `The door shuts in ${plural(Number(p.m), 'minute')}.` },
  'time.offline': { tone: 'warn', text: () => 'You’re offline. Your typing is saved, and hops will be checked when you reconnect.' },
  'time.over': { tone: 'bad', text: () => 'Midnight has come. The door is shut for this day.' },
  'rate.second': { tone: 'warn', text: () => 'One hop at a time. Try again in a moment.' },
  'rate.day': { tone: 'warn', text: () => 'That’s the limit of hop attempts for one day.' },
  stale: { tone: 'info', text: () => 'This journey moved on from another device. Here is where it stands now.' },
  'grace.used': { tone: 'good', text: (p) => String(p.text) },
  'grace.declined': { tone: 'info', text: () => 'You ended the day.' },
  'share.copied': { tone: 'good', text: () => 'Copied. Paste it wherever you like.' },
  'mode.berean': { tone: 'info', text: () => 'Berean Mode is on for today: each word carries you once, and every hop needs a reference.' },
  'mode.standard': { tone: 'info', text: () => 'Berean Mode is off.' },
};

export function message(code: string, params: P = {}): MessageView {
  const m = CATALOG[code];
  if (!m) return { code, text: code, tone: 'info' };
  return { code, text: m.text(params), tone: m.tone };
}

const LOSSES: Record<LossReason, Omit<LossInfo, 'reason'>> = {
  lamp: { name: 'The Lamp Goes Out', line: 'Your oil ran dry before you made it home.', cite: 'Matthew 25:8' },
  door: { name: 'The Door Is Shut', line: 'Midnight came before you made it home.', cite: 'Matthew 25:10' },
  wilderness: { name: 'Lost in the Wilderness', line: 'Forty hops and still not home.', cite: 'Numbers 14:33' },
  fish: { name: 'Swallowed by the Fish', line: 'Every door in that verse was already used, so there was no way out.', cite: 'Jonah 1:17' },
  famine: { name: 'Famine', line: 'You looked back again while your manna was already below zero.', cite: 'Genesis 41:30' },
  rooster: { name: 'The Rooster Crows', line: 'Three wrong verses in a row.', cite: 'Matthew 26:75' },
};

export function lossInfo(reason: LossReason, hopLimit = 40, strikesMax = 3): LossInfo {
  const base = LOSSES[reason];
  let line = base.line;
  if (reason === 'wilderness' && hopLimit !== 40) line = `${hopLimit} hops and still not home.`;
  if (reason === 'rooster' && strikesMax !== 3) line = `${strikesMax} wrong verses in a row.`;
  return { reason, ...base, line };
}

/** What Grace will do for the losses one move caused (rules 11.2 and 11.5). */
export function graceText(losses: GraceLoss[], relight: number): string {
  const lamp = losses.includes('lamp'), fish = losses.includes('fish');
  if (lamp && fish) return `Grace brings you back to the last verse and relights your lamp with ${plural(relight, 'drop')}.`;
  if (lamp) return `Grace relights your lamp with ${plural(relight, 'drop')} of oil.`;
  if (fish) return 'Grace has the fish spit you back onto the last verse you stood on. Jonah 2:10';
  if (losses.includes('famine')) return 'Grace resets your manna to zero so you can keep going.';
  return 'Grace clears your strikes so you can keep going.';
}

export const GRACE_CITE = '2 Corinthians 12:9';
