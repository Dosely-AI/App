#pragma once
// Key hierarchy (envelope encryption):
//
//   master secret (key file, or passphrase via Argon2id)
//     └─ KEK = per-database key, salted by the database header
//          ├─ wrap key      wraps per-patient data keys (DEKs) and provider signing seeds
//          ├─ system key    seals directory data: providers, grants, Rx status, spent invites
//          ├─ audit keys    seal + hash-chain the audit log
//          ├─ system signer Ed25519 key that signs consent invites
//          └─ key check     lets us refuse a wrong key up front instead of failing later
//
// Every patient's records are sealed under their own random DEK. Erasing a
// patient destroys the wrapped DEK, which makes all of their ciphertext
// unreadable at once ("crypto-shredding").

#include <array>
#include <filesystem>
#include <string>

#include "core/result.hpp"
#include "crypto/crypto.hpp"

namespace dosely::store {

enum class KdfMode : uint8_t { KeyFile = 1, Passphrase = 2 };

class MasterKey {
 public:
  ~MasterKey();
  MasterKey(MasterKey&&) noexcept = default;
  MasterKey& operator=(MasterKey&&) noexcept = default;

  /** Load a key file holding 64 hex characters (whitespace ignored). */
  static Result<MasterKey> fromKeyFile(const std::filesystem::path& path);
  static Result<MasterKey> fromPassphrase(std::string passphrase, crypto::Argon2Params params = {});
  /** Write a fresh random key file; refuses to overwrite an existing one. */
  static Status createKeyFile(const std::filesystem::path& path);

  KdfMode mode() const { return mode_; }
  const crypto::Argon2Params& params() const { return params_; }
  /** The KEK for a database with this salt (and, for passphrases, these Argon2 parameters). */
  Result<crypto::Key32> deriveKek(ByteView salt, const crypto::Argon2Params& params) const;

 private:
  MasterKey() = default;
  KdfMode mode_ = KdfMode::KeyFile;
  crypto::Key32 secret_;
  std::string passphrase_;
  crypto::Argon2Params params_;
};

class KeyRing {
 public:
  explicit KeyRing(const crypto::Key32& kek);

  const crypto::Key32& wrapKey() const { return wrap_; }
  const crypto::Key32& systemKey() const { return system_; }
  const crypto::Key32& auditSealKey() const { return auditSeal_; }
  const crypto::Key32& auditMacKey() const { return auditMac_; }
  const crypto::SigningKey& signer() const { return signer_; }
  const std::array<uint8_t, 32>& keyCheck() const { return keyCheck_; }

 private:
  crypto::Key32 wrap_;
  crypto::Key32 system_;
  crypto::Key32 auditSeal_;
  crypto::Key32 auditMac_;
  crypto::SigningKey signer_;
  std::array<uint8_t, 32> keyCheck_{};
};

}  // namespace dosely::store
