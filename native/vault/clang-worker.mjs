/**
 * One WebAssembly clang, on its own thread, for build.mjs's compile pool.
 * The source tree arrives once (workerData); each job sends only arguments.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

let runClang;
try {
  const entry = createRequire(import.meta.url).resolve('@yowasp/clang');
  ({ runClang } = await import(pathToFileURL(entry).href));
  await runClang(null, {}, { fetchProgress: () => {} }); // load the compiler quietly, once
} catch (err) {
  parentPort.postMessage({ fatal: `The WebAssembly compiler is missing — run \`npm install\` in native/vault. (${err})` });
  process.exit(1);
}

parentPort.on('message', async ({ id, tool, args, files, output: outName }) => {
  let text = '';
  const collect = (bytes) => {
    if (bytes) text += new TextDecoder().decode(bytes);
  };
  try {
    const tree = await runClang([tool, ...args], { ...workerData.tree, ...files }, {
      stdout: collect,
      stderr: collect,
      decodeASCII: false,
    });
    parentPort.postMessage({ id, code: 0, output: text, bytes: tree[outName] });
  } catch (err) {
    parentPort.postMessage({ id, code: err?.code ?? -1, output: text || String(err) });
  }
});
parentPort.postMessage({ ready: true });
