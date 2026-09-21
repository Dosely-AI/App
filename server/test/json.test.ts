import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { NonceCache } from '../src/care/guard.js';
import { RequestError, fromJson, toJson } from '../src/care/json.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('JSON boundary', () => {
  it('maps camelCase JSON to schema fields and back', () => {
    const msg = fromJson('Snapshot', { displayName: 'Alex', med: [{ id: 'm1', name: 'Metformin', slotsPerDay: 2 }] });
    assert.deepEqual(msg, { DisplayName: 'Alex', Med: [{ Id: 'm1', Name: 'Metformin', SlotsPerDay: 2 }] });
    assert.deepEqual(toJson('Snapshot', msg), { displayName: 'Alex', med: [{ id: 'm1', name: 'Metformin', slotsPerDay: 2 }] });
  });

  it('round-trips bytes as base64url', () => {
    const arg = fromJson('Arg', { token: 'AQID_-8' });
    assert.deepEqual([...arg.Token!], [1, 2, 3, 255, 239]);
    assert.throws(() => fromJson('Arg', { token: 'not base64!' }), RequestError);
  });

  it('rejects unknown, disallowed and mistyped fields', () => {
    assert.throws(() => fromJson('Snapshot', { displayName: 'A', admin: true }), /not allowed/);
    assert.throws(() => fromJson('Snapshot', { patientId: 'someone' }, ['displayName', 'med']), /not allowed/);
    assert.throws(() => fromJson('Snapshot', { med: [{ id: 'm', slotsPerDay: 1.5 }] }), /integer/);
    assert.throws(() => fromJson('Snapshot', { med: [{ id: 'm', slotsPerDay: -1 }] }), /integer/);
    assert.throws(() => fromJson('Snapshot', { med: {} }), /list/);
    assert.throws(() => fromJson('Snapshot', { med: new Array(300).fill({}) }), /max/);
    assert.throws(() => fromJson('Snapshot', 'nope'), /object/);
  });
});

describe('replay nonce cache', () => {
  it('accepts a nonce once, then again only after it expires', () => {
    const cache = new NonceCache(1000);
    assert.equal(cache.claim('u:n1', 0), true);
    assert.equal(cache.claim('u:n1', 500), false);
    assert.equal(cache.claim('u:n2', 500), true);
    assert.equal(cache.claim('u:n1', 1500), true);
  });

  it('fails closed when full', () => {
    const cache = new NonceCache(60_000, 2);
    assert.equal(cache.claim('a', 0), true);
    assert.equal(cache.claim('b', 0), true);
    assert.equal(cache.claim('c', 0), false);
  });
});

describe('protocol', () => {
  it('generated code is up to date with protocol.def', () => {
    const r = spawnSync(process.execPath, [resolve(repo, 'native/vault/build.mjs'), 'gen', '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
});
