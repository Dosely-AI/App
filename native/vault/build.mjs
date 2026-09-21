#!/usr/bin/env node
/**
 * Build for the Dosely Vault (C++20 + vendored Monocypher).
 *
 *   node native/vault/build.mjs              build the vault to WebAssembly (default)
 *   node native/vault/build.mjs test         build to WebAssembly, run the C++ tests
 *   node native/vault/build.mjs native       build native executables (system g++/clang++)
 *   node native/vault/build.mjs test-native  build native, run the C++ tests
 *   node native/vault/build.mjs gen          regenerate protocol code (C++, server TS, app TS)
 *   node native/vault/build.mjs gen --check  fail if generated code is stale
 *   node native/vault/build.mjs clean        remove build outputs
 *
 * The WebAssembly build needs only Node (run `npm install` here once for the
 * compiler). Native builds use $CXX / $CC, g++/clang++ on PATH, or MSYS2 UCRT64
 * on Windows. STRICT=1 turns warnings into errors for either.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { basename, delimiter, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..', '..');
const BUILD = join(ROOT, 'build');
const EXE = process.platform === 'win32' ? '.exe' : '';
const DEF = join(ROOT, 'protocol', 'protocol.def');
const GEN_CPP = join(ROOT, 'src', 'core', 'protocol.gen.hpp');
const GEN_TS = join(REPO, 'server', 'src', 'vault', 'protocol.gen.ts');
const GEN_APP = join(REPO, 'src', 'lib', 'care', 'protocol.gen.ts');

// ---------------------------------------------------------------------------
// Protocol code generation
// ---------------------------------------------------------------------------

const SCALARS = new Set(['u64', 'i64', 'bool', 'str', 'bytes']);
const TS_SCALAR = { u64: 'number', i64: 'number', bool: 'boolean', str: 'string', bytes: 'Uint8Array' };

/** Parse protocol.def into ordered groups. */
export function parseDef(text) {
  const groups = new Map(); // name -> { kind, entries: [{ name, value }] }
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const [kind, group, name, valueText, type] = parts;
    const columns = kind === 'field' ? 5 : 4;
    if (parts.length !== columns) throw new Error(`protocol.def:${i + 1}: expected ${columns} columns`);
    if (!['enum', 'flags', 'const', 'field'].includes(kind)) throw new Error(`protocol.def:${i + 1}: bad kind ${kind}`);
    const value = Number(valueText);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`protocol.def:${i + 1}: bad value`);
    let g = groups.get(group);
    if (!g) groups.set(group, (g = { kind, entries: [] }));
    if (g.kind !== kind) throw new Error(`protocol.def:${i + 1}: group ${group} mixes kinds`);
    if (g.entries.some((e) => e.name === name)) throw new Error(`protocol.def:${i + 1}: duplicate ${group}.${name}`);
    if (kind !== 'const' && g.entries.some((e) => e.value === value)) {
      throw new Error(`protocol.def:${i + 1}: duplicate value ${value} in ${group}`);
    }
    if (kind === 'field' && (value < 1 || value > 0xffff)) throw new Error(`protocol.def:${i + 1}: tag out of range`);
    g.entries.push(kind === 'field' ? { name, value, type, line: i + 1 } : { name, value });
  });
  // Field types must be scalars or refer to another field group.
  for (const g of groups.values()) {
    if (g.kind !== 'field') continue;
    for (const e of g.entries) {
      const base = e.type.replace(/\[\]$/, '');
      if (SCALARS.has(base) || base === 'msg') continue;
      if (groups.get(base)?.kind !== 'field') throw new Error(`protocol.def:${e.line}: unknown type ${e.type}`);
    }
  }
  return groups;
}

const HEADER_NOTE = 'GENERATED from native/vault/protocol/protocol.def by build.mjs — do not edit.';

function genCpp(groups) {
  const out = [`// ${HEADER_NOTE}`, '#pragma once', '#include <cstdint>', '', 'namespace dosely::proto {', ''];
  for (const [group, g] of groups) {
    if (g.kind === 'enum') {
      out.push(`enum class ${group} : uint32_t {`);
      for (const e of g.entries) out.push(`  ${e.name} = ${e.value},`);
      out.push('};', '');
    } else if (g.kind === 'flags' || g.kind === 'const') {
      out.push(`namespace ${group} {`);
      for (const e of g.entries) out.push(`inline constexpr uint32_t ${e.name} = ${e.value}u;`);
      out.push(`}  // namespace ${group}`, '');
    }
  }
  out.push('namespace tag {');
  for (const [group, g] of groups) {
    if (g.kind !== 'field') continue;
    out.push(`namespace ${group} {`);
    for (const e of g.entries) out.push(`inline constexpr uint16_t ${e.name} = ${e.value};`);
    out.push(`}  // namespace ${group}`);
  }
  out.push('}  // namespace tag', '', '}  // namespace dosely::proto', '');
  return out.join('\n');
}

function genTs(groups) {
  const out = [`// ${HEADER_NOTE}`, ''];
  for (const [group, g] of groups) {
    if (g.kind === 'field') continue;
    out.push(`export const ${group} = {`);
    for (const e of g.entries) out.push(`  ${e.name}: ${e.value},`);
    out.push('} as const;');
    if (g.kind === 'enum') out.push(`export type ${group} = (typeof ${group})[keyof typeof ${group}];`);
    out.push('');
  }
  // Wire schemas: tag + type per field, consumed by the generic TS codec.
  out.push(
    "export type WireType = 'u64' | 'i64' | 'bool' | 'str' | 'bytes' | 'msg';",
    'export type FieldSpec = {',
    '  readonly tag: number;',
    '  readonly type: WireType;',
    '  /** Nested message group; absent for untyped (command-dependent) messages. */',
    '  readonly of?: string;',
    '  readonly repeated?: boolean;',
    '};',
    '',
    'export const Schema = {',
  );
  const fieldGroups = [...groups].filter(([, g]) => g.kind === 'field');
  for (const [group, g] of fieldGroups) {
    out.push(`  ${group}: {`);
    for (const e of g.entries) {
      const repeated = e.type.endsWith('[]');
      const base = e.type.replace(/\[\]$/, '');
      const parts = [`tag: ${e.value}`];
      if (SCALARS.has(base)) parts.push(`type: '${base}'`);
      else {
        parts.push("type: 'msg'");
        if (base !== 'msg') parts.push(`of: '${base}'`);
      }
      if (repeated) parts.push('repeated: true');
      out.push(`    ${e.name}: { ${parts.join(', ')} },`);
    }
    out.push('  },');
  }
  out.push('} as const satisfies Record<string, Record<string, FieldSpec>>;', '');
  out.push('export type SchemaName = keyof typeof Schema;', '');

  // Decoded shapes. Every field is optional on the wire; untyped messages stay
  // encoded (Uint8Array) until the caller decodes them with the right schema.
  for (const [group, g] of fieldGroups) {
    out.push(`export interface ${group}Msg {`);
    for (const e of g.entries) {
      const repeated = e.type.endsWith('[]');
      const base = e.type.replace(/\[\]$/, '');
      const ts = SCALARS.has(base) ? TS_SCALAR[base] : base === 'msg' ? 'Uint8Array' : `${base}Msg`;
      out.push(`  ${e.name}?: ${ts}${repeated ? '[]' : ''};`);
    }
    out.push('}', '');
  }
  out.push('export type MsgTypes = {');
  for (const [group] of fieldGroups) out.push(`  ${group}: ${group}Msg;`);
  out.push('};', '');
  return out.join('\n');
}

// The app sees the care API as JSON: camelCase keys, bytes as base64url strings.
const APP_ENUMS = ['Role', 'Scope', 'Purpose', 'RxStatus', 'RefillLevel', 'RiskReason', 'WorkKind', 'Cmd'];
const APP_MESSAGES = [
  'Provider', 'Grant', 'Invite', 'Snapshot', 'Med', 'Rx', 'StatusEvent', 'Summary', 'MedSummary',
  'SyncPlan', 'ShortFill', 'PharmacyRef', 'PatientRef', 'Work', 'Audit', 'Stats',
];
const camel = (name) => name[0].toLowerCase() + name.slice(1);

function genApp(groups) {
  const out = [`// ${HEADER_NOTE}`, '// JSON shapes of the Dosely care API (see server/src/care).', ''];
  for (const name of APP_ENUMS) {
    const g = groups.get(name);
    out.push(`export const ${name} = {`);
    for (const e of g.entries) out.push(`  ${e.name}: ${e.value},`);
    out.push('} as const;');
    if (g.kind === 'enum') out.push(`export type ${name} = (typeof ${name})[keyof typeof ${name}];`);
    out.push('');
  }
  const JSON_SCALAR = { u64: 'number', i64: 'number', bool: 'boolean', str: 'string', bytes: 'string' };
  for (const name of APP_MESSAGES) {
    out.push(`export interface ${name}Json {`);
    for (const e of groups.get(name).entries) {
      const repeated = e.type.endsWith('[]');
      const base = e.type.replace(/\[\]$/, '');
      const ts = SCALARS.has(base) ? JSON_SCALAR[base] : base === 'msg' ? 'unknown' : `${base}Json`;
      out.push(`  ${camel(e.name)}?: ${ts}${repeated ? '[]' : ''};`);
    }
    out.push('}', '');
  }
  return out.join('\n');
}

function generate({ check }) {
  const groups = parseDef(readFileSync(DEF, 'utf8'));
  const targets = [
    [GEN_CPP, genCpp(groups)],
    [GEN_TS, genTs(groups)],
    [GEN_APP, genApp(groups)],
  ];
  let stale = false;
  for (const [file, text] of targets) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (current === text) continue;
    stale = true;
    if (check) console.error(`stale: ${relative(REPO, file)}`);
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      console.log(`generated ${relative(REPO, file)}`);
    }
  }
  if (check && stale) {
    console.error('Protocol code is out of date — run: node native/vault/build.mjs gen');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

function onPath(cmd) {
  const dirs = (process.env.PATH ?? '').split(delimiter);
  for (const d of dirs) {
    for (const ext of process.platform === 'win32' ? ['.exe', ''] : ['']) {
      const p = join(d, cmd + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function findCompiler(envVar, names) {
  if (process.env[envVar]) return process.env[envVar];
  if (process.platform === 'win32') {
    for (const n of names) {
      const msys = join('C:\\msys64\\ucrt64\\bin', `${n}.exe`);
      if (existsSync(msys)) return msys;
    }
  }
  for (const n of names) {
    const p = onPath(n);
    if (p) return p;
  }
  throw new Error(`No ${envVar} compiler found (tried ${names.join(', ')}). Install g++ or clang++, or set ${envVar}.`);
}

// ---------------------------------------------------------------------------
// Build: two backends compile the same sources
// ---------------------------------------------------------------------------
//
//   wasm    (default) clang targeting WebAssembly, itself running inside Node
//           (@yowasp/clang). Produces build/*.wasm, run by wasi-host.mjs. No
//           native program is created, so allow-listing such as Windows Smart
//           App Control has nothing to block, and the only prerequisite is Node.
//   native  (opt-in) the system g++/clang++: faster, with OS-level hardening, but
//           every rebuild is a new unsigned binary that Smart App Control may block.

const WARNINGS = ['-Wall', '-Wextra', '-Wpedantic', '-Wshadow', '-Wnon-virtual-dtor', '-Wold-style-cast'];
const STRICT = process.env.STRICT === '1' ? ['-Werror'] : [];
const TMP = join(BUILD, 'tmp');

function listFiles(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const posixPath = (p) => relative(ROOT, p).split(/[\\/]/).join('/');

// --- WebAssembly backend ---------------------------------------------------------

/** Every source and header, as the compiler's virtual filesystem sees them. */
function sourceTree() {
  const tree = {};
  const files = [
    ...listFiles(join(ROOT, 'src'), ['.hpp', '.cpp']),
    ...listFiles(join(ROOT, 'tests'), ['.hpp', '.cpp']),
    ...listFiles(join(ROOT, 'third_party', 'monocypher'), ['.c', '.h']),
  ];
  for (const file of files) {
    const parts = posixPath(file).split('/');
    let node = tree;
    for (const dir of parts.slice(0, -1)) node = node[dir] ??= {};
    node[parts.at(-1)] = new Uint8Array(readFileSync(file));
  }
  return tree;
}

/**
 * WebAssembly clang instances on worker threads (clang-worker.mjs), one per
 * compile slot. Each holds its own copy of the compiler, so the pool is sized
 * by both cores and free memory.
 */
class ClangPool {
  #workers = [];
  #pending = new Map();
  #nextId = 0;

  #worker(slot) {
    this.#workers[slot] ??= new Promise((resolveReady, rejectReady) => {
      const worker = new Worker(join(ROOT, 'clang-worker.mjs'), { workerData: { tree: sourceTree() } });
      worker.on('message', (msg) => {
        if (msg.ready) return resolveReady(worker);
        if (msg.fatal) return rejectReady(new Error(msg.fatal));
        const done = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        done?.(msg);
      });
      worker.on('error', rejectReady);
    });
    return this.#workers[slot];
  }

  /** Run clang/clang++ in `slot`; `files` are added to the source tree; returns the `output` file's bytes. */
  async run(slot, tool, args, output, files = {}) {
    const worker = await this.#worker(slot);
    const id = this.#nextId++;
    return new Promise((done) => {
      this.#pending.set(id, done);
      worker.postMessage({ id, tool, args, files, output });
    });
  }

  async close() {
    for (const w of this.#workers) (await w.catch(() => null))?.terminate();
  }
}

const wasm = {
  label: 'clang (WebAssembly, running in Node)',
  objDir: join(BUILD, 'obj-wasm'),
  outputs: { vault: join(BUILD, 'dosely-vault.wasm'), tests: join(BUILD, 'vault-tests.wasm') },
  // Up to 4 compilers, leaving a core spare and ~700 MB of free memory each.
  width: Math.max(1, Math.min(4, os.cpus().length - 1, Math.floor(os.freemem() / 700e6))),
  pool: null,
  async compile(job, slot) {
    this.pool ??= new ClangPool();
    const flags = job.isC
      ? ['--target=wasm32-wasip1', '-std=c99', '-O2', '-w']
      : ['--target=wasm32-wasip1', '-std=c++20', '-O2', '-fno-exceptions', ...WARNINGS, ...STRICT, '-Isrc', '-Ithird_party/monocypher'];
    const r = await this.pool.run(slot, job.isC ? 'clang' : 'clang++', [...flags, '-c', posixPath(job.src), '-o', 'out.o'], 'out.o');
    if (r.code === 0) writeFileSync(job.obj, r.bytes);
    return r;
  },
  async link(objects, out) {
    this.pool ??= new ClangPool();
    const files = Object.fromEntries(objects.map((o, i) => [`${i}.o`, new Uint8Array(readFileSync(o))]));
    // 1 MiB stack: the default 64 KiB is too small for the vault's I/O buffers.
    const flags = ['--target=wasm32-wasip1', '-Wl,-z,stack-size=1048576'];
    const r = await this.pool.run(0, 'clang++', [...flags, ...Object.keys(files), '-o', 'out.wasm'], 'out.wasm', files);
    if (r.code === 0) writeFileSync(out, r.bytes);
    return r;
  },
  run(module, args, cwd) {
    // Tests see `cwd` as their filesystem root; nothing else on disk is reachable.
    const host = join(ROOT, 'wasi-host.mjs');
    return spawn(process.execPath, ['--no-warnings', host, module, '--root', cwd, ...args], { stdio: 'inherit' });
  },
  close() {
    return this.pool?.close();
  },
};

// --- Native backend ----------------------------------------------------------------

let nativeTools = null;
function nativeToolchain() {
  if (nativeTools) return nativeTools;
  const cxx = findCompiler('CXX', ['g++', 'clang++', 'c++']);
  const cc = findCompiler('CC', ['gcc', 'clang', 'cc']);
  // The compiler's own directory first (so it finds its helpers and DLLs), and
  // temp files kept inside the build tree.
  const env = { ...process.env, PATH: [dirname(cxx), process.env.PATH ?? ''].join(delimiter), TMP, TEMP: TMP, TMPDIR: TMP };
  mkdirSync(TMP, { recursive: true });
  return (nativeTools = { cxx, cc, env });
}

function runProcess(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: nativeToolchain().env });
    let output = '';
    child.stdout?.on('data', (d) => (output += d));
    child.stderr?.on('data', (d) => (output += d));
    child.on('error', (err) => resolve({ code: -1, output: String(err) }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

const native = {
  get label() {
    return basename(nativeToolchain().cxx);
  },
  objDir: join(BUILD, 'obj-native'),
  outputs: { vault: join(BUILD, `dosely-vault${EXE}`), tests: join(BUILD, `vault-tests${EXE}`) },
  compile(job) {
    const harden = ['-fstack-protector-strong'];
    const flags = job.isC
      ? ['-std=c99', '-O2', '-w', ...harden]
      : ['-std=c++20', '-O2', ...WARNINGS, ...STRICT, ...harden, `-I${join(ROOT, 'src')}`, `-I${join(ROOT, 'third_party', 'monocypher')}`];
    const { cc, cxx } = nativeToolchain();
    return runProcess(job.isC ? cc : cxx, [...flags, '-c', job.src, '-o', job.obj]);
  },
  link(objects, out) {
    const flags = process.platform === 'win32' ? ['-static', '-lbcrypt'] : process.platform === 'darwin' ? [] : ['-pthread'];
    return runProcess(nativeToolchain().cxx, [...objects, '-o', out, ...flags]);
  },
  run(exe, args, cwd) {
    return spawn(exe, args, { cwd, env: nativeToolchain().env, stdio: 'inherit' });
  },
  width: Math.max(1, Math.min(os.cpus().length, 8)),
};

// --- Shared pipeline ------------------------------------------------------------------

async function compileAll(backend, sources, headersMtime) {
  const jobs = sources.map((src) => {
    const obj = join(backend.objDir, relative(ROOT, src).replace(/[\\/]/g, '_').replace(/\.(c|cpp)$/, '.o'));
    return { src, obj, isC: src.endsWith('.c'), upToDate: mtime(obj) > mtime(src) && mtime(obj) > headersMtime };
  });
  const todo = jobs.filter((j) => !j.upToDate);
  let failed = false;
  let next = 0;
  async function worker(slot) {
    while (next < todo.length) {
      const job = todo[next++];
      const { code, output } = await backend.compile(job, slot);
      const label = relative(ROOT, job.src);
      if (code !== 0) {
        failed = true;
        console.error(`✗ ${label}\n${output}`);
      } else {
        console.log(`  compiled ${label}${output.trim() ? `\n${output}` : ''}`);
      }
    }
  }
  await Promise.all(Array.from({ length: backend.width }, (_, slot) => worker(slot)));
  if (failed) throw new Error('compilation failed');
  return jobs.map((j) => j.obj);
}

async function link(backend, objects, out) {
  if (mtime(out) > Math.max(...objects.map(mtime))) {
    console.log(`  up to date ${relative(ROOT, out)}`);
    return;
  }
  const { code, output } = await backend.link(objects, out);
  if (code !== 0) {
    console.error(output);
    throw new Error(`link failed: ${basename(out)}`);
  }
  console.log(`  linked ${relative(ROOT, out)}`);
}

async function build(backend) {
  generate({ check: false });
  mkdirSync(backend.objDir, { recursive: true });

  const libSources = [
    ...listFiles(join(ROOT, 'third_party', 'monocypher'), ['.c']),
    ...listFiles(join(ROOT, 'src'), ['.cpp']).filter((f) => basename(f) !== 'main.cpp'),
  ];
  const testSources = listFiles(join(ROOT, 'tests'), ['.cpp']);
  const headers = [...listFiles(join(ROOT, 'src'), ['.hpp']), ...listFiles(join(ROOT, 'tests'), ['.hpp'])];
  const headersMtime = Math.max(0, ...headers.map(mtime), mtime(join(ROOT, 'third_party', 'monocypher', 'monocypher.h')));

  console.log(`Building Dosely Vault with ${backend.label} …`);
  try {
    const mainSource = join(ROOT, 'src', 'main.cpp');
    const objects = await compileAll(backend, [...libSources, mainSource, ...testSources], headersMtime);
    const lib = objects.slice(0, libSources.length);
    const main = objects[libSources.length];
    const tests = objects.slice(libSources.length + 1);
    await link(backend, [main, ...lib], backend.outputs.vault);
    await link(backend, [...tests, ...lib], backend.outputs.tests);
  } finally {
    await backend.close?.();
  }
}

async function runTests(backend, args) {
  const dataDir = join(BUILD, 'testdata');
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const child = backend.run(backend.outputs.tests, args, dataDir);
  const code = await new Promise((r) => child.on('close', r));
  if (code !== 0) process.exit(code ?? 1);
}

const cmd = process.argv[2] ?? 'build';
const extra = process.argv.slice(3);
try {
  if (cmd === 'gen') generate({ check: extra.includes('--check') });
  else if (cmd === 'clean') rmSync(BUILD, { recursive: true, force: true });
  else if (cmd === 'build') await build(wasm);
  else if (cmd === 'test') {
    await build(wasm);
    await runTests(wasm, extra);
  } else if (cmd === 'native') await build(native);
  else if (cmd === 'test-native') {
    await build(native);
    await runTests(native, extra);
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(2);
  }
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}
