import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import { CodecError, decode, encode } from '../src/vault/codec.js';
import { FrameError, FrameReader, deriveChannelKeys, sealFrame } from '../src/vault/frame.js';
import { Frame } from '../src/vault/protocol.gen.js';

function field(tag: number, type: number, value: Uint8Array): Uint8Array {
  const out = new Uint8Array(7 + value.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, tag);
  dv.setUint8(2, type);
  dv.setUint32(3, value.length);
  out.set(value, 7);
  return out;
}

describe('TLV codec', () => {
  it('round-trips every wire type, nested and repeated', () => {
    const med = { Id: 'm1', Name: 'Paracétamol 💊', SlotsPerDay: 2, AvgDelayMin: -15, AsNeeded: false };
    const snap = { DisplayName: 'Alex', Med: [med, { ...med, Id: 'm2' }], UpdatedAtMs: Number.MAX_SAFE_INTEGER };
    const bytes = encode('Snapshot', snap);
    assert.deepEqual(decode('Snapshot', bytes), snap);
    assert.deepEqual(encode('Snapshot', decode('Snapshot', bytes)), bytes); // canonical
  });

  it('emits fields in tag order regardless of object key order', () => {
    const a = encode('Actor', { Role: 1, Id: 'x' });
    const b = encode('Actor', { Id: 'x', Role: 1 });
    assert.deepEqual(a, b);
  });

  it('rejects unknown fields, bad types and unsafe integers when encoding', () => {
    assert.throws(() => encode('Actor', { Id: 'x', Nope: 1 } as never), CodecError);
    assert.throws(() => encode('Actor', { Id: 5 } as never), CodecError);
    assert.throws(() => encode('Actor', { Role: 2 ** 53 }), CodecError);
    assert.throws(() => encode('Actor', { Role: -1 }), CodecError);
    assert.throws(() => encode('Actor', { Id: 'bad\uD800' }), CodecError); // lone surrogate
    assert.throws(() => encode('Actor', { Id: 'nul\0' }), CodecError);
  });

  it('rejects non-canonical or hostile input when decoding', () => {
    const eight = new Uint8Array(8);
    const outOfOrder = new Uint8Array([...field(2, 1, eight), ...field(1, 5, new Uint8Array([0x61]))]);
    assert.throws(() => decode('Actor', outOfOrder), /order/);
    assert.throws(() => decode('Actor', field(1, 1, eight)), /wrong type/); // Id must be str
    assert.throws(() => decode('Actor', field(9, 1, eight)), /unexpected field/);
    assert.throws(() => decode('Actor', new Uint8Array([...field(2, 1, eight), ...field(2, 1, eight)])), /duplicate/);
    assert.throws(() => decode('Actor', field(1, 5, new Uint8Array([0xc0, 0xaf]))), /UTF-8/); // overlong
    assert.throws(() => decode('Grant', field(7, 3, new Uint8Array([2]))), /bool/);
    const big = new Uint8Array(8).fill(0xff);
    assert.throws(() => decode('Actor', field(2, 1, big)), /safe range/);
    let nested: Uint8Array = new Uint8Array(0);
    for (let i = 0; i < 10; i++) nested = field(1, 6, nested);
    assert.throws(() => decode('List', nested), /deeply/);
  });

  it('fails cleanly on truncation at every byte and on random garbage', () => {
    const bytes = encode('Provider', { Id: 'p1', Role: 2, Name: 'Mercy', Npi: '1234567893', Verified: true });
    for (let cut = 1; cut < bytes.length; cut++) {
      try {
        decode('Provider', bytes.subarray(0, cut));
      } catch (err) {
        assert.ok(err instanceof CodecError);
      }
    }
    for (let i = 0; i < 2000; i++) {
      try {
        decode('Summary', randomBytes(i % 64));
      } catch (err) {
        assert.ok(err instanceof CodecError);
      }
    }
  });
});

describe('frames', () => {
  const keys = deriveChannelKeys(randomBytes(32));
  const now = 1_760_000_000_000;

  it('accepts in-order frames, split across arbitrary chunk boundaries', () => {
    const reader = new FrameReader(keys.serverToClient, Frame.KIND_RESPONSE, () => now);
    const stream = Buffer.concat([
      sealFrame(keys.serverToClient, Frame.KIND_RESPONSE, 1n, now, Buffer.from('one')),
      sealFrame(keys.serverToClient, Frame.KIND_RESPONSE, 2n, now, Buffer.from('two')),
    ]);
    const got: string[] = [];
    for (let i = 0; i < stream.length; i += 5) {
      for (const p of reader.push(stream.subarray(i, i + 5))) got.push(p.toString());
    }
    assert.deepEqual(got, ['one', 'two']);
  });

  it('rejects tampering, replay, reflection and stale frames — and stays dead', () => {
    const frame = sealFrame(keys.serverToClient, Frame.KIND_RESPONSE, 1n, now, Buffer.from('data'));
    // Any single-bit flip is refused. (A flip that enlarges the length field just
    // leaves the reader waiting for bytes that never come; the client's request
    // timeout handles that.) Either way the payload is never delivered.
    for (let i = 0; i < frame.length; i++) {
      const bad = Buffer.from(frame);
      bad[i]! ^= 1;
      const reader = new FrameReader(keys.serverToClient, Frame.KIND_RESPONSE, () => now);
      let delivered: Buffer[] = [];
      try {
        delivered = reader.push(bad);
      } catch (err) {
        assert.ok(err instanceof FrameError);
      }
      assert.equal(delivered.length, 0, `bit flip at byte ${i} was accepted`);
    }
    const replay = new FrameReader(keys.serverToClient, Frame.KIND_RESPONSE, () => now);
    replay.push(frame);
    assert.throws(() => replay.push(frame), /sequence/);
    assert.throws(() => replay.push(Buffer.alloc(0)), /poisoned/);

    const reflected = sealFrame(keys.clientToServer, Frame.KIND_REQUEST, 1n, now, Buffer.from('x'));
    assert.throws(() => new FrameReader(keys.serverToClient, Frame.KIND_RESPONSE, () => now).push(reflected), /authentication/);

    const stale = new FrameReader(keys.serverToClient, Frame.KIND_RESPONSE, () => now + Frame.MAX_CLOCK_SKEW_MS + 1);
    assert.throws(() => stale.push(frame), /window/);
  });
});
