# Bible Hopping

*A daily leap of faith.* Each day has one home verse. Leave it, hop from verse to verse through the words
they share, gather manna, and get back home before your local midnight.

The game is built from the **Bible Hopping Game Directive 1.0**: every rule, number, edge case and
acceptance test in it is enforced on the server, and the directive's own tests run in the test suite.
The look is the game's own: a Bible bound in dark leather, with gilt stitching and ivory type, and
scripture on cream paper inside. The pages turn to each verse you hop to.

---

## Running it

You need **Node.js 22.13 or newer** (`node --version`). Nothing else: no database to install, no
accounts to create. The Bible text (KJV and WEB) is already in the repository.

```bash
npm install
npm start
```

Then open **http://localhost:8787**. The first `npm start` builds the game (about a second), later
starts are instant. Press `Ctrl+C` to stop.

That is the whole thing for playing. The sections below cover the extras.

### Playing on a phone

Haptics and the page-turn feel are made for a phone. While the game runs on your computer, open it
from a phone on the same Wi-Fi at `http://<your computer's IP>:8787`. (Find the IP with `ipconfig` on
Windows or `ifconfig` / `ip addr` elsewhere.) Add it to the home screen for a full-screen app.

### The AI verse check (optional)

When a player types a verse in a translation the game doesn't hold (NIV, ESV, a paraphrase...), the
game can ask Claude which verse they mean (directive rule 5.7). It runs on the server only; keys never
reach the browser. To turn it on:

```bash
cp .env.example .env
```

Put your key in `.env` as `ANTHROPIC_API_KEY=sk-ant-...` and restart. The start-up banner shows
`AI verse check: on`. Without a key the game still works: it asks the player for more of the wording.

### The Scribe's Desk (the admin panel)

Scribes pick each day's verse, keep the Storehouse stocked, tune the rules and answer players'
reports. Sign-in needs a password **and** a code from an authenticator app (Google Authenticator,
Authy, 1Password, Apple Passwords...). Create the first Head Scribe on the machine that runs the game:

```bash
npm run desk:add -- yourname head
```

It asks for a password (or makes one and prints it once). Then open **http://localhost:8787/desk**,
sign in, and scan the QR code with your authenticator app. From then on the Desk asks for the app's
six-digit code after the password. Further Scribes can be added from the Desk's Settings screen.

Roles: a **head** can do everything; a **scribe** schedules verses, runs checks, handles disputes and
supports players; an **observer** can only look.

### Development

```bash
npm run dev
```

This runs the server and a hot-reloading client at **http://localhost:5173** (the API is proxied).
Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the directive's acceptance tests, the API tests and the Desk tests (69 tests). |
| `npm run typecheck` | Type-checks the server and the client. |
| `npm run build` | Builds the client into `dist/client`. |
| `node scripts/build-data.mjs <kjv-dir> <web-dir>` | Rebuilds `data/kjv.json` and `data/web.json` from the public-domain sources (see the script). |

### Settings you can change

Everything is optional and lives in `.env` (see `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | The port the game listens on. |
| `DATA_DIR` | `./var` | Where the SQLite database file lives. Back this folder up; it is the whole game state. |
| `LAUNCH_DATE` | today | The date of puzzle #1. Fixed after the first start (puzzle numbers are permanent). |
| `ANTHROPIC_API_KEY` | none | Turns on the AI verse check. |
| `AI_MODEL` | `claude-opus-5-5` | The model the check uses (also editable in the Desk). |

### Putting it on the internet

The game is one Node process serving the API and the built client, with one SQLite file. Any host that
runs Node will do (a small VPS, Railway, Render, Fly.io...). Run `npm start` behind HTTPS (a reverse
proxy such as Caddy or nginx), set `DATA_DIR` to a persistent disk, and keep `BH_DEV_TOOLS` unset.
Cookies are marked secure automatically when the request arrives over HTTPS.

---

## How to play (the short version)

1. **Tap a word** in the verse you stand on. That word is your door.
2. **Type, from memory, another verse that contains it.** Any translation or paraphrase counts, and
   other forms of the word count too (love, loves, loved, loveth). Add the reference for a bonus.
3. The pages turn to your new verse and you earn **manna**: 1 for a crumb (the, and, unto),
   5 for a loaf (300+ verses), 10 for a fish (30 to 299), 25 for a pearl (under 30).
4. Your **lamp** holds 12 drops of oil. A hop burns 1, going back to a verse burns 3, and a verse that
   mentions oil refills 3.
5. Visit **3 different verses** and gather **50 manna**, then **come home** through a word your home
   verse shares. Home pays twice again: the Fatted Calf.
6. A verse that doesn't hold your word is a **strike**; three in a row and the rooster crows. Once a
   day, **Grace** can rescue you. Midnight cannot be rescued.

7. Now and then a verse carries a **challenge**: a *double door* (hop through the glowing word for
   double manna) or a *tag-along* word (land in a verse that also has it for double manna).

The full rules are in the game under *How to play*.

### Beyond the daily journey

- **Journal**: a leather-bound book that fills itself in as you play. Every day you hop gets a page:
  the day's journey pasted in like a ticket and rubber-stamped (home, or how it ended), the verses you
  kept that day taped in with room for a note (tap the ribbon beside any verse to keep it), and ruled
  lines for your own thoughts, all in your handwriting. It opens with a bookplate and contents and
  ends with your well-worn verses (tallied, with where each stands among all players) and an index of
  every kept verse. Turn the pages with a swipe, the arrow keys, the page corners or the tabs.
- **Daily games**: three quick games, one timed round of each a day, the same for everyone.
  *Book It* (which book is this verse from? every miss sweeps away the wrong side of the shelf),
  *Who Art Thou?* (name the Bible character from five clues, the prize dropping a step with each
  clue) and *Bible or Babble* (swipe each saying to Bible or Babble; right answers in a row build a
  run). Each round ends with your record, how everyone did today and a card to share. The server
  keeps every clock, so a timed answer cannot arrive late. *Fix Your Eyes* and *Loaves and Fishes*
  are resting: out of the lineup, but still playable at `/games/fixyoureyes` and `/games/loaves`.
- **Sunday School** gives 10 practice journeys free. *Bible Hopping Plus* (Infinity mode) has no
  limit; until payments exist, a Head Scribe can give Plus to testers from the player's page at the
  Desk. The number of free journeys is a rule the Desk can change.

All of these are switches at the Desk (Rules, Features), along with the chance of a challenge and
what a met challenge multiplies by. The Desk's Today page also lists the ten verses players hop to
most, today, this week or ever.

## How it is built

| Part | Where | Notes |
|---|---|---|
| Bible text | `data/` | KJV and WEB in the KJV's numbering, 31,102 verses. |
| Word families and tiers (section 4) | `server/lexicon/` | Crumbs, regular endings, the irregular table and spelling variants of Appendix C. |
| Verse recognition (section 5) | `server/recognize/` | BM25 search plus the P, R, F, S scoring and the rules of 5.5. |
| The hop, manna, oil, strikes, Grace (sections 3, 6 to 11) | `server/game/engine.ts` | Every check in the directive's fixed order. |
| The daily clock (section 12) | `server/game/clock.ts` | Dates open at UTC+14 and close at UTC-12; deadlines keep the zone the journey began in. |
| The finale (section 13) | `server/game/finale.ts` | The trip map, the Emmaus Road, the Book of Numbers, the share card. |
| The player API and storage | `server/app/`, `server/http.ts`, `server/db.ts` | Fastify and SQLite (Node's built-in driver). |
| The Scribe's Desk (Part II) | `server/desk/`, `client/src/desk/` | Roles, two-factor sign-in, versioned rules and lexicon, the audit log. |
| The game you see | `client/src/` | React, with the page turn drawn in WebGL (`client/src/fx/flip.ts`), sound made in the browser (`fx/sound.ts`) and haptics (`fx/haptics.ts`). |
| Challenges | `server/game/challenges.ts` | Drawn from the date and the verse, so everyone meets the same one. |
| The Journal | `server/app/journal.ts`, `client/src/journal/` | Kept verses and notes, a written page per day, each day's journeys, verse counts; the book, its pages and the page turn. |
| The daily games | `server/minigames/`, `client/src/minigames/` | Content, timing, scoring and today's spread of results on the server; `lineup()` in `shared/minigames.ts` says which games are in the day's set. |
| Tests | `tests/` | The directive's 25 acceptance tests, the API, the clock, the Desk, challenges, the Journal and the games (their content is checked against the Bible text). |

The only emoji in the whole game are on the share card, where the directive requires them so the card
can be pasted anywhere; everywhere else the game draws its own icons.

### Bible text licences

The King James Version is in the public domain in the United States (Crown copyright in the United
Kingdom). The World English Bible is in the public domain; "World English Bible" is a trademark of
eBible.org and the text is kept faithful. Players may type any translation; only these two are
displayed.
