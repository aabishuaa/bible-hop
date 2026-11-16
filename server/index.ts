// Starts the game: one process serves the API and the built client.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiConfigured, anthropicBackend } from './app/ai.ts';
import { Game } from './app/game.ts';
import { Db } from './db.ts';
import { buildApp } from './http.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '0.0.0.0';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'var');

const started = Date.now();
const db = new Db(path.join(dataDir, 'bible-hopping.db'));
const game = new Game({ db, aiBackend: aiConfigured() ? anthropicBackend() : null, launchDate: process.env.LAUNCH_DATE });
const app = buildApp(game, { clientDir: path.join(root, 'dist', 'client'), devTools: process.env.BH_DEV_TOOLS === '1', logger: process.env.LOG === '1' });

// Housekeeping: keep the calendar filled, close days that ended while players were away,
// and delete typed text once it is 30 days old.
const tick = () => {
  try {
    const at = game.now();
    game.ensureCalendar(at);
    game.sweepAll(at);
    game.purgeTypedText(at);
  } catch (e) {
    console.error('housekeeping failed:', e);
  }
};
setInterval(tick, 5 * 60 * 1000).unref();

await app.listen({ port, host });
const built = fs.existsSync(path.join(root, 'dist', 'client', 'index.html'));
console.log(`\n  Bible Hopping is running  (ready in ${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log(`  Play:           http://localhost:${port}${built ? '' : '   (run "npm run build" first, or use "npm run dev")'}`);
console.log(`  Puzzle #1:      ${game.launchDate}`);
console.log(`  AI verse check: ${game.ai.ready ? `on (${game.aiSettings.model})` : 'off (set ANTHROPIC_API_KEY to turn it on)'}`);
console.log(`  Data:           ${path.join(dataDir, 'bible-hopping.db')}\n`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().finally(() => {
      db.close();
      process.exit(0);
    });
  });
}
