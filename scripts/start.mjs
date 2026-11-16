#!/usr/bin/env node
// `npm start`: builds the client if it has not been built yet, then runs the server.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!fs.existsSync(path.join(root, 'dist', 'client', 'index.html'))) {
  console.log('Building the game for the first time...');
  const build = spawnSync(npx, ['vite', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const run = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', path.join(root, 'server', 'index.ts')], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 0);
