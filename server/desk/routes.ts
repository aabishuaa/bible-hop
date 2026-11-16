// The Desk's API. Every route checks the Scribe's role on the server (rule 15.2).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Game } from '../app/game.ts';
import { GameError } from '../app/game.ts';
import { Desk, requireRole } from './desk.ts';
import type { Admin, CAN } from './desk.ts';

const COOKIE = 'bh_desk';
type Body = Record<string, unknown>;
type Query = Record<string, string | undefined>;

export function registerDesk(app: FastifyInstance, game: Game): Desk {
  const desk = new Desk(game);

  const admin = (req: FastifyRequest, action: keyof typeof CAN = 'view'): Admin => {
    const a = desk.adminByToken(req.cookies[COOKIE]);
    if (!a) throw new GameError('unauthorized', 'Sign in to the Desk first.', 401);
    requireRole(a, action);
    return a;
  };
  const setCookie = (req: FastifyRequest, reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, { path: '/api/desk', httpOnly: true, sameSite: 'strict', secure: req.protocol === 'https', maxAge: 12 * 3600 });

  app.post('/api/desk/login', async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    const r = await desk.login(String(b.username ?? ''), String(b.password ?? ''));
    setCookie(req, reply, r.token);
    return { stage: r.stage, qr: r.qr, otpauth: r.otpauth };
  });
  app.post('/api/desk/totp', async (req) => ({ admin: desk.verifyCode(req.cookies[COOKIE] ?? '', String(((req.body ?? {}) as Body).code ?? '')) }));
  app.post('/api/desk/logout', async (req, reply) => {
    if (req.cookies[COOKIE]) desk.logout(req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/api/desk' });
    return { ok: true };
  });
  app.get('/api/desk/me', async (req) => ({ admin: admin(req), hasAdmins: desk.adminCount() > 0 }));
  app.get('/api/desk/setup', async () => ({ hasAdmins: desk.adminCount() > 0 }));
  app.post('/api/desk/link-player', async (req) => {
    desk.linkPlayer(admin(req), game.playerByToken(req.cookies.bh_s));
    return { ok: true };
  });

  app.get('/api/desk/today', async (req) => {
    admin(req);
    return desk.today();
  });
  app.get('/api/desk/calendar', async (req) => {
    admin(req);
    const q = req.query as Query;
    return { days: desk.calendar(q.from ?? '', q.to ?? '') };
  });
  app.post('/api/desk/calendar/schedule', async (req) => ({ row: desk.schedule(admin(req, 'schedule'), (req.body ?? {}) as Body) }));
  app.post('/api/desk/calendar/clear', async (req) => {
    desk.clearDate(admin(req, 'schedule'), String(((req.body ?? {}) as Body).date ?? ''));
    return { ok: true };
  });
  app.post('/api/desk/calendar/move', async (req) => {
    const b = (req.body ?? {}) as Body;
    desk.moveDate(admin(req, 'schedule'), String(b.from ?? ''), String(b.to ?? ''));
    return { ok: true };
  });
  app.post('/api/desk/calendar/swap', async (req) => {
    const b = (req.body ?? {}) as Body;
    desk.swapDates(admin(req, 'schedule'), String(b.a ?? ''), String(b.b ?? ''));
    return { ok: true };
  });
  app.post('/api/desk/calendar/import', async (req) => {
    const b = (req.body ?? {}) as Body;
    return desk.importCsv(admin(req, 'schedule'), String(b.csv ?? ''), !!b.skipFailing);
  });
  app.post('/api/desk/calendar/fill', async (req) => desk.fillFromStorehouse(admin(req, 'schedule'), Math.max(1, Math.min(60, Number(((req.body ?? {}) as Body).days) || 14))));
  app.post('/api/desk/calendar/replace', async (req) => {
    const b = (req.body ?? {}) as Body;
    return { row: desk.replaceLive(admin(req, 'replace'), String(b.date ?? ''), String(b.ref ?? ''), String(b.reason ?? '')) };
  });
  app.get('/api/desk/verse-check', async (req) => {
    admin(req, 'check');
    const q = req.query as Query;
    return desk.verseCheck(q.ref ?? '', q.date);
  });
  app.get('/api/desk/chapter', async (req) => {
    admin(req);
    const q = req.query as Query;
    return desk.chapter(Number(q.book), Number(q.chapter));
  });

  app.get('/api/desk/storehouse', async (req) => {
    admin(req);
    return { verses: desk.storehouse() };
  });
  app.post('/api/desk/storehouse/add', async (req) => {
    desk.storehouseAdd(admin(req, 'storehouse'), String(((req.body ?? {}) as Body).ref ?? ''));
    return { ok: true };
  });
  app.post('/api/desk/storehouse/remove', async (req) => {
    desk.storehouseRemove(admin(req, 'storehouse'), Number(((req.body ?? {}) as Body).verse));
    return { ok: true };
  });
  app.post('/api/desk/storehouse/order', async (req) => {
    const b = (req.body ?? {}) as Body;
    desk.storehouseOrder(admin(req, 'storehouse'), Array.isArray(b.verses) ? b.verses.map(Number) : [], !!b.shuffle);
    return { ok: true };
  });

  app.get('/api/desk/remembrance', async (req) => {
    admin(req);
    return { dates: desk.remembrance((req.query as Query).q ?? '') };
  });
  app.get('/api/desk/remembrance.csv', async (req, reply) => {
    admin(req);
    return reply.type('text/csv').header('content-disposition', 'attachment; filename="book-of-remembrance.csv"').send(desk.remembranceCsv());
  });
  app.post('/api/desk/remembrance/note', async (req) => {
    const b = (req.body ?? {}) as Body;
    desk.remembranceNote(admin(req, 'schedule'), String(b.date ?? ''), String(b.note ?? ''));
    return { ok: true };
  });

  app.get('/api/desk/lexicon', async (req) => {
    admin(req);
    return { word: desk.lookupWord((req.query as Query).word ?? ''), versions: desk.lexiconVersions() };
  });
  app.post('/api/desk/lexicon/preview', async (req) => desk.previewLexicon(((req.body ?? {}) as Body).op as never) as object);
  app.post('/api/desk/lexicon/save', async (req) => {
    const b = (req.body ?? {}) as Body;
    return desk.saveLexicon(admin(req, 'lexicon'), b.op as never, String(b.note ?? ''));
  });

  app.get('/api/desk/rules', async (req) => {
    admin(req);
    return desk.rules();
  });
  app.post('/api/desk/rules', async (req) => {
    const b = (req.body ?? {}) as Body;
    return desk.saveRules(admin(req, 'rules'), (b.rules ?? {}) as Record<string, unknown>, String(b.note ?? ''));
  });

  app.get('/api/desk/disputes', async (req) => {
    admin(req);
    return { disputes: desk.disputes((req.query as Query).status ?? 'waiting') };
  });
  app.post('/api/desk/disputes/resolve', async (req) => {
    const b = (req.body ?? {}) as Body;
    return desk.resolveDispute(admin(req, 'disputes'), Number(b.id), b.outcome === 'overturn' ? 'overturn' : 'uphold', String(b.rightRef ?? ''), !!b.alias, String(b.note ?? ''));
  });

  app.get('/api/desk/players', async (req) => {
    admin(req, 'support');
    return { players: desk.searchPlayers((req.query as Query).q ?? '') };
  });
  app.get('/api/desk/players/:id', async (req) => {
    admin(req, 'support');
    return desk.player((req.params as { id: string }).id);
  });
  app.post('/api/desk/players/:id/action', async (req) => {
    const b = (req.body ?? {}) as Body;
    desk.playerAction(admin(req, 'support'), (req.params as { id: string }).id, String(b.action ?? ''), String(b.reason ?? ''), b);
    return { ok: true };
  });

  app.get('/api/desk/announcements', async (req) => {
    admin(req);
    return { announcements: desk.announcements() };
  });
  app.post('/api/desk/announcements', async (req) => {
    desk.saveAnnouncement(admin(req, 'announce'), (req.body ?? {}) as Body);
    return { ok: true };
  });
  app.post('/api/desk/announcements/delete', async (req) => {
    desk.deleteAnnouncement(admin(req, 'announce'), Number(((req.body ?? {}) as Body).id));
    return { ok: true };
  });

  app.get('/api/desk/audit', async (req) => {
    admin(req);
    const q = req.query as Query;
    return { entries: desk.auditLog({ admin: q.admin, action: q.action, limit: Number(q.limit) || 200 }) };
  });
  app.get('/api/desk/audit.csv', async (req, reply) => {
    admin(req);
    return reply.type('text/csv').header('content-disposition', 'attachment; filename="audit-log.csv"').send(desk.auditCsv());
  });

  app.get('/api/desk/settings', async (req) => {
    admin(req);
    return desk.settings();
  });
  app.post('/api/desk/settings', async (req) => {
    desk.saveSettings(admin(req, 'manage'), (req.body ?? {}) as Body);
    return { ok: true };
  });
  app.post('/api/desk/admins', async (req) => {
    const b = (req.body ?? {}) as Body;
    desk.addAdmin(admin(req, 'manage'), String(b.username ?? ''), String(b.password ?? ''), b.role as never);
    return { ok: true };
  });
  app.post('/api/desk/admins/:id', async (req) => {
    desk.setAdmin(admin(req, 'manage'), (req.params as { id: string }).id, (req.body ?? {}) as Body);
    return { ok: true };
  });

  return desk;
}
