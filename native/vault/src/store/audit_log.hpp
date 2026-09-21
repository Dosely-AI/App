#pragma once
// Tamper-evident audit log: who did what, to whose record, for what purpose,
// and whether it was allowed. Denied attempts are logged too.
//
// Entries are sealed (confidential) and hash-chained (tamper-evident):
//   chain_0 = HMAC(k, "dosely/audit/genesis")
//   chain_i = HMAC(k, chain_{i-1} || seq_i || sealed_i)
// Editing, reordering or deleting an entry breaks every later link. A break is
// reported (and the log keeps working) rather than hidden.

#include <array>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "codec/codec.hpp"
#include "core/result.hpp"
#include "store/append_file.hpp"
#include "store/keyring.hpp"

namespace dosely::store {

struct AuditEntry {
  uint64_t seq = 0;
  int64_t atMs = 0;
  std::string actorId;
  uint32_t actorRole = 0;
  uint32_t command = 0;
  std::string patientId;
  uint32_t purpose = 0;
  uint32_t outcome = 0;  // proto::Err
  std::string detail;

  codec::Writer encode() const;
  static Result<AuditEntry> decode(const codec::Message& m);
};

struct AuditIntegrity {
  bool intact = true;
  uint64_t brokenAtSeq = 0;  // first bad entry when !intact
  uint64_t entries = 0;
};

class AuditLog {
 public:
  static Result<std::unique_ptr<AuditLog>> open(const std::filesystem::path& path, const KeyRing& keys);

  /** Assigns the next sequence number and appends durably. */
  Status append(AuditEntry entry);
  const std::vector<AuditEntry>& entries() const { return entries_; }
  /** Integrity as observed at load time and since. */
  const AuditIntegrity& integrity() const { return integrity_; }
  /** Re-read and re-verify the file on disk (detects tampering after startup). */
  AuditIntegrity verifyOnDisk() const;

 private:
  explicit AuditLog(const KeyRing& keys) : keys_(keys) {}
  /** Walk records, verifying the chain; optionally collect decrypted entries. */
  AuditIntegrity replay(const std::vector<Bytes>& records, std::vector<AuditEntry>* out,
                        std::array<uint8_t, 32>& lastChain, uint64_t& lastSeq) const;
  std::array<uint8_t, 32> link(const std::array<uint8_t, 32>& prev, uint64_t seq, ByteView sealed) const;
  std::array<uint8_t, 32> genesis() const;

  const KeyRing& keys_;
  std::unique_ptr<AppendFile> file_;
  std::vector<AuditEntry> entries_;
  AuditIntegrity integrity_;
  std::array<uint8_t, 32> lastChain_{};
  uint64_t lastSeq_ = 0;
};

}  // namespace dosely::store
