#!/usr/bin/env node
// `npm start`: builds the client when it is missing or older than its sources, then runs the server.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const built = path.join(root, 'dist', 'client', 'index.html');

/** The newest modification time of any file under these folders. */
function newest(dirs) {
  let t = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else t = Math.max(t, fs.statSync(p).mtimeMs);
    }
  };
  for (const d of dirs) if (fs.existsSync(d)) walk(d);
  return t;
}

const sources = newest([path.join(root, 'client'), path.join(root, 'shared')]);
const stale = !fs.existsSync(built) || fs.statSync(built).mtimeMs < sources;
if (stale) {
  console.log(fs.existsSync(built) ? 'The game has changed: rebuilding...' : 'Building the game for the first time...');
  const build = spawnSync(npx, ['vite', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const run = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', path.join(root, 'server', 'index.ts')], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 0);
