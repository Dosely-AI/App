#include "store/record_store.hpp"

#include "codec/codec.hpp"

namespace dosely::store {

namespace tag = proto::tag;

namespace {

constexpr std::string_view kMagic = "DSDB";
constexpr uint8_t kFormatVersion = 1;
constexpr size_t kMaxIdLength = 200;

// Header: magic(4) version(1) kdfMode(1) reserved(2) salt(16) keyCheck(32) argonKiB(4) argonPasses(4)
struct Header {
  KdfMode mode;
  Bytes salt;
  Bytes keyCheck;
  crypto::Argon2Params params;
};

Bytes encodeHeader(const Header& h) {
  Bytes out;
  out.reserve(kFileHeaderSize);
  out.insert(out.end(), kMagic.begin(), kMagic.end());
  out.push_back(kFormatVersion);
  out.push_back(static_cast<uint8_t>(h.mode));
  appendBe(out, 0, 2);
  append(out, view(h.salt));
  append(out, view(h.keyCheck));
  appendBe(out, h.params.memoryKiB, 4);
  appendBe(out, h.params.passes, 4);
  return out;
}

Result<Header> decodeHeader(const Bytes& b) {
  if (b.size() != kFileHeaderSize) return fail(Err::INTEGRITY, "bad database header");
  if (b[4] != kFormatVersion) return fail(Err::UNSUPPORTED, "unsupported database format version");
  if (b[5] != static_cast<uint8_t>(KdfMode::KeyFile) && b[5] != static_cast<uint8_t>(KdfMode::Passphrase)) {
    return fail(Err::INTEGRITY, "bad key-derivation mode in header");
  }
  Header h;
  h.mode = static_cast<KdfMode>(b[5]);
  h.salt.assign(b.begin() + 8, b.begin() + 24);
  h.keyCheck.assign(b.begin() + 24, b.begin() + 56);
  h.params.memoryKiB = static_cast<uint32_t>(readBe(b.data() + 56, 4));
  h.params.passes = static_cast<uint32_t>(readBe(b.data() + 60, 4));
  return h;
}

bool validRecordType(uint64_t t) {
  return t >= static_cast<uint64_t>(RecordType::PATIENT_KEY) && t <= static_cast<uint64_t>(RecordType::TOMBSTONE);
}

}  // namespace

std::string scopedId(std::string_view patientId, std::string_view localId) {
  std::string id(patientId);
  id.push_back('/');
  id.append(localId);
  return id;
}

Result<std::unique_ptr<RecordStore>> RecordStore::open(const std::filesystem::path& path, const MasterKey& master) {
  // A fresh database gets a random salt; its key check is filled in below.
  Header fresh{master.mode(), Bytes(16), Bytes(32, 0), master.params()};
  crypto::randomBytes(fresh.salt.data(), fresh.salt.size());

  std::error_code ec;
  const bool existed = std::filesystem::exists(path, ec);
  Bytes freshHeader;
  if (!existed) {
    DV_ASSIGN(auto kek, master.deriveKek(view(fresh.salt), fresh.params));
    KeyRing ring(kek);
    fresh.keyCheck.assign(ring.keyCheck().begin(), ring.keyCheck().end());
    freshHeader = encodeHeader(fresh);
  }

  std::unique_ptr<RecordStore> store(new RecordStore());
  DV_ASSIGN(store->file_, AppendFile::open(path, kMagic, view(freshHeader)));
  DV_ASSIGN(Header header, decodeHeader(store->file_->header()));
  if (header.mode != master.mode()) {
    return fail(Err::UNAUTHORIZED, "database was created with a different key type (key file vs passphrase)");
  }
  DV_ASSIGN(auto kek, master.deriveKek(view(header.salt), header.params));
  store->keys_ = std::make_unique<KeyRing>(kek);
  const auto& check = store->keys_->keyCheck();
  if (!crypto::equalConstantTime({check.data(), check.size()}, view(header.keyCheck))) {
    return fail(Err::UNAUTHORIZED, "wrong vault key for this database");
  }
  DV_TRY(store->load(store->file_->takeRecords()));
  return store;
}

Bytes RecordStore::associatedData(uint32_t type, std::string_view id, uint64_t version) {
  codec::Writer w;
  w.u64(tag::Rec::Type, type).str(tag::Rec::Id, id).u64(tag::Rec::Version, version);
  return std::move(w.finish()).value();  // ids are validated before reaching here
}

Result<Bytes> RecordStore::encode(uint32_t type, std::string_view id, const Entry& e) {
  codec::Writer w;
  w.u64(tag::Rec::Type, type).str(tag::Rec::Id, id).u64(tag::Rec::Version, e.version).bytes(tag::Rec::Sealed, view(e.sealed));
  return w.finish();
}

Status RecordStore::load(std::vector<Bytes> records) {
  for (const auto& raw : records) {
    DV_ASSIGN(auto m, codec::Message::parse(view(raw)));
    DV_TRY(m.expectOnly({tag::Rec::Type, tag::Rec::Id, tag::Rec::Version, tag::Rec::Sealed}));
    DV_ASSIGN(uint64_t type, m.u64(tag::Rec::Type));
    DV_ASSIGN(std::string id, m.str(tag::Rec::Id));
    DV_ASSIGN(uint64_t version, m.u64(tag::Rec::Version));
    DV_ASSIGN(Bytes sealed, m.bytes(tag::Rec::Sealed));
    if (!validRecordType(type) || id.empty() || id.size() > kMaxIdLength || version == 0) {
      return fail(Err::INTEGRITY, "corrupt record in database");
    }
    Key key{static_cast<uint32_t>(type), std::move(id)};
    auto it = index_.find(key);
    if (it != index_.end() && version <= it->second.version) {
      return fail(Err::INTEGRITY, "record version went backwards (possible replay)");
    }
    index_[std::move(key)] = Entry{version, std::move(sealed)};
  }
  return Status::ok();
}

Status RecordStore::put(RecordType type, std::string_view id, const crypto::Key32& key, ByteView plaintext) {
  if (id.empty() || id.size() > kMaxIdLength || !codec::isValidText(id)) return fail(Err::BAD_REQUEST, "invalid record id");
  if (plaintext.size() + crypto::kSealOverhead > proto::Codec::MAX_BYTES) return fail(Err::LIMIT, "record too large");
  const auto t = static_cast<uint32_t>(type);
  Key k{t, std::string(id)};
  auto it = index_.find(k);
  Entry e{it == index_.end() ? 1 : it->second.version + 1, {}};
  e.sealed = crypto::seal(key, view(associatedData(t, id, e.version)), plaintext);
  DV_ASSIGN(Bytes encoded, encode(t, id, e));
  DV_TRY(file_->append(view(encoded)));  // durable before it becomes visible
  index_[std::move(k)] = std::move(e);
  return Status::ok();
}

Result<crypto::SecureBytes> RecordStore::get(RecordType type, std::string_view id, const crypto::Key32& key) const {
  const auto t = static_cast<uint32_t>(type);
  auto it = index_.find(Key{t, std::string(id)});
  if (it == index_.end()) return fail(Err::NOT_FOUND, "record not found");
  return crypto::open(key, view(associatedData(t, id, it->second.version)), view(it->second.sealed));
}

bool RecordStore::contains(RecordType type, std::string_view id) const {
  return index_.count(Key{static_cast<uint32_t>(type), std::string(id)}) > 0;
}

std::vector<std::string> RecordStore::ids(RecordType type, std::string_view prefix) const {
  const auto t = static_cast<uint32_t>(type);
  std::vector<std::string> out;
  for (auto it = index_.lower_bound(Key{t, std::string(prefix)}); it != index_.end() && it->first.type == t; ++it) {
    if (it->first.id.compare(0, prefix.size(), prefix) != 0) break;
    out.push_back(it->first.id);
  }
  return out;
}

size_t RecordStore::count(RecordType type) const { return ids(type).size(); }

Status RecordStore::compact(const std::function<bool(RecordType, const std::string&)>& keep) {
  std::vector<Bytes> kept;
  std::vector<Key> dropped;
  for (const auto& [k, e] : index_) {
    if (keep(static_cast<RecordType>(k.type), k.id)) {
      DV_ASSIGN(Bytes encoded, encode(k.type, k.id, e));
      kept.push_back(std::move(encoded));
    } else {
      dropped.push_back(k);
    }
  }
  const Bytes header = file_->header();  // copy: replace() reassigns the header
  DV_TRY(file_->replace(view(header), kept));
  for (const auto& k : dropped) index_.erase(k);
  return Status::ok();
}

}  // namespace dosely::store
