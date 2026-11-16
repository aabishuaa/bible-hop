// Adds a Scribe to the Desk. Run it on the machine that holds the database:
//
//   npm run desk:add -- <username> <head|scribe|observer>
//
// It asks for a password (or makes one) and prints it once. The first sign-in at /desk shows a
// QR code to scan with an authenticator app; a code from that app is the second factor.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Game } from '../server/app/game.ts';
import { Db } from '../server/db.ts';
import { Desk } from '../server/desk/desk.ts';
import type { Role } from '../server/desk/desk.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'var');
const [username, roleArg = 'scribe'] = process.argv.slice(2);
if (!username) {
  console.error('Usage: npm run desk:add -- <username> [head|scribe|observer]');
  process.exit(1);
}
const role = roleArg as Role;
const db = new Db(path.join(dataDir, 'bible-hopping.db'));
const game = new Game({ db, rateLimit: false });
const desk = new Desk(game);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let password = process.env.DESK_PASSWORD ?? '';
if (!password && process.stdin.isTTY) password = (await rl.question('Password (leave empty to make one): ')).trim();
let made = false;
if (!password) {
  password = randomBytes(12).toString('base64url');
  made = true;
}
rl.close();
try {
  desk.createAdmin(username, password, role);
  console.log(`\n  Added ${role} "${username}" to the Scribe's Desk.`);
  if (made) console.log(`  Password (shown once): ${password}`);
  console.log(`  Sign in at /desk. The first sign-in shows a QR code to scan with an authenticator app.\n`);
} catch (e) {
  console.error(`\n  ${(e as Error).message}\n`);
  process.exit(1);
} finally {
  db.close();
}
