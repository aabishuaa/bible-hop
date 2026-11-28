// Talking to the game server. The server decides everything; the client only shows it.
import type {
  ActionResult, ConcordanceView, FinaleView, HistoryView, JournalView, JourneyView, PlayerView, RevelationView, StandingsView, TodayView,
} from '../../shared/types.ts';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The player's time zone, by its IANA name. The server works out the date from it (rule 12.2). */
export const tz: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('offline', 'You’re offline. Your typing is saved, and hops will be checked when you reconnect.', 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* an empty or non-JSON answer */
  }
  if (!res.ok) {
    const e = (json ?? {}) as { error?: string; message?: string };
    throw new ApiError(e.error ?? 'error', e.message ?? 'Something went wrong. Please try again.', res.status);
  }
  return json as T;
}

const q = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

type Ref = { journeyId: string; version: number };

export interface GuideScript {
  outDoor: string;
  outText: string;
  outRef: string;
  backDoor: string;
  homeText: string;
}

export const api = {
  today: () => call<TodayView>('GET', `/api/today?${q({ tz })}`),
  start: (mode?: string) => call<{ journey: JourneyView }>('POST', '/api/journey/start', { tz, mode }),
  journey: (id: string) => call<{ journey: JourneyView }>('GET', `/api/journey/${encodeURIComponent(id)}`),
  hop: (r: Ref, door: string, typed: string, reference: string) => call<ActionResult>('POST', '/api/journey/hop', { ...r, door, typed, reference }),
  confirm: (r: Ref, choice: number | null) => call<ActionResult>('POST', '/api/journey/confirm', { ...r, choice }),
  lookBack: (r: Ref) => call<ActionResult>('POST', '/api/journey/lookback', r),
  grace: (r: Ref, use: boolean) => call<ActionResult>('POST', '/api/journey/grace', { ...r, use }),
  golden: (r: Ref) => call<ActionResult>('POST', '/api/journey/golden', r),
  standings: (date: string) => call<StandingsView>('GET', `/api/standings?${q({ date })}`),
  mode: (r: Ref, mode: 'standard' | 'berean') => call<ActionResult>('POST', '/api/journey/mode', { ...r, mode }),
  report: (journeyId: string, eventIndex: number, comment: string) => call<{ ok: true }>('POST', '/api/journey/report', { journeyId, eventIndex, comment }),
  finale: (p: { date?: string; journeyId?: string }) => call<FinaleView>('GET', `/api/finale?${q(p)}`),
  history: () => call<HistoryView>('GET', `/api/history?${q({ tz })}`),
  revelation: (date: string) => call<RevelationView>('GET', `/api/revelation?${q({ date })}`),
  settings: (s: { restDay?: number; wording?: string }) => call<{ player: PlayerView }>('POST', '/api/settings', s),
  readNotes: () => call<{ ok: true }>('POST', '/api/notes/read', {}),
  guideStart: () => call<{ journey: JourneyView; script: GuideScript }>('POST', '/api/guide/start', { tz }),
  guideSkip: () => call<{ ok: true }>('POST', '/api/guide/skip', {}),
  practiceStart: (verse: string, mode?: string) => call<{ journey: JourneyView }>('POST', '/api/practice/start', { tz, verse, mode }),
  concordance: (journeyId: string, door: string, book?: number) => call<ConcordanceView>('GET', `/api/practice/concordance?${q({ journeyId, door, book })}`),
  register: (name: string, password: string) => call<{ player: PlayerView }>('POST', '/api/account/register', { name, password }),
  login: (name: string, password: string) => call<{ player: PlayerView; notices: string[] }>('POST', '/api/account/login', { name, password }),
  logout: () => call<{ ok: true }>('POST', '/api/account/logout', {}),
  deleteAccount: () => call<{ ok: true }>('POST', '/api/account/delete', {}),
  journal: () => call<JournalView>('GET', '/api/journal'),
  bookmarks: () => call<{ verses: number[] }>('GET', '/api/bookmarks'),
  saveBookmark: (verse: number, note?: string, source?: string) => call<{ verse: number; note: string }>('PUT', '/api/bookmarks', { verse, note, source }),
  removeBookmark: (verse: number) => call<{ ok: true }>('DELETE', `/api/bookmarks/${verse}`),
  track: (type: string) => call<{ ok: true }>('POST', '/api/track', { type }).catch(() => undefined),
};

export const deskCall = call;
