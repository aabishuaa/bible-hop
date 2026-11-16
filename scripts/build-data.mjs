#!/usr/bin/env node
// Rebuilds data/kjv.json and data/web.json from the two public-domain sources.
//
//   KJV  https://github.com/aruljohn/Bible-kjv        (one JSON file per book)
//   WEB  https://www.npmjs.com/package/world-english-bible  (json/<book>.json)
//
// Usage:  node scripts/build-data.mjs <dir with KJV json files> <dir with the WEB "package" folder>
//
// The output is one array per wording, in the KJV's numbering (directive rule 19.2):
//   { "name": "KJV", "books": [ [ ["verse 1", "verse 2", …] /* chapter 1 */, … ] /* Genesis */, … ] }
// A verse a wording does not have is stored as "" and then plays on the other wording.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [kjvDir, webDir] = process.argv.slice(2);
if (!kjvDir || !webDir) {
  console.error('Usage: node scripts/build-data.mjs <kjv-json-dir> <world-english-bible-package-dir>');
  process.exit(1);
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'];

// Rule 19.3: pilcrows removed, whitespace tidied. Typographic quotes are kept for display;
// the tokenizer treats curly and straight apostrophes as the same character (rule 4.1).
const clean = (s) => s.replace(/¶/g, '').replace(/[ \s]+/g, ' ').replace(/ ([,.;:?!])/g, '$1').trim();

const kjv = BOOKS.map((b) => {
  const j = JSON.parse(fs.readFileSync(path.join(kjvDir, b.replace(/ /g, '') + '.json'), 'utf8'));
  return j.chapters.map((c, ci) => {
    if (+c.chapter !== ci + 1) throw new Error(`KJV chapter order: ${b} ${c.chapter}`);
    return c.verses.map((v, vi) => {
      if (+v.verse !== vi + 1) throw new Error(`KJV verse order: ${b} ${c.chapter}:${v.verse}`);
      return clean(v.text);
    });
  });
});

// The WEB places the doxology of Romans at 14:24-26; it plays at the KJV's 16:25-27 (rule 19.2).
const WEB_MOVES = { 'Romans 14:24': [16, 25], 'Romans 14:25': [16, 26], 'Romans 14:26': [16, 27] };

const web = BOOKS.map((b, bi) => {
  const j = JSON.parse(fs.readFileSync(path.join(webDir, 'json', b.toLowerCase().replace(/ /g, '') + '.json'), 'utf8'));
  const chapters = kjv[bi].map((c) => c.map(() => ''));
  for (const x of j) {
    if (!x.chapterNumber || !x.verseNumber || typeof x.value !== 'string') continue; // headers (psalm titles) are not verses
    let c = x.chapterNumber, v = x.verseNumber;
    const move = WEB_MOVES[`${b} ${c}:${v}`];
    if (move) [c, v] = move;
    if (!chapters[c - 1] || chapters[c - 1][v - 1] === undefined) {
      if (x.value.trim()) throw new Error(`WEB verse outside the KJV numbering: ${b} ${c}:${v}`);
      continue;
    }
    chapters[c - 1][v - 1] += x.value;
  }
  return chapters.map((c) => c.map(clean));
});

const count = (bk) => bk.reduce((n, b) => n + b.reduce((m, c) => m + c.filter(Boolean).length, 0), 0);
const total = kjv.reduce((n, b) => n + b.reduce((m, c) => m + c.length, 0), 0);
if (total !== 31102) throw new Error(`Expected 31,102 verses in the KJV numbering, found ${total}`);
const missing = [];
kjv.forEach((b, bi) => b.forEach((c, ci) => c.forEach((_, vi) => { if (!web[bi][ci][vi]) missing.push(`${BOOKS[bi]} ${ci + 1}:${vi + 1}`); })));

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'kjv.json'), JSON.stringify({ name: 'KJV', books: kjv }));
fs.writeFileSync(path.join(out, 'web.json'), JSON.stringify({ name: 'WEB', books: web }));
console.log(`KJV: ${count(kjv)} verses.  WEB: ${count(web)} verses.`);
console.log(`The WEB lacks: ${missing.join(', ')}`);
