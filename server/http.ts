// The player's API (rule 19.7): get today's puzzle; create or resume a journey; attempt a hop;
// confirm or choose a verse; look back; decide Grace; get the finale; report a wrong call.
import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Game, PlayerRow } from './app/game.ts';
import { GameError } from './app/game.ts';
import { registerDesk } from './desk/routes.ts';
import { localDate, setClock, setClockOffset } from './game/clock.ts';
import { MiniGames } from './minigames/games.ts';

export interface AppOptions {
  /** Where the built client lives. When absent, only the API is served. */
  clientDir?: string;
  /** Lets tests and demos move the clock (POST /api/dev/clock). Never on in production. */
  devTools?: boolean;
  logger?: boolean;
}

const COOKIE = 'bh_s';
const TWO_YEARS = 60 * 60 * 24 * 730;

type Body = Record<string, unknown>;
type Query = Record<string, string | undefined>;

export function buildApp(game: Game, opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 256 * 1024, trustProxy: true });
  app.register(cookie);

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) app.log.error(err);
    return reply.status(status).send({ error: status === 500 ? 'server_error' : 'bad_request', message: status === 500 ? 'Something went wrong on our side. Nothing was lost; please try again.' : err.message });
  });

  const setSession = (req: FastifyRequest, reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.protocol === 'https', maxAge: TWO_YEARS });

  /** The player behind a request. Guests get a player the first time they arrive. */
  const player = (req: FastifyRequest, reply: FastifyReply): PlayerRow => {
    const known = game.playerByToken(req.cookies[COOKIE]);
    if (known) return known;
    const { player: fresh, token } = game.createGuest();
    setSession(req, reply, token);
    return fresh;
  };

  // Typed text and cache: API answers are never cached by a browser or a proxy.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/health', async () => ({ ok: true, at: game.now() }));

  app.get('/api/today', async (req, reply) => game.today(player(req, reply), (req.query as Query).tz));

  app.post('/api/journey/start', async (req, reply) => {
    const b = req.body as Body;
    return { journey: game.start(player(req, reply), b?.tz, b?.mode) };
  });

  app.get('/api/journey/:id', async (req, reply) => ({ journey: game.current(player(req, reply), (req.params as { id: string }).id) }));

  app.post('/api/journey/hop', async (req, reply) => game.hop(player(req, reply), (req.body ?? {}) as Body));
  app.post('/api/journey/confirm', async (req, reply) => game.confirm(player(req, reply), (req.body ?? {}) as Body));
  app.post('/api/journey/lookback', async (req, reply) => game.lookBack(player(req, reply), (req.body ?? {}) as Body));
  app.post('/api/journey/grace', async (req, reply) => game.grace(player(req, reply), (req.body ?? {}) as Body));
  app.post('/api/journey/golden', async (req, reply) => game.golden(player(req, reply), (req.body ?? {}) as Body));
  app.get('/api/standings', async (req, reply) => game.standings(player(req, reply), (req.query as Query).date));
  app.post('/api/journey/mode', async (req, reply) => game.mode(player(req, reply), (req.body ?? {}) as Body));
  app.post('/api/journey/report', async (req, reply) => game.report(player(req, reply), (req.body ?? {}) as Body));

  app.get('/api/finale', async (req, reply) => game.finale(player(req, reply), req.query as Query));
  app.get('/api/history', async (req, reply) => game.history(player(req, reply), (req.query as Query).tz));
  app.get('/api/revelation', async (req, reply) => game.revelation(player(req, reply), (req.query as Query).date));

  app.post('/api/settings', async (req, reply) => {
    const p = player(req, reply);
    game.updateSettings(p, (req.body ?? {}) as Body);
    return { player: game.playerView(game.playerById(p.id)!, localDate(game.now(), 'UTC')) };
  });

  app.post('/api/notes/read', async (req, reply) => {
    game.readNotes(player(req, reply));
    return { ok: true };
  });

  app.post('/api/guide/start', async (req, reply) => game.startGuide(player(req, reply), ((req.body ?? {}) as Body).tz));
  app.post('/api/guide/skip', async (req, reply) => {
    game.skipGuide(player(req, reply));
    return { ok: true };
  });

  app.post('/api/practice/start', async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    return { journey: game.startPractice(player(req, reply), b.tz, b) };
  });
  app.get('/api/practice/concordance', async (req, reply) => game.concordance(player(req, reply), req.query as Query));

  app.post('/api/account/register', async (req, reply) => {
    const p = game.register(player(req, reply), (req.body ?? {}) as Body);
    return { player: game.playerView(p, localDate(game.now(), 'UTC')) };
  });
  app.post('/api/account/login', async (req, reply) => {
    const { player: p, token, notices } = game.login(game.playerByToken(req.cookies[COOKIE]), (req.body ?? {}) as Body);
    setSession(req, reply, token);
    return { player: game.playerView(p, localDate(game.now(), 'UTC')), notices };
  });
  app.post('/api/account/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) game.endSession(token);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
  app.post('/api/account/delete', async (req, reply) => {
    const p = game.playerByToken(req.cookies[COOKIE]);
    if (p) game.deletePlayer(p.id);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  // the Journal: kept verses with notes, and the verses a player hops to most
  app.get('/api/journal', async (req, reply) => game.journalView(player(req, reply)));
  app.put('/api/journal/pages/:date', async (req, reply) => game.journal.writePage(player(req, reply).id, (req.params as { date: string }).date, ((req.body ?? {}) as Body).text));
  app.get('/api/bookmarks', async (req, reply) => ({ verses: game.journal.saved(player(req, reply).id) }));
  app.put('/api/bookmarks', async (req, reply) => game.journal.save(player(req, reply).id, (req.body ?? {}) as Body));
  app.delete('/api/bookmarks/:verse', async (req, reply) => {
    game.journal.remove(player(req, reply).id, (req.params as { verse: string }).verse);
    return { ok: true };
  });

  // the daily mini games
  const games = new MiniGames(game);
  app.get('/api/games', async (req, reply) => games.hub(player(req, reply), (req.query as Query).tz));
  app.post('/api/games/:id/start', async (req, reply) => games.start(player(req, reply), (req.params as { id: string }).id, ((req.body ?? {}) as Body).tz));
  app.post('/api/games/:id/answer', async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    return games.answer(player(req, reply), (req.params as { id: string }).id, b.tz, b);
  });
  app.post('/api/games/:id/finish', async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    return games.finish(player(req, reply), (req.params as { id: string }).id, b.tz, b);
  });

  app.post('/api/track', async (req, reply) => {
    const p = player(req, reply);
    const type = ((req.body ?? {}) as Body).type;
    if (type === 'share.copied') game.track('share.copied', p.id, localDate(game.now(), 'UTC'));
    return { ok: true };
  });

  // The Scribe's Desk (Part II)
  registerDesk(app, game);

  if (opts.devTools) {
    app.post('/api/dev/clock', async (req) => {
      const b = (req.body ?? {}) as Body;
      if (typeof b.at === 'number') setClock(b.at);
      else if (typeof b.at === 'string') setClock(Date.parse(b.at));
      else setClockOffset(typeof b.offsetMs === 'number' ? b.offsetMs : 0);
      return { now: game.now(), iso: new Date(game.now()).toISOString() };
    });
  }

  // The built client, with every other path falling back to it so that links such as /play work.
  const dir = opts.clientDir;
  if (dir && fs.existsSync(path.join(dir, 'index.html'))) {
    app.register(fastifyStatic, { root: dir, wildcard: false, maxAge: '1h', immutable: false });
    const index = fs.readFileSync(path.join(dir, 'index.html'));
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found', message: 'No such endpoint.' });
      return reply.header('Cache-Control', 'no-cache').type('text/html').send(index);
    });
  } else {
    app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: 'not_found', message: req.url.startsWith('/api/') ? 'No such endpoint.' : 'The game has not been built yet. Run: npm run build' }));
  }
  return app;
}
