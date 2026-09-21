#pragma once
// Encrypted, versioned record store — the patient database on disk.
//
// Each record is (type, id, version, sealed). The seal's associated data is the
// canonical encoding of (type, id, version), so a ciphertext can't be moved to
// another record, another patient, or an older version without failing
// authentication. Versions must strictly increase per record; the latest wins.
//
// Records stay sealed in memory. Callers decrypt one record at a time with the
// right key, only while serving a verified command.

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "core/result.hpp"
#include "crypto/crypto.hpp"
#include "store/append_file.hpp"
#include "store/keyring.hpp"

namespace dosely::store {

using proto::RecordType;

class RecordStore {
 public:
  /** Open (or create) the database, deriving and checking the key hierarchy. */
  static Result<std::unique_ptr<RecordStore>> open(const std::filesystem::path& path, const MasterKey& master);

  const KeyRing& keys() const { return *keys_; }

  Status put(RecordType type, std::string_view id, const crypto::Key32& key, ByteView plaintext);
  /** NOT_FOUND when absent; INTEGRITY when the ciphertext fails authentication. */
  Result<crypto::SecureBytes> get(RecordType type, std::string_view id, const crypto::Key32& key) const;
  bool contains(RecordType type, std::string_view id) const;
  /** Ids of one type, sorted, optionally restricted to a prefix. */
  std::vector<std::string> ids(RecordType type, std::string_view prefix = {}) const;
  size_t count(RecordType type) const;

  /** Rewrite the file keeping only records where `keep` is true. Dropped
   * ciphertext (including wrapped keys) no longer exists in the live file. */
  Status compact(const std::function<bool(RecordType, const std::string&)>& keep);

  bool recoveredTornWrite() const { return file_->truncatedTail(); }

 private:
  struct Key {
    uint32_t type;
    std::string id;
    auto operator<=>(const Key&) const = default;
  };
  struct Entry {
    uint64_t version;
    Bytes sealed;
  };

  RecordStore() = default;
  Status load(std::vector<Bytes> records);
  static Bytes associatedData(uint32_t type, std::string_view id, uint64_t version);
  static Result<Bytes> encode(uint32_t type, std::string_view id, const Entry& e);

  std::unique_ptr<AppendFile> file_;
  std::unique_ptr<KeyRing> keys_;
  std::map<Key, Entry> index_;
};

/** Record ids that belong to one patient are "<patientId>/<localId>". */
std::string scopedId(std::string_view patientId, std::string_view localId);

}  // namespace dosely::store
