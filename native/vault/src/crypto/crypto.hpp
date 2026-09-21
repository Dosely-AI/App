#pragma once
// Cryptographic primitives used by the vault. All are thin, typed wrappers over
// Monocypher (audited, constant-time) — we compose primitives, we never invent
// them.
//
//   AEAD       XChaCha20-Poly1305. 192-bit random nonces are safe to generate
//              per message, so there is no nonce counter to get wrong.
//   Signing    Ed25519 (RFC 8032), for prescriptions and consent capabilities.
//   MAC        HMAC-SHA-512 (RFC 2104/4231), truncated to 256 bits on the wire.
//   KDF        HKDF-SHA-512 for sub-keys; Argon2id for passphrases.

#include <array>
#include <cstdint>
#include <string_view>

#include "core/bytes.hpp"
#include "core/result.hpp"
#include "crypto/secure.hpp"

namespace dosely::crypto {

inline constexpr size_t kKeySize = 32;
inline constexpr size_t kNonceSize = 24;
inline constexpr size_t kTagSize = 16;
inline constexpr size_t kSealOverhead = kNonceSize + kTagSize;
inline constexpr size_t kPublicKeySize = 32;
inline constexpr size_t kSignatureSize = 64;

using PublicKey = std::array<uint8_t, kPublicKeySize>;
using Signature = std::array<uint8_t, kSignatureSize>;

// --- AEAD --------------------------------------------------------------------

/** Encrypt and authenticate. Output layout: nonce(24) || tag(16) || ciphertext.
 * `ad` is authenticated but not encrypted — bind every ciphertext to its
 * context (record type/id/version) so it can't be replayed elsewhere. */
Bytes seal(const Key32& key, ByteView ad, ByteView plaintext);

/** Verify and decrypt. Fails with INTEGRITY on any tampering (ciphertext, tag,
 * nonce, or a different `ad`). */
Result<SecureBytes> open(const Key32& key, ByteView ad, ByteView sealed);

// --- Ed25519 ------------------------------------------------------------------

class SigningKey {
 public:
  static SigningKey generate();
  /** Rebuild from a 32-byte seed (the only secret that needs storing). */
  static Result<SigningKey> fromSeed(ByteView seed32);

  const PublicKey& publicKey() const { return public_; }
  /** The 32-byte seed, for wrapping at rest. */
  ByteView seed() const { return seed_.view(); }
  Signature sign(ByteView message) const;

 private:
  Secret<32> seed_;
  Secret<64> secret_;
  PublicKey public_{};
};

/** Constant-time signature check; false for any malformed input. */
bool verify(ByteView publicKey, ByteView message, ByteView signature);

// --- MAC / comparison -----------------------------------------------------------

std::array<uint8_t, 64> hmacSha512(ByteView key, ByteView message);
/** HMAC-SHA-512 truncated to 32 bytes (what frames and the audit chain carry). */
std::array<uint8_t, 32> mac32(ByteView key, ByteView message);
/** Constant-time equality (length is not secret; content is). */
bool equalConstantTime(ByteView a, ByteView b);

// --- Key derivation ---------------------------------------------------------------

/** HKDF-SHA-512 -> 32-byte key, domain-separated by `info`. */
Key32 hkdf(ByteView inputKey, std::string_view info, ByteView salt = {});

struct Argon2Params {
  uint32_t memoryKiB = 64 * 1024;  // 64 MiB
  uint32_t passes = 3;
};

/** Argon2id(passphrase, salt) -> 32-byte key. Salt must be 16 bytes. */
Result<Key32> deriveFromPassphrase(std::string_view passphrase, ByteView salt, const Argon2Params& params);

}  // namespace dosely::crypto
