/**
 * Canonical TLV codec — the TypeScript twin of native/vault/src/codec.
 *
 *   field := tag:u16be  type:u8  length:u32be  value[length]
 *
 * Same rules and limits as the C++ side: fixed-width integers, tags in
 * canonical order, strict UTF-8 without NUL, bounded depth/size, and unknown,
 * duplicated or mistyped fields rejected. Schemas come from protocol.gen.ts, so
 * a field can't mean one thing here and another in the vault.
 */
import { Codec, FieldType, Frame, Schema } from './protocol.gen.js';
import type { FieldSpec, MsgTypes, SchemaName } from './protocol.gen.js';

export class CodecError extends Error {
  override name = 'CodecError';
}

const TYPE_CODE: Record<FieldSpec['type'], number> = {
  u64: FieldType.U64,
  i64: FieldType.I64,
  bool: FieldType.BOOL,
  bytes: FieldType.BYTES,
  str: FieldType.STR,
  msg: FieldType.MSG,
};

type AnyMsg = Record<string, unknown>;
type Entry = readonly [field: string, spec: FieldSpec];

const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// Field lists per schema, sorted by tag (canonical order), and a tag index.
const ordered = new Map<string, Entry[]>();
const byTag = new Map<string, Map<number, Entry>>();
for (const [name, fields] of Object.entries(Schema)) {
  const entries = Object.entries(fields as Record<string, FieldSpec>).sort((a, b) => a[1].tag - b[1].tag);
  ordered.set(name, entries);
  byTag.set(name, new Map(entries.map((e) => [e[1].tag, e])));
}

function fail(message: string): never {
  throw new CodecError(message);
}

// --- Encoding -------------------------------------------------------------------

function header(tag: number, type: number, length: number): Uint8Array {
  const h = new Uint8Array(7);
  const dv = new DataView(h.buffer);
  dv.setUint16(0, tag);
  dv.setUint8(2, type);
  dv.setUint32(3, length);
  return h;
}

function encodeValue(spec: FieldSpec, value: unknown, path: string, depth: number): Uint8Array {
  switch (spec.type) {
    case 'u64': {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${path} must be a non-negative integer`);
      const b = new Uint8Array(8);
      new DataView(b.buffer).setBigUint64(0, BigInt(value));
      return b;
    }
    case 'i64': {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${path} must be an integer`);
      const b = new Uint8Array(8);
      new DataView(b.buffer).setBigInt64(0, BigInt(value));
      return b;
    }
    case 'bool':
      if (typeof value !== 'boolean') fail(`${path} must be a boolean`);
      return Uint8Array.of(value ? 1 : 0);
    case 'str': {
      if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0')) fail(`${path} must be text`);
      const b = utf8.encode(value);
      if (b.length > Codec.MAX_STRING) fail(`${path} is too long`);
      return b;
    }
    case 'bytes':
      if (!(value instanceof Uint8Array)) fail(`${path} must be bytes`);
      if (value.length > Codec.MAX_BYTES) fail(`${path} is too long`);
      return value;
    case 'msg':
      if (spec.of) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${path} must be a message`);
        return encodeMessage(spec.of as SchemaName, value as AnyMsg, path, depth + 1);
      }
      if (!(value instanceof Uint8Array)) fail(`${path} must be an encoded message`);
      validate(value, depth + 1);
      return value;
  }
}

function encodeMessage(name: SchemaName, msg: AnyMsg, path: string, depth: number): Uint8Array {
  if (depth > Codec.MAX_DEPTH) fail('message nested too deeply');
  const entries = ordered.get(name)!;
  for (const key of Object.keys(msg)) {
    if (msg[key] !== undefined && !entries.some(([f]) => f === key)) fail(`unknown field ${path}.${key}`);
  }
  const parts: Uint8Array[] = [];
  for (const [field, spec] of entries) {
    const value = msg[field];
    if (value === undefined) continue;
    if (spec.repeated && !Array.isArray(value)) fail(`${path}.${field} must be a list`);
    for (const item of spec.repeated ? (value as unknown[]) : [value]) {
      const body = encodeValue(spec, item, `${path}.${field}`, depth);
      parts.push(header(spec.tag, TYPE_CODE[spec.type], body.length), body);
    }
  }
  return concat(parts);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function encode<N extends SchemaName>(name: N, msg: MsgTypes[N]): Uint8Array {
  const bytes = encodeMessage(name, msg as AnyMsg, name, 0);
  if (bytes.length > Frame.MAX_PAYLOAD) fail('message too large');
  return bytes;
}

// --- Decoding -------------------------------------------------------------------

type Budget = { fields: number };

type RawField = { tag: number; type: number; start: number; end: number };

/** Walk one message level, enforcing structure; recurse into nested messages. */
function scan(bytes: Uint8Array, start: number, end: number, depth: number, budget: Budget): RawField[] {
  if (depth > Codec.MAX_DEPTH) fail('message nested too deeply');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields: RawField[] = [];
  let pos = start;
  let prev = 0;
  while (pos < end) {
    if (end - pos < 7) fail('truncated field header');
    const tag = dv.getUint16(pos);
    const type = dv.getUint8(pos + 2);
    const length = dv.getUint32(pos + 3);
    pos += 7;
    if (tag === 0) fail('field tag 0 is reserved');
    if (tag < prev) fail('fields out of canonical order');
    if (--budget.fields < 0) fail('too many fields');
    if (length > end - pos) fail('truncated field value');
    const valueEnd = pos + length;
    switch (type) {
      case FieldType.U64:
      case FieldType.I64:
        if (length !== 8) fail('integer must be 8 bytes');
        break;
      case FieldType.BOOL:
        if (length !== 1 || bytes[pos]! > 1) fail('bool must be a single 0/1 byte');
        break;
      case FieldType.BYTES:
        if (length > Codec.MAX_BYTES) fail('bytes field too long');
        break;
      case FieldType.STR:
        if (length > Codec.MAX_STRING) fail('string field too long');
        break;
      case FieldType.MSG:
        scan(bytes, pos, valueEnd, depth + 1, budget);
        break;
      default:
        fail('unknown field type');
    }
    fields.push({ tag, type, start: pos, end: valueEnd });
    pos = valueEnd;
    prev = tag;
  }
  return fields;
}

function validate(bytes: Uint8Array, depth: number): void {
  scan(bytes, 0, bytes.length, depth, { fields: Codec.MAX_FIELDS });
}

function decodeText(bytes: Uint8Array): string {
  let s: string;
  try {
    s = strictUtf8.decode(bytes);
  } catch {
    fail('string is not valid UTF-8');
  }
  if (s.includes('\0')) fail('string contains NUL');
  return s;
}

function decodeValue(spec: FieldSpec, bytes: Uint8Array, f: RawField, depth: number, budget: Budget): unknown {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + f.start, f.end - f.start);
  switch (spec.type) {
    case 'u64': {
      const v = dv.getBigUint64(0);
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) fail('integer exceeds the safe range');
      return Number(v);
    }
    case 'i64': {
      const v = dv.getBigInt64(0);
      if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) fail('integer exceeds the safe range');
      return Number(v);
    }
    case 'bool':
      return bytes[f.start] === 1;
    case 'str':
      return decodeText(bytes.subarray(f.start, f.end));
    case 'bytes':
      return bytes.slice(f.start, f.end);
    case 'msg':
      return spec.of
        ? decodeMessage(spec.of as SchemaName, bytes, f.start, f.end, depth + 1, budget)
        : bytes.slice(f.start, f.end);
  }
}

function decodeMessage(name: SchemaName, bytes: Uint8Array, start: number, end: number, depth: number, budget: Budget): AnyMsg {
  const index = byTag.get(name)!;
  const out: AnyMsg = {};
  for (const f of scan(bytes, start, end, depth, { fields: Codec.MAX_FIELDS })) {
    const entry = index.get(f.tag);
    if (!entry) fail(`unexpected field ${f.tag} in ${name}`);
    const [field, spec] = entry;
    if (TYPE_CODE[spec.type] !== f.type) fail(`${name}.${field} has the wrong type`);
    if (--budget.fields < 0) fail('too many fields');
    const value = decodeValue(spec, bytes, f, depth, budget);
    if (spec.repeated) {
      ((out[field] ??= []) as unknown[]).push(value);
    } else {
      if (field in out) fail(`duplicate field ${name}.${field}`);
      out[field] = value;
    }
  }
  return out;
}

export function decode<N extends SchemaName>(name: N, bytes: Uint8Array): MsgTypes[N] {
  if (bytes.length > Frame.MAX_PAYLOAD) fail('message too large');
  return decodeMessage(name, bytes, 0, bytes.length, 0, { fields: Codec.MAX_FIELDS }) as MsgTypes[N];
}
