/**
 * Authenticated frames — the TypeScript twin of native/vault/src/net/frame.
 *
 *   frame  := header(28) payload mac(32)
 *   header := "DSV1" version:u8 kind:u8 flags:u16 seq:u64 timestampMs:u64 length:u32
 *   mac    := HMAC-SHA-512(directionKey, header || payload)[0..32]
 *
 * The reader bounds-checks the header before buffering a payload, verifies the
 * MAC in constant time before looking at anything else, then enforces strict
 * sequence numbers and a clock-skew window. Any violation throws, and the
 * caller must treat the stream as dead.
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import { Frame } from './protocol.gen.js';

export class FrameError extends Error {
  override name = 'FrameError';
}

export const MAGIC = Buffer.from('DSV1', 'ascii');
export type FrameKind = typeof Frame.KIND_REQUEST | typeof Frame.KIND_RESPONSE;

export type ChannelKeys = { clientToServer: Buffer; serverToClient: Buffer };

export function deriveChannelKeys(sessionKey: Uint8Array): ChannelKeys {
  const derive = (info: string) => Buffer.from(hkdfSync('sha512', sessionKey, new Uint8Array(0), info, 32));
  return { clientToServer: derive('dosely-vault/v1/c2s'), serverToClient: derive('dosely-vault/v1/s2c') };
}

function mac(key: Buffer, header: Uint8Array, payload: Uint8Array): Buffer {
  return createHmac('sha512', key).update(header).update(payload).digest().subarray(0, Frame.MAC_SIZE);
}

export function sealFrame(key: Buffer, kind: FrameKind, seq: bigint, timestampMs: number, payload: Uint8Array): Buffer {
  if (payload.length > Frame.MAX_PAYLOAD) throw new FrameError('payload too large');
  const header = Buffer.alloc(Frame.HEADER_SIZE);
  MAGIC.copy(header, 0);
  header.writeUInt8(Frame.VERSION, 4);
  header.writeUInt8(kind, 5);
  header.writeUInt16BE(0, 6);
  header.writeBigUInt64BE(seq, 8);
  header.writeBigUInt64BE(BigInt(timestampMs), 16);
  header.writeUInt32BE(payload.length, 24);
  return Buffer.concat([header, payload, mac(key, header, payload)]);
}

/** Incremental reader for one direction of the stream. */
export class FrameReader {
  private buffer = Buffer.alloc(0);
  private expectedSeq = 1n;
  private dead = false;

  constructor(
    private readonly key: Buffer,
    private readonly kind: FrameKind,
    private readonly now: () => number = Date.now,
  ) {}

  /** Feed bytes; returns every complete, verified payload. Throws on any violation. */
  push(chunk: Uint8Array): Buffer[] {
    if (this.dead) throw new FrameError('stream is poisoned');
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    const out: Buffer[] = [];
    try {
      for (;;) {
        const payload = this.next();
        if (!payload) break;
        out.push(payload);
      }
    } catch (err) {
      this.dead = true;
      throw err;
    }
    return out;
  }

  private next(): Buffer | null {
    if (this.buffer.length < Frame.HEADER_SIZE) return null;
    const header = this.buffer.subarray(0, Frame.HEADER_SIZE);
    if (!header.subarray(0, 4).equals(MAGIC)) throw new FrameError('bad frame magic');
    if (header.readUInt8(4) !== Frame.VERSION) throw new FrameError('unsupported frame version');
    if (header.readUInt16BE(6) !== 0) throw new FrameError('reserved frame flags set');
    const length = header.readUInt32BE(24);
    if (length > Frame.MAX_PAYLOAD) throw new FrameError('frame payload too large');
    const total = Frame.HEADER_SIZE + length + Frame.MAC_SIZE;
    if (this.buffer.length < total) return null;

    const payload = this.buffer.subarray(Frame.HEADER_SIZE, Frame.HEADER_SIZE + length);
    const tag = this.buffer.subarray(Frame.HEADER_SIZE + length, total);
    if (!timingSafeEqual(tag, mac(this.key, header, payload))) throw new FrameError('frame authentication failed');
    if (header.readUInt8(5) !== this.kind) throw new FrameError('unexpected frame kind');
    if (header.readBigUInt64BE(8) !== this.expectedSeq) throw new FrameError('frame out of sequence');
    const skew = Number(header.readBigUInt64BE(16)) - this.now();
    if (Math.abs(skew) > Frame.MAX_CLOCK_SKEW_MS) throw new FrameError('frame timestamp outside the allowed window');

    this.expectedSeq += 1n;
    const result = Buffer.from(payload); // copy out of the shared buffer
    this.buffer = this.buffer.subarray(total);
    return result;
  }
}
