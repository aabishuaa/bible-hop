// The Journal: verses a player keeps (with a note of their own), the verses they hop to most, and,
// for the Desk, the verses everyone hops to most. Every hop's landing verse is recorded in
// verse_uses whenever a journey is saved, so undone hops drop out again.
import type { Bookmark, JournalView, MostUsedVerse, TopVerse, Wording } from '../../shared/types.ts';
import type { Bible } from '../bible/bible.ts';
import type { Db } from '../db.ts';
import type { Journey } from '../game/journey.ts';
import { GameError } from './errors.ts';

const MAX_BOOKMARKS = 2000;
const MAX_NOTE = 2000;

/** Records the verses a journey landed on (its homecoming aside). The guided first journey is left out. */
export function syncUses(db: Db, j: Journey): void {
  if (j.kind === 'guide') return;
  db.run('DELETE FROM verse_uses WHERE journey_id = ?', j.id);
  j.path.forEach((h, i) => {
    if (h.home) return;
    db.run('INSERT OR REPLACE INTO verse_uses (journey_id, idx, player_id, verse, kind, date, at) VALUES (?, ?, ?, ?, ?, ?, ?)', j.id, i, j.playerId, h.to, j.kind, j.date, h.at);
  });
}

/** Fills verse_uses from journeys saved before it existed. Runs once. */
export function backfillUses(db: Db): void {
  if (db.meta('verseUsesBackfilled')) return;
  db.tx(() => {
    for (const row of db.all<{ data: string }>('SELECT data FROM journeys')) syncUses(db, JSON.parse(row.data) as Journey);
  });
  db.setMeta('verseUsesBackfilled', true);
}

/** Competition ranking: equal counts share a place (1, 2, 2, 4). */
function ranks(counts: number[]): number[] {
  const out: number[] = [];
  counts.forEach((n, i) => out.push(i > 0 && n === counts[i - 1] ? out[i - 1] : i + 1));
  return out;
}

export class Journal {
  private everyone: { at: number; rank: Map<number, number> } | null = null;

  constructor(
    private readonly db: Db,
    private readonly bible: Bible,
    private readonly now: () => number,
  ) {}

  private text(verse: number, preferred: Wording): { text: string; wording: Wording } {
    const wording = this.bible.displayWording(verse, preferred);
    return { text: this.bible.text(verse, wording), wording };
  }

  private checkVerse(raw: unknown): number {
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isInteger(v) || v < 0 || v >= this.bible.count) throw new GameError('bad_verse', 'That is not a verse I know.');
    return v;
  }

  /** The ids of every verse the player has kept, so the ribbons can show filled in. */
  saved(playerId: string): number[] {
    return this.db.all<{ verse: number }>('SELECT verse FROM bookmarks WHERE player_id = ? ORDER BY created_at DESC', playerId).map((r) => r.verse);
  }

  save(playerId: string, body: { verse?: unknown; note?: unknown; source?: unknown }): { verse: number; note: string } {
    const verse = this.checkVerse(body.verse);
    const note = typeof body.note === 'string' ? body.note.slice(0, MAX_NOTE) : undefined;
    const at = this.now();
    const exists = this.db.get('SELECT 1 FROM bookmarks WHERE player_id = ? AND verse = ?', playerId, verse);
    if (!exists) {
      const n = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bookmarks WHERE player_id = ?', playerId)!.n;
      if (n >= MAX_BOOKMARKS) throw new GameError('journal_full', `Your Journal holds ${MAX_BOOKMARKS} verses. Remove one to keep another.`);
      this.db.run('INSERT INTO bookmarks (player_id, verse, note, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', playerId, verse, note ?? '', typeof body.source === 'string' ? body.source.slice(0, 20) : null, at, at);
    } else if (note !== undefined) {
      this.db.run('UPDATE bookmarks SET note = ?, updated_at = ? WHERE player_id = ? AND verse = ?', note, at, playerId, verse);
    }
    return { verse, note: this.db.get<{ note: string }>('SELECT note FROM bookmarks WHERE player_id = ? AND verse = ?', playerId, verse)!.note };
  }

  remove(playerId: string, rawVerse: unknown): void {
    this.db.run('DELETE FROM bookmarks WHERE player_id = ? AND verse = ?', playerId, this.checkVerse(rawVerse));
  }

  /** Every verse's place among all players' most-used verses, worked out at most once a minute. */
  private everyoneRanks(): Map<number, number> {
    const at = this.now();
    if (this.everyone && at - this.everyone.at < 60_000) return this.everyone.rank;
    const rows = this.db.all<{ verse: number; n: number }>("SELECT verse, COUNT(*) AS n FROM verse_uses WHERE kind = 'daily' OR kind = 'practice' GROUP BY verse ORDER BY n DESC");
    const r = ranks(rows.map((x) => x.n));
    const rank = new Map(rows.map((x, i) => [x.verse, r[i]]));
    this.everyone = { at, rank };
    return rank;
  }

  view(playerId: string, preferred: Wording): JournalView {
    const uses = new Map(this.db.all<{ verse: number; n: number }>('SELECT verse, COUNT(*) AS n FROM verse_uses WHERE player_id = ? GROUP BY verse', playerId).map((r) => [r.verse, r.n]));
    const kept = this.db.all<{ verse: number; note: string; created_at: number }>('SELECT verse, note, created_at FROM bookmarks WHERE player_id = ? ORDER BY created_at DESC', playerId);
    const savedSet = new Set(kept.map((b) => b.verse));
    const bookmarks: Bookmark[] = kept.map((b) => ({ verse: b.verse, ref: this.bible.label(b.verse), ...this.text(b.verse, preferred), note: b.note, savedAt: b.created_at, uses: uses.get(b.verse) ?? 0 }));
    const rows = this.db.all<{ verse: number; n: number; last: number }>('SELECT verse, COUNT(*) AS n, MAX(at) AS last FROM verse_uses WHERE player_id = ? GROUP BY verse ORDER BY n DESC, last DESC LIMIT 25', playerId);
    const r = ranks(rows.map((x) => x.n));
    const everyone = this.everyoneRanks();
    const top: TopVerse[] = rows.map((x, i) => ({ verse: x.verse, ref: this.bible.label(x.verse), ...this.text(x.verse, preferred), count: x.n, rank: r[i], everyoneRank: everyone.get(x.verse) ?? null, lastUsed: x.last, saved: savedSet.has(x.verse) }));
    let hops = 0;
    for (const n of uses.values()) hops += n;
    return { bookmarks, top, totals: { hops, verses: uses.size, saved: kept.length } };
  }

  /** The Desk's top ten: the verses players hopped to most, today, this week, or ever. */
  mostUsed(range: 'day' | 'week' | 'all', today: string, weekStart: string, limit = 10): MostUsedVerse[] {
    const where = range === 'day' ? 'AND date = ?' : range === 'week' ? 'AND date >= ?' : '';
    const params = range === 'day' ? [today] : range === 'week' ? [weekStart] : [];
    const rows = this.db.all<{ verse: number; n: number; players: number }>(
      `SELECT verse, COUNT(*) AS n, COUNT(DISTINCT player_id) AS players FROM verse_uses WHERE kind IN ('daily', 'practice') ${where} GROUP BY verse ORDER BY n DESC, players DESC LIMIT ?`,
      ...params, limit,
    );
    return rows.map((x) => ({ verse: x.verse, ref: this.bible.label(x.verse), text: this.bible.text(x.verse, 'kjv'), count: x.n, players: x.players }));
  }

  /** When a guest signs in to an account, their Journal comes with them. */
  merge(fromId: string, toId: string): void {
    this.db.run('UPDATE OR IGNORE bookmarks SET player_id = ? WHERE player_id = ?', toId, fromId);
    this.db.run('DELETE FROM bookmarks WHERE player_id = ?', fromId);
    this.db.run('UPDATE verse_uses SET player_id = ? WHERE player_id = ? AND journey_id IN (SELECT id FROM journeys WHERE player_id = ?)', toId, fromId, toId);
    this.db.run('DELETE FROM verse_uses WHERE player_id = ?', fromId);
  }

  forget(playerId: string): void {
    this.db.run('DELETE FROM bookmarks WHERE player_id = ?', playerId);
    this.db.run('DELETE FROM verse_uses WHERE player_id = ?', playerId);
  }
}
