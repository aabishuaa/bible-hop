// Storage: one SQLite file, through Node's built-in driver. Nothing to install or run.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  name TEXT UNIQUE,
  pass_hash TEXT,
  scribe INTEGER NOT NULL DEFAULT 0,
  rest_day INTEGER NOT NULL DEFAULT 0,
  wording TEXT NOT NULL DEFAULT 'kjv',
  treasure INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_win TEXT,
  guide_done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id);

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  loss TEXT,
  mode TEXT NOT NULL,
  scribe INTEGER NOT NULL DEFAULT 0,
  home INTEGER NOT NULL,
  manna INTEGER NOT NULL DEFAULT 0,
  hops INTEGER NOT NULL DEFAULT 0,
  strikes INTEGER NOT NULL DEFAULT 0,
  first_door TEXT,
  home_door TEXT,
  home_door_count INTEGER,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  deadline INTEGER,
  typed_purged INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS journeys_daily ON journeys(player_id, date) WHERE kind = 'daily';
CREATE INDEX IF NOT EXISTS journeys_date ON journeys(date, kind);
CREATE INDEX IF NOT EXISTS journeys_player ON journeys(player_id, kind, created_at);

CREATE TABLE IF NOT EXISTS calendar (
  date TEXT PRIMARY KEY,
  verse INTEGER NOT NULL,
  theme TEXT,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'scribe',
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS calendar_replaced (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  verse INTEGER NOT NULL,
  replaced_at INTEGER NOT NULL,
  replaced_by TEXT,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS storehouse (
  verse INTEGER PRIMARY KEY,
  position REAL NOT NULL,
  added_at INTEGER NOT NULL,
  added_by TEXT
);
CREATE TABLE IF NOT EXISTS rule_sets (
  version INTEGER PRIMARY KEY,
  rules TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  note TEXT
);
CREATE TABLE IF NOT EXISTS lexicons (
  version INTEGER PRIMARY KEY,
  config TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  note TEXT
);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journey_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  date TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  typed TEXT,
  reference TEXT,
  door TEXT,
  call TEXT,
  call_verse INTEGER,
  state TEXT,
  comment TEXT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  right_verse INTEGER,
  outcome TEXT,
  resolved_by TEXT,
  resolved_at INTEGER,
  note TEXT,
  UNIQUE(journey_id, event_index)
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  text TEXT NOT NULL,
  read_at INTEGER
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  draft INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  before TEXT,
  after TEXT,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  totp_confirmed INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  player_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  player_id TEXT,
  journey_id TEXT,
  date TEXT,
  typed TEXT,
  reference TEXT,
  door TEXT,
  outcome TEXT NOT NULL,
  ref TEXT,
  confidence REAL,
  latency_ms INTEGER,
  cached INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS ai_calls_player ON ai_calls(player_id, date);
CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, at INTEGER NOT NULL, response TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  player_id TEXT,
  date TEXT,
  type TEXT NOT NULL,
  data TEXT
);
CREATE INDEX IF NOT EXISTS events_type ON events(type, date);
CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  added_by TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements (
  player_id TEXT NOT NULL,
  id TEXT NOT NULL,
  earned_on TEXT NOT NULL,
  PRIMARY KEY (player_id, id)
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  date TEXT,
  UNIQUE(kind, date)
);
`;

type Param = string | number | bigint | null | Uint8Array;

/** A thin, typed wrapper: prepared statements are cached, and JSON columns are plain text. */
export class Db {
  readonly raw: DatabaseSync;
  private readonly cache = new Map<string, StatementSync>();

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.raw.exec(SCHEMA);
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  run(sql: string, ...params: Param[]): { changes: number; lastId: number } {
    const r = this.stmt(sql).run(...params);
    return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
  }

  get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
    return this.stmt(sql).all(...params) as T[];
  }

  /** Runs fn inside one transaction; everything in it is saved together or not at all. */
  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  meta<T>(key: string): T | undefined {
    const row = this.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  setMeta(key: string, value: unknown): void {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}
