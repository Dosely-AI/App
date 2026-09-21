# Dosely care network — architecture and threat model

The care network connects a patient with their pharmacy and prescribers. The
patient decides who sees what; prescribers send signed prescriptions to the
pharmacy the patient chose; the pharmacy sees refill forecasts and adherence
signals so it can reach out *before* someone runs out. The goal is the one the
app has always had: fewer missed doses. Non-adherence is where most of the harm
happens — gaps in refills are one of its most measurable, most fixable causes.

> Pilot scope. This is not a certified e-prescribing network (see
> [COMPLIANCE.md](COMPLIANCE.md)). Controlled substances are refused.

## Components

```
 App (Expo)                API server (Node)                 Vault (C++20 → WebAssembly, own process)
 ─────────────             ─────────────────                 ───────────────────────────────
 patient hub     HTTPS     passkey sessions (who)   frames   access policy (what)
 provider portal ───────▶  replay guard, rate limit ───────▶ envelope encryption + keys
 QR / deep link            strict JSON validation   stdin/   ECS analytics (refill, PDC, risk,
                           JSON ⇄ TLV (generated)   stdout   med sync, worklist)
                                                             signed prescriptions, audit chain
                                                             ──▶ vault.db  audit.log  (encrypted)
```

* **Trust split.** Node authenticates users (WebAuthn passkeys). The vault makes
  every authorization decision, holds every key, and writes the audit trail.
  Node never sees a key; the master key file is read only by the vault.
* **Runs as WebAssembly.** The C++ is compiled to WebAssembly and run by a
  separate Node process (`native/vault/wasi-host.mjs`). Nothing native is built,
  so allow-listing such as Windows Smart App Control, which blocks new unsigned
  programs, has nothing to block. The vault sees only its mapped data and key
  directories. A native build remains available for servers.
* **One protocol source.** `native/vault/protocol/protocol.def` generates the C++
  constants, the server's wire schemas and the app's JSON types. `gen --check`
  (run by the server tests) fails if anything drifts.

## Data model and encryption

| Tier | Contents | Key | Decrypted |
|---|---|---|---|
| Directory | providers, consent grants, prescription routing/status, spent invites | system key | once at startup (fail closed) |
| Patient | medication snapshot, prescription bodies, fills | the patient's own data key | one record at a time, inside an authorized command |
| Keys | patient data keys, provider signing seeds | key-wrapping key | only when used |
| Audit | who / what / whose / why / outcome | audit seal + MAC keys | on query |

Key hierarchy: master secret (key file, or passphrase via Argon2id) → per-database
KEK (salted) → HKDF sub-keys (wrap, system, audit seal, audit MAC, system signer,
key check). All sealing is XChaCha20-Poly1305 with 192-bit random nonces.

* **Binding.** Every record's associated data is `(type, id, version)`, so a
  ciphertext can't be moved to another record, patient or version. Versions must
  strictly increase; a replayed older record makes the database refuse to open.
* **Crash safety.** Appends are fsync'd before they're acknowledged; a torn final
  record is truncated on open; rewrites are temp-file + fsync + atomic rename.
  An exclusive directory lock prevents two vault processes writing at once.
* **Crypto-shredding.** Erasing a patient revokes all grants, writes a durable
  tombstone, then rewrites the database without the patient's wrapped key or any
  record sealed under it. A crash mid-erase is finished at next startup.
* **Audit log.** Entries are sealed and hash-chained
  (`chain_i = HMAC(k, chain_{i-1} ‖ seq ‖ sealed_i)`). Edits, deletions and
  truncation are detected (`AUDIT_VERIFY` re-reads the file from disk). Denied
  attempts are logged too, and if an access can't be logged its result is
  withheld.

## Packet safety (Node ⇄ vault)

`frame := header(28) ‖ payload ‖ HMAC-SHA-512(dirKey, header ‖ payload)[0..32]`

Per-spawn random session key (sent once over the private stdin pipe) → HKDF
direction keys, so frames can't be reflected or replayed across runs. The reader
bounds-checks the header before allocating, verifies the MAC in constant time
before parsing, then enforces strict `seq + 1` and a ±5-minute clock window. Any
violation poisons the stream: the vault exits and Node respawns it.

## Serialization safety

Canonical TLV (`tag:u16 type:u8 len:u32 value`), identical in C++ and TypeScript:
fixed-width integers, tags in canonical order, BOOL exactly 0/1, strict UTF-8
without NUL, bounded depth (8), field count, string/bytes length and total size.
Unknown, duplicated or mistyped fields are rejected. Parsed messages own their
buffers (wiped on release). Fuzzing and truncation-at-every-byte tests run in
both languages.

## Authorization (AccessPolicy)

* Patients act only on their own record.
* Providers act only through an active, unexpired, unrevoked grant, and only
  within its scopes. Scopes also decide which ECS components are *materialized*
  for an analysis — a system cannot compute over data the viewer can't see.
* Providers must state a purpose of use (treatment / payment / operations);
  prescribing must be for treatment.
* Prescribing and erasing require a passkey sign-in within the last 5 minutes
  (step-up); prescribing also requires a verified prescriber.
* A provider without a grant gets the same answer for a real and a made-up
  patient (no existence oracle).
* Consent invites are one-time Ed25519-signed capabilities with a 15-minute
  default lifetime; redemption is recorded before the grant is created.

## Analytics (entity-component-system)

Medications are entities; `Schedule`, `Supply`, `SelfReport`, `Timing`,
`FillHistory` are components; systems run in a fixed pipeline:

| System | Output | Notes |
|---|---|---|
| Supply | `RefillForecast` | exact integer mirror of the app's `refill.ts`, parity-tested, on the patient's own calendar (`LocalDay`) |
| Adherence | `Adherence` (PDC) | proportion of days covered, PQA-style carry-over, 180-day window, ≥ 2 fills |
| Risk | `Risk`, `PatientRisk` | out/soon, PDC < 80 %, missed doses, late doses (min. sample sizes) |
| MedSync | `SyncPlan` | aligns refills due within 30 days to one pickup day with short fills |
| Worklist | `Worklist` resource | new Rx → overdue → due → high risk → low PDC → med sync |

## Threat model

| Threat | Mitigation |
|---|---|
| Stolen database / backup | Encrypted at rest; per-patient keys; key file kept off the data volume |
| Tampering with records on disk | AEAD with bound AD; version monotonicity; directory records verified at startup |
| Tampering with the audit trail | Sealed, hash-chained entries; on-demand re-verification |
| Malicious or buggy Node ⇄ vault traffic | MAC'd, sequenced, time-bounded frames; strict codec; fail closed |
| Over-sharing | Scoped grants, minimum-necessary materialization, patient preview |
| Unauthorized provider access | Grant check per request; revocation immediate; denials audited |
| Invite interception / reuse | Signed, one-time, short-lived; role-bound |
| Prescription forgery | Ed25519 signature by the prescriber's vault-held key, verified on every read |
| Replay of API calls | Nonce + timestamp + per-user nonce cache on mutating requests |
| Account takeover for high-risk actions | Passkey step-up within 5 minutes |
| Right to be forgotten | Crypto-shredding with crash-safe completion |

**Residual risks (known, on the roadmap):**

1. **Node is trusted for identity.** A compromised API server could act as any
   user. Next step: the vault verifies session signatures itself.
2. **Rollback by deletion.** Someone with write access to the data directory can
   remove the newest records undetectably without an external anchor (e.g. a TPM
   monotonic counter or remote attestation of the log head).
3. **Host memory.** Keys are wiped after use where practical, but a root-level
   attacker on the host can read process memory. Production: HSM/KMS-held KEK.
   The WebAssembly build also lacks the native build's Linux core-dump/ptrace
   hardening, and its constant-time crypto runs through V8's JIT (branch-free
   code stays branch-free, but that is not a formal guarantee).
4. **Crypto validation.** Monocypher is audited but not FIPS 140-3 validated, and
   XChaCha20-Poly1305 is not a FIPS-approved AEAD. HHS breach safe harbor refers
   to NIST guidance; production should move to AES-256-GCM via a validated module
   (the on-disk and wire formats carry version bytes for exactly this).
5. **Single node.** No replication yet; backups must copy `vault.db`, `audit.log`
   and escrow the key separately.
6. **Web session storage.** Bearer tokens in web storage are exposed to XSS;
   move to httpOnly cookies before production.

## Verification

| Suite | Command | Count |
|---|---|---|
| Vault (C++ as WebAssembly) | `node native/vault/build.mjs test` (`STRICT=1` for `-Werror`; `test-native` for native) | 47 |
| API server | `cd server && npm test` (includes the real vault process) | 17 |
| App | `npx jest` | 182 |
