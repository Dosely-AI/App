/**
 * Shared by scripts/dev.mjs and scripts/stop.mjs: what the Dosely dev services
 * are, how to recognize them on their ports, and how to stop them.
 *
 * A port is only ever reused or stopped when the service on it proves it is
 * ours (the API's /health, or Metro reporting this project's folder), so these
 * scripts never touch another program that happens to use the same port.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_DIR = join(ROOT, '.dosely-dev');
const STATE_FILE = join(STATE_DIR, 'state.json');
const isWindows = process.platform === 'win32';

export const SERVICES = {
  api: { key: 'api', name: 'API server', port: 8787, url: 'http://localhost:8787', log: join(STATE_DIR, 'api.log') },
  web: { key: 'web', name: 'app', port: 8081, url: 'http://localhost:8081', log: join(STATE_DIR, 'web.log') },
};

/** 'ours' | 'other' | 'free' — what is listening on the service's port. */
export async function identify(service) {
  const pid = pidOnPort(service.port);
  if (pid === null) return 'free';
  try {
    if (service.key === 'api') {
      const body = JSON.parse((await httpGet(`${service.url}/health`)).body.toString('utf8'));
      return body && typeof body.rpID === 'string' ? 'ours' : 'other';
    }
    const res = await httpGet(`${service.url}/status`);
    const root = decodeURIComponent(String(res.headers['x-react-native-project-root'] ?? ''));
    const running = res.body.toString('utf8').includes('packager-status:running');
    return running && samePath(root, ROOT) ? 'ours' : 'other';
  } catch {
    return 'other'; // listening, but not answering like our service
  }
}

/**
 * A plain GET without keep-alive. (fetch keeps connections open in the
 * background, and exiting while one is closing can crash Node on Windows.)
 */
export function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolveGet, rejectGet) => {
    const req = get(url, { agent: false, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolveGet({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', rejectGet);
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', rejectGet);
  });
}

function samePath(a, b) {
  const norm = (p) => resolve(p).replace(/[\\/]+$/, '');
  return isWindows ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

/** The process listening on a TCP port, or null. */
export function pidOnPort(port) {
  try {
    if (isWindows) {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }) +
        execFileSync('netstat', ['-ano', '-p', 'TCPv6'], { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        if (cols[3] === 'LISTENING' && cols[1]?.endsWith(`:${port}`)) return Number(cols[4]);
      }
      return null;
    }
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
    const pid = Number(out.trim().split('\n')[0]);
    return pid > 0 ? pid : null;
  } catch {
    return null; // lsof exits non-zero when nothing matches
  }
}

/** A short name for a process, for messages like "port 8081 is used by chrome.exe". */
export function processName(pid) {
  try {
    if (isWindows) {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      return out.split(',')[0]?.replaceAll('"', '').trim() || `process ${pid}`;
    }
    return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).trim() || `process ${pid}`;
  } catch {
    return `process ${pid}`;
  }
}

/** Running Node processes and their command lines: [{ pid, cmd }]. */
export function nodeProcesses() {
  try {
    if (isWindows) {
      const script =
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
      const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
      const rows = out.trim() ? JSON.parse(out) : [];
      return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.ProcessId, cmd: r.CommandLine ?? '' }));
    }
    const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => /^\s*(\d+)\s+(.*)$/.exec(l))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), cmd: m[2] }));
  } catch {
    return [];
  }
}

/** Does this command line belong to this project (not just any Node program)? */
export function inProject(cmd) {
  const hay = isWindows ? cmd.toLowerCase().replaceAll('/', '\\') : cmd;
  return hay.includes(isWindows ? ROOT.toLowerCase() : ROOT);
}

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Stop a process and everything it started (e.g. the API server and its vault).
 * The vault is crash-safe (fsync'd appends, torn-write recovery), so a forced
 * stop can't corrupt data.
 */
export function stopTree(pid) {
  if (!isAlive(pid)) return;
  try {
    if (isWindows) {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGTERM'); // the whole process group (started detached)
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
  } catch {
    // already gone
  }
}

export async function waitUntil(check, timeoutMs, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// --- What dev.mjs started (so stop.mjs can find it even without a port) ----------

export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function clearState() {
  if (existsSync(STATE_FILE)) rmSync(STATE_FILE, { force: true });
}
