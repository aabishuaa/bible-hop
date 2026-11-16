// The 66 books in canonical order, with the short forms of Appendix E and the
// seven divisions the trip map labels (rule 13.3).

export type Division = 'Law' | 'History' | 'Poetry' | 'Prophets' | 'Gospels & Acts' | 'Letters' | 'Revelation';

export interface BookInfo {
  name: string;
  short: string;
  aliases: string[];
  division: Division;
  testament: 'OT' | 'NT';
}

const B = (name: string, short: string, aliases: string, division: Division, testament: 'OT' | 'NT'): BookInfo => ({
  name,
  short,
  aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean),
  division,
  testament,
});

export const BOOKS: BookInfo[] = [
  B('Genesis', 'Gen', 'Gen, Ge, Gn', 'Law', 'OT'),
  B('Exodus', 'Exod', 'Exod, Exo, Ex', 'Law', 'OT'),
  B('Leviticus', 'Lev', 'Lev, Le, Lv', 'Law', 'OT'),
  B('Numbers', 'Num', 'Num, Nu, Nm, Nb', 'Law', 'OT'),
  B('Deuteronomy', 'Deut', 'Deut, De, Dt, Deu', 'Law', 'OT'),
  B('Joshua', 'Josh', 'Josh, Jos, Jsh', 'History', 'OT'),
  B('Judges', 'Judg', 'Judg, Jdg, Jg, Jdgs', 'History', 'OT'),
  B('Ruth', 'Ruth', 'Rth, Ru', 'History', 'OT'),
  B('1 Samuel', '1 Sam', '1 Sam, 1 Sa, 1 Sm, 1 S', 'History', 'OT'),
  B('2 Samuel', '2 Sam', '2 Sam, 2 Sa, 2 Sm, 2 S', 'History', 'OT'),
  B('1 Kings', '1 Kgs', '1 Kgs, 1 Ki, 1 Kin, 1 K', 'History', 'OT'),
  B('2 Kings', '2 Kgs', '2 Kgs, 2 Ki, 2 Kin, 2 K', 'History', 'OT'),
  B('1 Chronicles', '1 Chr', '1 Chr, 1 Ch, 1 Chron', 'History', 'OT'),
  B('2 Chronicles', '2 Chr', '2 Chr, 2 Ch, 2 Chron', 'History', 'OT'),
  B('Ezra', 'Ezra', 'Ezr', 'History', 'OT'),
  B('Nehemiah', 'Neh', 'Neh, Ne', 'History', 'OT'),
  B('Esther', 'Esth', 'Esth, Est, Es', 'History', 'OT'),
  B('Job', 'Job', 'Jb', 'Poetry', 'OT'),
  B('Psalms', 'Ps', 'Ps, Psa, Psalm, Pss, Psm, Pslm', 'Poetry', 'OT'),
  B('Proverbs', 'Prov', 'Prov, Pro, Prv, Pr', 'Poetry', 'OT'),
  B('Ecclesiastes', 'Eccl', 'Eccl, Ecc, Ec, Qoh, Eccles', 'Poetry', 'OT'),
  B('Song of Solomon', 'Song', 'Song, Song of Songs, Songs, Sos, So, Canticles, Cant, Sng, Song of Sol', 'Poetry', 'OT'),
  B('Isaiah', 'Isa', 'Isa, Is', 'Prophets', 'OT'),
  B('Jeremiah', 'Jer', 'Jer, Je, Jr', 'Prophets', 'OT'),
  B('Lamentations', 'Lam', 'Lam, La', 'Prophets', 'OT'),
  B('Ezekiel', 'Ezek', 'Ezek, Eze, Ezk', 'Prophets', 'OT'),
  B('Daniel', 'Dan', 'Dan, Da, Dn', 'Prophets', 'OT'),
  B('Hosea', 'Hos', 'Hos, Ho', 'Prophets', 'OT'),
  B('Joel', 'Joel', 'Jl, Joe', 'Prophets', 'OT'),
  B('Amos', 'Amos', 'Am', 'Prophets', 'OT'),
  B('Obadiah', 'Obad', 'Obad, Ob', 'Prophets', 'OT'),
  B('Jonah', 'Jonah', 'Jon, Jnh', 'Prophets', 'OT'),
  B('Micah', 'Mic', 'Mic, Mc', 'Prophets', 'OT'),
  B('Nahum', 'Nah', 'Nah, Na', 'Prophets', 'OT'),
  B('Habakkuk', 'Hab', 'Hab, Hb', 'Prophets', 'OT'),
  B('Zephaniah', 'Zeph', 'Zeph, Zep, Zp', 'Prophets', 'OT'),
  B('Haggai', 'Hag', 'Hag, Hg', 'Prophets', 'OT'),
  B('Zechariah', 'Zech', 'Zech, Zec, Zc', 'Prophets', 'OT'),
  B('Malachi', 'Mal', 'Mal, Ml', 'Prophets', 'OT'),
  B('Matthew', 'Matt', 'Matt, Mat, Mt', 'Gospels & Acts', 'NT'),
  B('Mark', 'Mark', 'Mrk, Mk, Mr', 'Gospels & Acts', 'NT'),
  B('Luke', 'Luke', 'Luk, Lk', 'Gospels & Acts', 'NT'),
  B('John', 'John', 'Jn, Jhn, Joh', 'Gospels & Acts', 'NT'),
  B('Acts', 'Acts', 'Act, Ac, Acts of the Apostles', 'Gospels & Acts', 'NT'),
  B('Romans', 'Rom', 'Rom, Ro, Rm', 'Letters', 'NT'),
  B('1 Corinthians', '1 Cor', '1 Cor, 1 Co', 'Letters', 'NT'),
  B('2 Corinthians', '2 Cor', '2 Cor, 2 Co', 'Letters', 'NT'),
  B('Galatians', 'Gal', 'Gal, Ga', 'Letters', 'NT'),
  B('Ephesians', 'Eph', 'Eph, Ephes', 'Letters', 'NT'),
  B('Philippians', 'Phil', 'Phil, Php, Pp, Philip', 'Letters', 'NT'),
  B('Colossians', 'Col', 'Col, Co', 'Letters', 'NT'),
  B('1 Thessalonians', '1 Thess', '1 Thess, 1 Th, 1 Thes', 'Letters', 'NT'),
  B('2 Thessalonians', '2 Thess', '2 Thess, 2 Th, 2 Thes', 'Letters', 'NT'),
  B('1 Timothy', '1 Tim', '1 Tim, 1 Ti', 'Letters', 'NT'),
  B('2 Timothy', '2 Tim', '2 Tim, 2 Ti', 'Letters', 'NT'),
  B('Titus', 'Titus', 'Tit, Ti', 'Letters', 'NT'),
  B('Philemon', 'Phlm', 'Phlm, Philem, Phm, Pm', 'Letters', 'NT'),
  B('Hebrews', 'Heb', 'Heb', 'Letters', 'NT'),
  B('James', 'Jas', 'Jas, Jm, Jam', 'Letters', 'NT'),
  B('1 Peter', '1 Pet', '1 Pet, 1 Pe, 1 Pt, 1 P', 'Letters', 'NT'),
  B('2 Peter', '2 Pet', '2 Pet, 2 Pe, 2 Pt, 2 P', 'Letters', 'NT'),
  B('1 John', '1 John', '1 Jn, 1 Jhn, 1 Jo, 1 Joh, 1 J', 'Letters', 'NT'),
  B('2 John', '2 John', '2 Jn, 2 Jhn, 2 Jo, 2 Joh', 'Letters', 'NT'),
  B('3 John', '3 John', '3 Jn, 3 Jhn, 3 Jo, 3 Joh', 'Letters', 'NT'),
  B('Jude', 'Jude', 'Jud, Jde', 'Letters', 'NT'),
  B('Revelation', 'Rev', 'Rev, Re, Rv, Revelations, Revelation of John, Apocalypse', 'Revelation', 'NT'),
];

export const DIVISIONS: Division[] = ['Law', 'History', 'Poetry', 'Prophets', 'Gospels & Acts', 'Letters', 'Revelation'];

/** How a player sees a book in a reference: "Psalm 23:1", not "Psalms 23:1". */
export function displayBook(bookIndex: number): string {
  const n = BOOKS[bookIndex].name;
  return n === 'Psalms' ? 'Psalm' : n;
}
