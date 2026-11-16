// The first stock of the Storehouse (rule 16.4): the demo's fourteen calendar verses, in order,
// followed by well-loved verses from across the Bible, enough to carry the game for a year.
// Scribes add, remove and reorder them from the Desk. Every verse is run through the Verse check
// when the Storehouse is first filled; one that cannot be scheduled is left out.

export const FIRST_FOURTEEN = [
  'Psalm 119:105', 'John 1:5', 'Isaiah 40:31', 'Genesis 1:1', 'Proverbs 3:5', 'Matthew 5:14', 'Psalm 23:1',
  'Micah 6:8', 'Joshua 1:9', 'Lamentations 3:23', 'John 14:6', 'Hebrews 11:1', 'Psalm 46:10', 'Romans 8:28',
];

export const MORE_VERSES = `
John 3:16; Philippians 4:13; Jeremiah 29:11; Romans 12:2; Psalm 46:1; Galatians 5:22; Isaiah 41:10; Matthew 6:33;
2 Timothy 1:7; Proverbs 3:6; Romans 3:23; Ephesians 2:8; 1 Corinthians 13:4; Psalm 27:1; Matthew 11:28; Isaiah 53:5;
John 10:10; Romans 6:23; Psalm 37:4; 1 John 4:8; Philippians 4:6; Matthew 28:19; Hebrews 12:2; James 1:5;
Psalm 19:14; Isaiah 26:3; John 8:32; Romans 5:8; 2 Corinthians 5:17; Psalm 51:10; Matthew 5:16; Deuteronomy 6:5;
Proverbs 22:6; Ecclesiastes 3:1; Isaiah 9:6; John 11:25; Acts 1:8; Romans 10:9; 1 Corinthians 10:13; Galatians 2:20;
Ephesians 6:11; Philippians 1:6; Colossians 3:23; 1 Thessalonians 5:18; 2 Timothy 3:16; Hebrews 4:12; James 4:7;
1 Peter 5:7; 1 John 1:9; Revelation 3:20; Genesis 1:27; Exodus 14:14; Numbers 6:24; Deuteronomy 31:6; Joshua 24:15;
1 Samuel 16:7; 2 Chronicles 7:14; Nehemiah 8:10; Job 19:25; Psalm 1:1; Psalm 8:1; Psalm 16:11; Psalm 18:2;
Psalm 34:8; Psalm 42:1; Psalm 56:3; Psalm 91:1; Psalm 100:4; Psalm 103:12; Psalm 118:24; Psalm 121:1; Psalm 127:1;
Psalm 133:1; Psalm 139:14; Psalm 145:18; Psalm 150:6; Proverbs 1:7; Proverbs 4:23; Proverbs 15:1; Proverbs 16:3;
Proverbs 17:17; Proverbs 18:10; Proverbs 27:17; Proverbs 31:30; Ecclesiastes 12:13; Song of Solomon 8:7; Isaiah 1:18;
Isaiah 6:8; Isaiah 40:8; Isaiah 43:2; Isaiah 55:8; Isaiah 60:1; Jeremiah 17:7; Jeremiah 33:3; Ezekiel 36:26;
Daniel 3:17; Hosea 6:6; Joel 2:28; Amos 5:24; Jonah 2:9; Habakkuk 2:14; Zephaniah 3:17; Zechariah 4:6; Malachi 3:10;
Matthew 4:4; Matthew 5:9; Matthew 6:21; Matthew 7:7; Matthew 16:26; Matthew 19:26; Matthew 22:37; Matthew 25:40;
Mark 8:36; Mark 10:45; Mark 12:30; Mark 16:15; Luke 1:37; Luke 2:11; Luke 6:31; Luke 9:23; Luke 12:34; Luke 19:10;
John 1:1; John 1:14; John 4:24; John 6:35; John 8:12; John 10:11; John 13:34; John 14:27; John 15:5; John 15:13;
John 16:33; John 20:29; Acts 2:38; Acts 4:12; Acts 16:31; Acts 17:28; Acts 20:35; Romans 1:16; Romans 5:1; Romans 8:1;
Romans 8:38; Romans 12:1; Romans 12:21; Romans 15:13; 1 Corinthians 1:18; 1 Corinthians 6:19; 1 Corinthians 13:13;
1 Corinthians 15:58; 1 Corinthians 16:14; 2 Corinthians 4:18; 2 Corinthians 5:7; 2 Corinthians 9:7; 2 Corinthians 12:9;
Galatians 6:9; Ephesians 2:10; Ephesians 3:20; Ephesians 4:32; Ephesians 5:2; Ephesians 6:10; Philippians 2:3;
Philippians 3:14; Philippians 4:4; Philippians 4:7; Philippians 4:8; Philippians 4:19; Colossians 3:2; Colossians 3:17;
1 Thessalonians 5:16; 2 Thessalonians 3:3; 1 Timothy 4:12; 1 Timothy 6:12; 2 Timothy 2:15; 2 Timothy 4:7; Titus 3:5;
Hebrews 10:23; Hebrews 11:6; Hebrews 13:5; Hebrews 13:8; James 1:2; James 1:17; James 1:22; James 2:17; James 5:16;
1 Peter 2:9; 1 Peter 3:15; 1 Peter 4:8; 2 Peter 3:9; 1 John 3:1; 1 John 4:4; 1 John 4:19; 1 John 5:4; Jude 1:24;
Revelation 1:8; Revelation 21:4; Revelation 22:13; Genesis 2:7; Genesis 12:2; Genesis 28:15; Genesis 50:20;
Exodus 3:14; Exodus 15:2; Exodus 20:12; Exodus 33:14; Leviticus 19:18; Numbers 23:19; Deuteronomy 7:9;
Deuteronomy 8:3; Deuteronomy 30:19; Deuteronomy 33:27; Joshua 1:8; Judges 6:12; Ruth 1:16; 1 Samuel 2:2;
1 Samuel 15:22; 1 Samuel 17:47; 2 Samuel 22:31; 1 Kings 8:56; 1 Kings 19:12; 2 Kings 6:16; 1 Chronicles 16:11;
1 Chronicles 29:11; 2 Chronicles 16:9; 2 Chronicles 20:15; Ezra 7:10; Nehemiah 1:11; Esther 4:14; Job 1:21; Job 23:10;
Job 42:2; Psalm 3:3; Psalm 4:8; Psalm 5:3; Psalm 9:1; Psalm 20:7; Psalm 24:1; Psalm 25:4; Psalm 28:7; Psalm 30:5;
Psalm 31:24; Psalm 32:8; Psalm 33:12; Psalm 34:18; Psalm 40:1; Psalm 47:1; Psalm 55:22; Psalm 62:1; Psalm 63:1;
Psalm 66:1; Psalm 73:26; Psalm 84:11; Psalm 86:5; Psalm 90:12; Psalm 94:19; Psalm 95:1; Psalm 96:1; Psalm 107:1;
Psalm 111:10; Psalm 116:1; Psalm 119:11; Psalm 122:1; Psalm 126:5; Psalm 136:1; Psalm 138:8; Psalm 143:8; Psalm 147:3;
Proverbs 2:6; Proverbs 10:12; Proverbs 11:25; Proverbs 12:25; Proverbs 13:20; Proverbs 14:12; Proverbs 16:9;
Proverbs 16:18; Proverbs 19:21; Proverbs 21:2; Proverbs 24:16; Proverbs 25:11; Proverbs 28:13; Proverbs 29:25;
Proverbs 30:5; Ecclesiastes 4:9; Ecclesiastes 9:10; Ecclesiastes 11:1; Song of Solomon 2:4; Isaiah 12:2; Isaiah 25:8;
Isaiah 30:15; Isaiah 40:28; Isaiah 43:19; Isaiah 49:15; Isaiah 54:10; Isaiah 55:6; Isaiah 58:11; Isaiah 61:1;
Isaiah 64:8; Jeremiah 1:5; Jeremiah 9:24; Jeremiah 31:3; Jeremiah 32:17; Lamentations 3:22; Ezekiel 37:5; Daniel 2:20;
Daniel 6:22; Daniel 12:3; Hosea 10:12; Joel 2:13; Amos 3:3; Obadiah 1:15; Jonah 4:2; Micah 7:7; Nahum 1:7;
Habakkuk 3:18; Zephaniah 3:9; Haggai 2:9; Zechariah 9:9; Malachi 4:2; Matthew 1:21; Matthew 3:17; Matthew 5:3;
Matthew 5:6; Matthew 5:8; Matthew 5:44; Matthew 6:9; Matthew 6:34; Matthew 7:12; Matthew 9:37; Matthew 10:39;
Matthew 13:44; Matthew 16:18; Matthew 18:20; Matthew 20:28; Matthew 24:35; Matthew 26:41; Matthew 28:20; Mark 1:15;
Mark 4:39; Mark 9:23; Mark 11:24; Luke 2:14; Luke 4:18; Luke 6:38; Luke 10:27; Luke 11:9; Luke 15:7; Luke 18:27;
Luke 23:34; Luke 24:6; John 1:12; John 3:30; John 5:24; John 6:37; John 7:38; John 10:27; John 12:46; John 14:1;
John 14:15; John 15:16; John 17:17; John 19:30; John 21:17; Acts 2:21; Acts 3:19; Acts 5:29; Acts 13:38; Romans 1:20;
Romans 5:3; Romans 8:18; Romans 8:31; Romans 8:37; Romans 10:17; Romans 11:33; Romans 12:12; Romans 13:10; Romans 14:8;
1 Corinthians 2:9; 1 Corinthians 3:16; 1 Corinthians 9:24; 1 Corinthians 10:31; 1 Corinthians 15:55;
1 Corinthians 15:57; 2 Corinthians 1:3; 2 Corinthians 3:17; 2 Corinthians 4:7; 2 Corinthians 10:5; 2 Corinthians 13:14;
Galatians 3:28; Galatians 5:1; Galatians 6:2; Galatians 6:7; Ephesians 1:3; Ephesians 4:2; Ephesians 4:26;
Ephesians 5:8; Ephesians 6:1; Philippians 1:21; Philippians 2:10; Philippians 3:20; Colossians 1:16; Colossians 2:6;
Colossians 3:12; Colossians 4:6; 1 Thessalonians 4:16; 1 Thessalonians 5:11; 2 Thessalonians 3:16; 1 Timothy 1:15;
1 Timothy 2:5; 1 Timothy 6:6; 2 Timothy 2:3; Titus 2:11; Philemon 1:6; Hebrews 2:18; Hebrews 4:16; Hebrews 9:27;
Hebrews 10:24; Hebrews 12:1; Hebrews 12:11; Hebrews 13:2; Hebrews 13:16; James 1:12; James 1:19; James 3:17;
James 4:8; James 4:10; 1 Peter 1:3; 1 Peter 2:24; 1 Peter 5:8; 2 Peter 1:3; 2 Peter 3:18; 1 John 2:15; 1 John 3:18;
1 John 4:18; 1 John 5:14; 2 John 1:6; 3 John 1:4; Jude 1:21; Revelation 2:10; Revelation 4:11; Revelation 7:17;
Revelation 19:16; Revelation 22:17; Revelation 22:20
`
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

/** The same order on every install: a small seeded shuffle, so the calendar wanders through the Bible. */
export function shuffled<T>(items: T[], seed = 1611): T[] {
  const out = [...items];
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Guided first journeys (rule 2.1): tap a word, type a verse, then come home.
 * The game picks the first one that does not touch the day's home verse.
 */
export const GUIDES = [
  { home: 'John 1:1', out: { door: 'beginning', to: 'Genesis 1:1' }, back: { door: 'God' } },
  { home: 'Romans 8:28', out: { door: 'love', to: 'John 3:16' }, back: { door: 'God' } },
];
