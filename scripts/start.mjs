#!/usr/bin/env node
// `npm start`: makes sure everything is in place, then runs the game.
//  1. installs packages if any are missing (after a `git pull` that added one),
//  2. builds the game if it has never been built, if its code has changed since, or if the last
//     build failed part-way,
//  3. starts the server.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';
const npx = win ? 'npx.cmd' : 'npx';
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win });

// 1. packages
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
if (missing.length) {
  console.log(`Installing ${missing.length === wanted.length ? 'packages' : `new packages (${missing.join(', ')})`}...`);
  const install = run(npm, ['install', '--no-audit', '--no-fund']);
  if (install.status !== 0) {
    console.error('\n  npm install failed. Check your internet connection and run: npm install\n');
    process.exit(install.status ?? 1);
  }
}

// 2. the build. A stamp file is written only when a build finishes, so a failed build is redone.
const dist = path.join(root, 'dist', 'client');
const stamp = path.join(dist, '.build-stamp');
function newest(paths) {
  let t = 0;
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    else t = Math.max(t, st.mtimeMs);
  };
  for (const p of paths) walk(p);
  return t;
}
const sources = newest(['client', 'shared', 'package.json', 'vite.config.ts'].map((p) => path.join(root, p)));
const builtAt = fs.existsSync(stamp) ? fs.statSync(stamp).mtimeMs : 0;
if (!builtAt || builtAt < sources) {
  console.log(builtAt ? 'The game has changed: rebuilding...' : 'Building the game...');
  const build = run(npx, ['vite', 'build']);
  if (build.status !== 0) {
    fs.rmSync(stamp, { force: true });
    console.error('\n  The build failed. If a package is missing, run: npm install\n');
    process.exit(build.status ?? 1);
  }
  fs.writeFileSync(stamp, new Date().toISOString());
}

// 3. the server
const server = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', path.join(root, 'server', 'index.ts')], { cwd: root, stdio: 'inherit' });
process.exit(server.status ?? 0);
