#!/usr/bin/env node
/**
 * npm run stop — close everything Dosely runs for development: the app (8081),
 * the API server (8787) and the vault it starts, whether they came from
 * `npm run dev` or were started by hand. Leftovers from a closed terminal are
 * found too. Other programs using those ports are left alone.
 */
import {
  SERVICES,
  clearState,
  identify,
  inProject,
  isAlive,
  nodeProcesses,
  pidOnPort,
  processName,
  readState,
  stopTree,
  waitUntil,
} from './dev-tools.mjs';

const state = readState();
const processes = nodeProcesses().filter((p) => p.pid !== process.pid);
const ownCommand = new Map(processes.map((p) => [p.pid, p.cmd]));
let stoppedAny = false;

console.log('\nDosely\n');

for (const service of [SERVICES.web, SERVICES.api]) {
  const targets = new Set();
  const status = await identify(service);
  if (status === 'ours') targets.add(pidOnPort(service.port));

  // What `npm run dev` started — only if that PID is still one of ours
  // (Windows reuses PIDs, so a stale number could now be another program).
  const recorded = state[service.key]?.pid;
  if (recorded && isAlive(recorded) && inProject(ownCommand.get(recorded) ?? '')) targets.add(recorded);

  for (const pid of targets) stopTree(pid);
  if (targets.size) {
    await waitUntil(async () => pidOnPort(service.port) === null, 10_000, 250);
    stoppedAny = true;
    console.log(`  ✓ ${service.name.padEnd(12)}stopped (port ${service.port} is free)`);
  } else if (status === 'other') {
    const pid = pidOnPort(service.port);
    console.log(`  • ${service.name.padEnd(12)}not running — port ${service.port} is used by another program (${processName(pid)}), left alone`);
  } else {
    console.log(`  • ${service.name.padEnd(12)}wasn't running`);
  }
}

// A vault whose API server was closed abruptly exits on its own when its input
// closes; stop any that are still around.
for (const p of processes) {
  if (isAlive(p.pid) && inProject(p.cmd) && p.cmd.includes('wasi-host.mjs')) {
    stopTree(p.pid);
    stoppedAny = true;
    console.log(`  ✓ ${'vault'.padEnd(12)}stopped a leftover process`);
  }
}

clearState();
console.log(stoppedAny ? '\n  Everything is closed.\n' : '\n  Nothing was running.\n');
