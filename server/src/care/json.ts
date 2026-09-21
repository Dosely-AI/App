/**
 * JSON <-> wire messages for the care API, driven by the generated schema.
 *
 * The API speaks camelCase JSON (bytes as base64url); the vault speaks TLV with
 * PascalCase schema fields. Converting through the schema means request
 * validation is exhaustive and can't drift from the protocol: unknown keys,
 * wrong types, unsafe integers and oversized lists are rejected here, before
 * anything reaches the vault (which validates again, independently).
 */
import { Codec, Schema } from '../vault/protocol.gen.js';
import type { FieldSpec, MsgTypes, SchemaName } from '../vault/protocol.gen.js';

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const MAX_LIST = 256;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

const camel = (s: string) => s[0]!.toLowerCase() + s.slice(1);
const fieldsOf = (name: SchemaName) => Object.entries(Schema[name]) as [string, FieldSpec][];

/** Decoded wire message -> JSON. Untyped nested messages are omitted. */
export function toJson<N extends SchemaName>(name: N, msg: MsgTypes[N]): Record<string, unknown> {
  const src = msg as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [field, spec] of fieldsOf(name)) {
    const value = src[field];
    if (value === undefined || (spec.type === 'msg' && !spec.of)) continue;
    const one = (v: unknown): unknown => {
      if (spec.type === 'bytes') return Buffer.from(v as Uint8Array).toString('base64url');
      if (spec.type === 'msg') return toJson(spec.of as SchemaName, v as never);
      return v;
    };
    out[camel(field)] = spec.repeated ? (value as unknown[]).map(one) : one(value);
  }
  return out;
}

function scalar(spec: FieldSpec, v: unknown, path: string): unknown {
  switch (spec.type) {
    case 'u64':
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new RequestError(`${path} must be a non-negative integer`);
      return v;
    case 'i64':
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new RequestError(`${path} must be an integer`);
      return v;
    case 'bool':
      if (typeof v !== 'boolean') throw new RequestError(`${path} must be true or false`);
      return v;
    case 'str':
      if (typeof v !== 'string' || v.length > Codec.MAX_STRING) throw new RequestError(`${path} must be text`);
      return v;
    case 'bytes':
      if (typeof v !== 'string' || v.length > (Codec.MAX_BYTES * 4) / 3 + 4 || !BASE64URL.test(v)) {
        throw new RequestError(`${path} must be base64url`);
      }
      return new Uint8Array(Buffer.from(v, 'base64url'));
    case 'msg':
      throw new RequestError(`${path} is not accepted here`);
  }
}

/**
 * JSON -> wire message, strictly. `allowed` (camelCase) narrows which fields a
 * client may set on this endpoint — e.g. clients never set ids or timestamps.
 */
export function fromJson<N extends SchemaName>(
  name: N,
  value: unknown,
  allowed?: readonly string[],
  path: string = camel(name),
): MsgTypes[N] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RequestError(`${path} must be an object`);
  const byJsonKey = new Map(fieldsOf(name).map(([field, spec]) => [camel(field), [field, spec] as const]));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const entry = byJsonKey.get(key);
    if (!entry || (allowed && !allowed.includes(key))) throw new RequestError(`${path}.${key} is not allowed`);
    if (v === undefined || v === null) continue;
    const [field, spec] = entry;
    const one = (item: unknown, p: string): unknown =>
      spec.type === 'msg' && spec.of ? fromJson(spec.of as SchemaName, item, undefined, p) : scalar(spec, item, p);
    if (spec.repeated) {
      if (!Array.isArray(v) || v.length > MAX_LIST) throw new RequestError(`${path}.${key} must be a list (max ${MAX_LIST})`);
      out[field] = v.map((item, i) => one(item, `${path}.${key}[${i}]`));
    } else {
      out[field] = one(v, `${path}.${key}`);
    }
  }
  return out as MsgTypes[N];
}
