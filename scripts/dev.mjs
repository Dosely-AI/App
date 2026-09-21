#!/usr/bin/env node
/**
 * npm run dev — start Dosely for development with one command.
 *
 *   1. installs dependencies that are missing (app, server, vault compiler)
 *   2. builds the care-network vault (instant when it's up to date)
 *   3. starts the API server (8787) and the app (8081) in the background, or
 *      reuses them if they're already running (never a second copy on 8082)
 *   4. opens http://localhost:8081 once the app is ready
 *
 * Your terminal is free again when it finishes. Logs go to .dosely-dev/*.log.
 * Stop everything with:  npm run stop
 *
 *   --no-open   don't open the browser
 */
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  ROOT,
  SERVICES,
  STATE_DIR,
  httpGet,
  identify,
  pidOnPort,
  processName,
  readState,
  waitUntil,
  writeState,
} from './dev-tools.mjs';

const isWindows = process.platform === 'win32';
const openBrowser = !process.argv.includes('--no-open');

function line(mark, label, detail = '') {
  console.log(`  ${mark} ${label.padEnd(12)}${detail}`);
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

// --- 1. Dependencies -------------------------------------------------------------

function ensureInstalled(dir, marker, label) {
  if (existsSync(join(dir, 'node_modules', marker))) return;
  line('•', label, 'installing dependencies…');
  // npm is a .cmd script on Windows, which Node only runs through a shell.
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', shell: isWindows });
  if (r.status !== 0) fail(`npm install failed in ${relative(ROOT, dir) || '.'}`);
}

// --- 2. Vault ----------------------------------------------------------------------

function buildVault() {
  const firstBuild = !existsSync(join(ROOT, 'native', 'vault', 'build', 'dosely-vault.wasm'));
  if (firstBuild) line('•', 'vault', 'building (the first build takes about a minute)…');
  const r = spawnSync(process.execPath, [join(ROOT, 'native', 'vault', 'build.mjs')], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    fail('the vault failed to build (details above)');
  }
  line('✓', 'vault', /compiled|linked/.test(r.stdout) ? 'rebuilt' : 'up to date');
}

// --- 3. Services ---------------------------------------------------------------------

/** Start a service in the background, detached from this terminal, logging to a file. */
function launch(service, args, cwd, env = {}) {
  mkdirSync(STATE_DIR, { recursive: true });
  const log = openSync(service.log, 'w');
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  closeSync(log);
  child.unref();
  return child;
}

function logTail(file, lines = 15) {
  try {
    return readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

async function ensureRunning(service, start, timeoutMs) {
  const status = await identify(service);
  if (status === 'ours') {
    line('✓', service.name, `${service.url}   already running`);
    return false;
  }
  if (status === 'other') {
    const pid = pidOnPort(service.port);
    fail(
      `Port ${service.port} is being used by another program (${processName(pid)}), so the ${service.name} can't start.\n` +
        `    Close that program, then run npm run dev again.`,
    );
  }

  const child = start();
  const state = readState();
  state[service.key] = { pid: child.pid, startedAt: new Date().toISOString() };
  writeState(state);

  let exited = false;
  child.on('exit', () => (exited = true));
  const ready = await waitUntil(async () => exited || (await identify(service)) === 'ours', timeoutMs);
  if (exited || !ready) {
    fail(`The ${service.name} didn't start. Last lines of ${relative(ROOT, service.log)}:\n\n${logTail(service.log)}`);
  }
  line('✓', service.name, `${service.url}   started`);
  return true;
}

/** Ask for the app's JavaScript once, so the page is ready when the browser opens. */
async function warmUp() {
  try {
    const html = (await httpGet(SERVICES.web.url, 30_000)).body.toString('utf8');
    const src = /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
    if (src) await httpGet(new URL(src, SERVICES.web.url).href, 180_000);
  } catch {
    // The browser will simply bundle on first load instead.
  }
}

function open(url) {
  const [cmd, args] = isWindows
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
}

// --- Run ---------------------------------------------------------------------------------

console.log('\nDosely\n');
ensureInstalled(ROOT, 'expo', 'app');
ensureInstalled(join(ROOT, 'server'), 'tsx', 'API server');
ensureInstalled(join(ROOT, 'native', 'vault'), '@yowasp/clang', 'vault');
buildVault();

const apiStarted = await ensureRunning(
  SERVICES.api,
  () => launch(SERVICES.api, ['--import', 'tsx', join(ROOT, 'server', 'src', 'index.ts')], join(ROOT, 'server'), { PORT: String(SERVICES.api.port) }),
  60_000,
);
const webStarted = await ensureRunning(
  SERVICES.web,
  () => launch(SERVICES.web, [join(ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'start', '--port', String(SERVICES.web.port)], ROOT),
  120_000,
);

if (openBrowser) {
  if (webStarted) line('•', 'app', 'preparing the first load…');
  await warmUp();
  open(SERVICES.web.url);
  line('✓', 'opened', SERVICES.web.url);
}

// Logs exist only for what this script started (not for servers run by hand).
const logs = [apiStarted && SERVICES.api.log, webStarted && SERVICES.web.log].filter(Boolean);
if (logs.length) console.log(`\n  Logs:  ${logs.map((l) => relative(ROOT, l)).join(', ')}`);
console.log(`${logs.length ? '' : '\n'}  Stop:  npm run stop\n`);
