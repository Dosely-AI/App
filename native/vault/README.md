# Dosely Vault

The encrypted patient database behind the care network, written in C++20 and
run as a separate process by the API server. Design and threat model:
[docs/care-network/ARCHITECTURE.md](../../docs/care-network/ARCHITECTURE.md).

## Build and test

The vault compiles to **WebAssembly** and runs inside Node. The only
prerequisite is Node: the compiler ([`@yowasp/clang`](https://yowasp.org), LLVM
built for WebAssembly) is an npm dev dependency that also runs inside Node.

```bash
npm install --prefix native/vault
```
```bash
node native/vault/build.mjs test
```

| Command | Does |
|---|---|
| `build.mjs` | build `build/dosely-vault.wasm` and `build/vault-tests.wasm` (incremental, parallel) |
| `build.mjs test` | build, then run the C++ suite (`STRICT=1` adds `-Werror`) |
| `build.mjs native` / `test-native` | the same with the system g++/clang++, producing native executables |
| `build.mjs gen` | regenerate protocol code for C++, the server and the app |
| `build.mjs gen --check` | fail if generated code is stale (no compiler needed) |
| `build.mjs clean` | remove build outputs |

### Why WebAssembly (Windows Smart App Control)

Smart App Control allows native programs only if they are signed or have an
established reputation. Every rebuild of the vault is a brand-new, unsigned
binary, so SAC can block it at any time (it did, on this project). A code-signing
certificate would fix that for releases, but not for day-to-day builds.

Built as WebAssembly, nothing native is ever produced: `node.exe` is already a
trusted program, and the vault is code it runs. It works with SAC on, needs no
signing, and is the same file on Windows, macOS and Linux. The process boundary
is unchanged: [`wasi-host.mjs`](wasi-host.mjs) runs the module in its own Node
process, which the API server spawns exactly as it would a native vault.

Differences from a native build:
- The vault can reach only the directories the host maps in (`/data`, `/keys`).
  Node's WASI is not a hardened sandbox, but the vault has no other file access.
- WASI has no file locks, so the host holds `vault.lock` (on Windows with an
  exclusive open that the OS releases if the process dies).
- No C++ exceptions: failures are `Status` values already, and anything truly
  unexpected aborts the process, which the server restarts.
- Linux core-dump/ptrace hardening (`prctl`) applies only to native builds.

Native builds remain available for servers where allow-listing isn't a concern
(set `VAULT_BIN` to the executable). On Windows, run native builds from
PowerShell or cmd rather than Git Bash.

## Run

The API server starts the vault itself (see `VAULT_*` in `server/.env.example`).
By hand:

```bash
node native/vault/wasi-host.mjs native/vault/build/dosely-vault.wasm --init-key-file /secure/vault.key
```
```bash
node native/vault/wasi-host.mjs native/vault/build/dosely-vault.wasm --data /var/lib/dosely --key-file /secure/vault.key
```

The parent must first write `DOSELY-VAULT-KEY` plus a random 32-byte session key
to stdin; after that stdin/stdout carry only authenticated frames. Diagnostics go
to stderr and never include patient data.

## Layout

| Path | Role |
|---|---|
| `build.mjs` | build (WebAssembly or native), protocol code generation |
| `wasi-host.mjs` | runs a `.wasm` build under Node's WASI: path mapping, data-directory lock |
| `clang-worker.mjs` | one WebAssembly clang per worker thread, for parallel builds |
| `protocol/protocol.def` | the single protocol source (enums, constants, message fields and wire types) |
| `src/core` | bytes, `Status`/`Result`, injectable clock, generated protocol header |
| `src/crypto` | typed wrappers over Monocypher: AEAD, Ed25519, HMAC, HKDF, Argon2id; wiping secrets |
| `src/codec` | canonical TLV encoder/decoder |
| `src/net` | authenticated, sequenced frames over a byte stream |
| `src/store` | durable append file, key hierarchy, encrypted record store, audit log, directory lock |
| `src/domain` | validated records, NPI check, signed prescriptions, signed invites, Rx state machine |
| `src/ecs` | entity-component registry, components, analytics systems and pipeline |
| `src/policy` | `AccessPolicy` — every authorization rule |
| `src/service` | `Vault`, scope-limited `CareAnalytics`, one `ICommand` class per command, `Dispatcher` |
| `tests` | 47 tests: published crypto vectors, fuzzing, on-disk tampering, authorization matrix |

## Third-party code

`third_party/monocypher` is [Monocypher](https://monocypher.org) 4.0.2 (BSD-2-Clause
or CC0), vendored unmodified from the `4.0.2` tag. SHA-256:

```
02174117935699d418443c75a558a287deb06ef8cf7c1adced61d9047d2f323d  monocypher.c
fcaf6ed771358bb4f40fba016f6518ae86ec02b1b877d2cc35ad92d3a26fd7b3  monocypher.h
97d581639dfa72be08a6d57deb7d79b736be001cb416819cab196d22559d242b  monocypher-ed25519.c
3a3035181f991a158d0e1c7567258f0bae8ba0f1f23c5512b4a1db1b3c9730ce  monocypher-ed25519.h
a5781770269d2516e52ba4863f790c10a16da4089a1e81823aee19ff1e9026b0  LICENCE.md
```

The build uses [`@yowasp/clang`](https://www.npmjs.com/package/@yowasp/clang)
(ISC; LLVM/Clang/LLD compiled to WebAssembly) as a pinned dev dependency. It is
never shipped or run by the server.

The test suite checks the primitives against RFC 8032 (Ed25519), RFC 4231
(HMAC-SHA-512), RFC 9106 (Argon2id) and the XChaCha20-Poly1305 draft vectors.
