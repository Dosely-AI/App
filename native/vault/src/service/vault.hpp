#pragma once
// The Vault: the patient database and everything that guards it.
//
// Two tiers of data:
//   * Directory (providers, consent grants, Rx routing/status, spent invites):
//     sealed with the system key, decrypted once at startup — any failure
//     aborts startup (fail closed). No clinical content lives here.
//   * Patient data (medication snapshot, prescription bodies, fills): sealed
//     under each patient's own data key and opened one record at a time, only
//     while serving a command that has already passed the access policy.

#include <filesystem>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "core/clock.hpp"
#include "domain/model.hpp"
#include "store/audit_log.hpp"
#include "store/dir_lock.hpp"
#include "store/record_store.hpp"

namespace dosely::service {

struct VaultOptions {
  std::filesystem::path dataDir;
  /** Development only: mark providers verified on registration. Production
   * requires out-of-band identity proofing and license checks. */
  bool devAutoVerify = false;
};

class Vault {
 public:
  static Result<std::unique_ptr<Vault>> open(const VaultOptions& options, const store::MasterKey& master,
                                             const Clock& clock);

  const Clock& clock() const { return clock_; }
  const VaultOptions& options() const { return options_; }
  const store::KeyRing& keys() const { return store_->keys(); }
  store::AuditLog& audit() { return *audit_; }
  const store::AuditLog& audit() const { return *audit_; }

  // --- Directory ------------------------------------------------------------------
  const domain::Provider* provider(std::string_view id) const;
  const std::map<std::string, domain::Provider, std::less<>>& providers() const { return providers_; }
  Status saveProvider(const domain::Provider& p);
  Status saveProviderSigner(std::string_view providerId, const crypto::SigningKey& key);
  Result<crypto::SigningKey> providerSigner(std::string_view providerId) const;

  const domain::Grant* grant(std::string_view id) const;
  const std::map<std::string, domain::Grant, std::less<>>& grants() const { return grants_; }
  /** The patient's active grant to this provider, if any. */
  const domain::Grant* activeGrant(std::string_view patientId, std::string_view providerId) const;
  Status saveGrant(const domain::Grant& g);

  const domain::RxMeta* rxMeta(std::string_view id) const;
  const std::map<std::string, domain::RxMeta, std::less<>>& prescriptions() const { return rxMeta_; }
  Status saveRxMeta(const domain::RxMeta& r);

  bool inviteSpent(ByteView nonce) const;
  Status spendInvite(ByteView nonce, int64_t expiresAtMs);

  // --- Patient data (decrypt on verified command) -----------------------------------
  bool hasPatient(std::string_view patientId) const;
  size_t patientCount() const;
  Result<std::optional<domain::Snapshot>> loadSnapshot(std::string_view patientId);
  Status saveSnapshot(const domain::Snapshot& s);
  Result<domain::Prescription> loadPrescription(std::string_view patientId, std::string_view rxId);
  Status savePrescription(const domain::Prescription& p);
  Result<std::vector<domain::Fill>> loadFills(std::string_view patientId);
  Status saveFill(const domain::Fill& f);

  /** Crypto-shred: revoke access, destroy the patient's data key and every
   * record sealed under it. Crash-safe (resumed from a tombstone at startup). */
  Status erasePatient(std::string_view patientId);

  uint64_t integrityErrors() const { return integrityErrors_; }
  void noteIntegrityError() { ++integrityErrors_; }

 private:
  Vault(VaultOptions options, const Clock& clock) : options_(std::move(options)), clock_(clock) {}
  Status loadDirectory();
  Status finishPendingErasures();
  /** The patient's data key; created on first use when `create` is set. */
  Result<crypto::Key32> patientKey(std::string_view patientId, bool create);
  Status putSystem(proto::RecordType type, std::string_view id, const codec::Writer& w);
  Status putPatient(std::string_view patientId, proto::RecordType type, std::string_view id, const codec::Writer& w);

  VaultOptions options_;
  const Clock& clock_;
  std::unique_ptr<store::DirLock> lock_;  // declared before the store, so released after it
  std::unique_ptr<store::RecordStore> store_;
  std::unique_ptr<store::AuditLog> audit_;
  std::map<std::string, domain::Provider, std::less<>> providers_;
  std::map<std::string, domain::Grant, std::less<>> grants_;
  std::map<std::string, domain::RxMeta, std::less<>> rxMeta_;
  std::map<std::string, int64_t, std::less<>> spentInvites_;  // nonce hex -> expiry
  uint64_t integrityErrors_ = 0;
};

}  // namespace dosely::service
