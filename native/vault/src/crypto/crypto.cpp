#include "crypto/crypto.hpp"

#include <vector>

#include "monocypher-ed25519.h"
#include "monocypher.h"

namespace dosely::crypto {

Bytes seal(const Key32& key, ByteView ad, ByteView plaintext) {
  Bytes out(kSealOverhead + plaintext.size());
  uint8_t* nonce = out.data();
  uint8_t* tag = out.data() + kNonceSize;
  uint8_t* cipher = out.data() + kSealOverhead;
  randomBytes(nonce, kNonceSize);
  crypto_aead_lock(cipher, tag, key.data(), nonce, ad.data(), ad.size(), plaintext.data(), plaintext.size());
  return out;
}

Result<SecureBytes> open(const Key32& key, ByteView ad, ByteView sealed) {
  if (sealed.size() < kSealOverhead) return fail(Err::INTEGRITY, "sealed data too short");
  const uint8_t* nonce = sealed.data();
  const uint8_t* tag = sealed.data() + kNonceSize;
  const uint8_t* cipher = sealed.data() + kSealOverhead;
  const size_t n = sealed.size() - kSealOverhead;
  SecureBytes plain{Bytes(n)};
  if (crypto_aead_unlock(plain.raw().data(), tag, key.data(), nonce, ad.data(), ad.size(), cipher, n) != 0) {
    return fail(Err::INTEGRITY, "authentication failed (tampered or wrong key)");
  }
  return plain;
}

SigningKey SigningKey::generate() {
  auto seed = Secret<32>::random();
  auto key = fromSeed(seed.view());
  return std::move(key).value();  // a 32-byte seed always yields a key
}

Result<SigningKey> SigningKey::fromSeed(ByteView seed32) {
  SigningKey k;
  if (!Secret<32>::from(seed32, k.seed_)) return fail(Err::BAD_REQUEST, "seed must be 32 bytes");
  // Monocypher wipes the seed argument, so hand it a scratch copy.
  auto scratch = k.seed_.clone();
  crypto_ed25519_key_pair(k.secret_.data(), k.public_.data(), scratch.data());
  return k;
}

Signature SigningKey::sign(ByteView message) const {
  Signature sig{};
  crypto_ed25519_sign(sig.data(), secret_.data(), message.data(), message.size());
  return sig;
}

bool verify(ByteView publicKey, ByteView message, ByteView signature) {
  if (publicKey.size() != kPublicKeySize || signature.size() != kSignatureSize) return false;
  return crypto_ed25519_check(signature.data(), publicKey.data(), message.data(), message.size()) == 0;
}

std::array<uint8_t, 64> hmacSha512(ByteView key, ByteView message) {
  std::array<uint8_t, 64> out{};
  crypto_sha512_hmac(out.data(), key.data(), key.size(), message.data(), message.size());
  return out;
}

std::array<uint8_t, 32> mac32(ByteView key, ByteView message) {
  auto full = hmacSha512(key, message);
  std::array<uint8_t, 32> out{};
  for (size_t i = 0; i < out.size(); ++i) out[i] = full[i];
  crypto_wipe(full.data(), full.size());
  return out;
}

bool equalConstantTime(ByteView a, ByteView b) {
  if (a.size() != b.size()) return false;
  if (a.size() == 16) return crypto_verify16(a.data(), b.data()) == 0;
  if (a.size() == 32) return crypto_verify32(a.data(), b.data()) == 0;
  if (a.size() == 64) return crypto_verify64(a.data(), b.data()) == 0;
  // Generic path: accumulate differences without data-dependent branches.
  volatile uint8_t diff = 0;
  for (size_t i = 0; i < a.size(); ++i) diff = static_cast<uint8_t>(diff | (a[i] ^ b[i]));
  return diff == 0;
}

Key32 hkdf(ByteView inputKey, std::string_view info, ByteView salt) {
  Key32 out;
  const ByteView infoBytes = view(info);
  crypto_sha512_hkdf(out.data(), Key32::size(), inputKey.data(), inputKey.size(), salt.data(), salt.size(),
                     infoBytes.data(), infoBytes.size());
  return out;
}

Result<Key32> deriveFromPassphrase(std::string_view passphrase, ByteView salt, const Argon2Params& params) {
  if (salt.size() != 16) return fail(Err::BAD_REQUEST, "salt must be 16 bytes");
  if (passphrase.size() < 12) return fail(Err::BAD_REQUEST, "passphrase must be at least 12 characters");
  if (params.memoryKiB < 8 || params.passes < 1) return fail(Err::BAD_REQUEST, "argon2 parameters too weak");

  crypto_argon2_config config{};
  config.algorithm = CRYPTO_ARGON2_ID;
  config.nb_blocks = params.memoryKiB;  // one block = 1 KiB
  config.nb_passes = params.passes;
  config.nb_lanes = 1;

  crypto_argon2_inputs inputs{};
  inputs.pass = reinterpret_cast<const uint8_t*>(passphrase.data());
  inputs.pass_size = static_cast<uint32_t>(passphrase.size());
  inputs.salt = salt.data();
  inputs.salt_size = static_cast<uint32_t>(salt.size());

  std::vector<uint8_t> workArea(static_cast<size_t>(params.memoryKiB) * 1024);
  Key32 out;
  crypto_argon2(out.data(), static_cast<uint32_t>(Key32::size()), workArea.data(), config, inputs,
                crypto_argon2_no_extras);
  crypto_wipe(workArea.data(), workArea.size());
  return out;
}

}  // namespace dosely::crypto
