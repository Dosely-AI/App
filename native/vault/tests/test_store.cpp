// Storage: the encrypted record store and the audit log, attacked on disk.

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iterator>

#include "codec/codec.hpp"
#include "harness.hpp"
#include "store/audit_log.hpp"
#include "store/record_store.hpp"

using namespace dosely;
using namespace dosely::store;
namespace fs = std::filesystem;
namespace tag = proto::tag;

namespace {

fs::path freshDir(const std::string& name) {
  fs::path dir = fs::current_path() / name;
  fs::remove_all(dir);
  fs::create_directories(dir);
  return dir;
}

MasterKey keyFileMaster(const fs::path& dir, const char* name = "vault.key") {
  const fs::path p = dir / name;
  if (!fs::exists(p) && !MasterKey::createKeyFile(p).isOk()) std::abort();
  return MasterKey::fromKeyFile(p).value();
}

Bytes readFile(const fs::path& p) {
  std::ifstream in(p, std::ios::binary);
  return Bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

void writeFile(const fs::path& p, const Bytes& b) {
  std::ofstream out(p, std::ios::binary | std::ios::trunc);
  out.write(reinterpret_cast<const char*>(b.data()), static_cast<std::streamsize>(b.size()));
}

/** Split an append-file into header + records (test-side parser). */
std::vector<Bytes> recordsOf(const Bytes& file) {
  std::vector<Bytes> out;
  size_t pos = kFileHeaderSize;
  while (pos + 4 <= file.size()) {
    const size_t len = readBe(file.data() + pos, 4);
    out.emplace_back(file.begin() + static_cast<long>(pos + 4), file.begin() + static_cast<long>(pos + 4 + len));
    pos += 4 + len;
  }
  return out;
}

Bytes rebuild(const Bytes& file, const std::vector<Bytes>& records) {
  Bytes out(file.begin(), file.begin() + kFileHeaderSize);
  for (const auto& r : records) {
    appendBe(out, r.size(), 4);
    append(out, view(r));
  }
  return out;
}

std::string text(const crypto::SecureBytes& b) { return std::string(asString(b.view())); }

}  // namespace

TEST(store_roundtrip_and_reopen) {
  const auto dir = freshDir("store_roundtrip");
  auto master = keyFileMaster(dir);
  auto dek = crypto::Key32::random();
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE(store.isOk());
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "p1", dek, view(std::string_view("v1"))).isOk());
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "p1", dek, view(std::string_view("v2"))).isOk());
    REQUIRE((*store)->put(RecordType::FILL, scopedId("p1", "f1"), dek, view(std::string_view("fill"))).isOk());
    REQUIRE((*store)->put(RecordType::FILL, scopedId("p2", "f1"), dek, view(std::string_view("other"))).isOk());
  }
  auto store = RecordStore::open(dir / "vault.db", master);
  REQUIRE(store.isOk());
  auto latest = (*store)->get(RecordType::SNAPSHOT, "p1", dek);
  REQUIRE(latest.isOk());
  CHECK_EQ(text(*latest), std::string("v2"));
  CHECK_EQ((*store)->ids(RecordType::FILL, "p1/").size(), size_t{1});
  CHECK_EQ((*store)->ids(RecordType::FILL).size(), size_t{2});
  CHECK_ERR((*store)->get(RecordType::SNAPSHOT, "nobody", dek), Err::NOT_FOUND);
  auto wrongDek = crypto::Key32::random();
  CHECK_ERR((*store)->get(RecordType::SNAPSHOT, "p1", wrongDek), Err::INTEGRITY);
  CHECK_ERR((*store)->put(RecordType::SNAPSHOT, "", dek, view(std::string_view("x"))), Err::BAD_REQUEST);
}

TEST(store_rejects_wrong_master_key_and_mode) {
  const auto dir = freshDir("store_wrongkey");
  {
    auto master = keyFileMaster(dir);
    REQUIRE(RecordStore::open(dir / "vault.db", master).isOk());
  }
  auto other = keyFileMaster(dir, "other.key");
  CHECK_ERR(RecordStore::open(dir / "vault.db", other), Err::UNAUTHORIZED);
  auto pass = MasterKey::fromPassphrase("correct horse battery staple", {64, 1});
  REQUIRE(pass.isOk());
  CHECK_ERR(RecordStore::open(dir / "vault.db", *pass), Err::UNAUTHORIZED);
}

TEST(store_passphrase_mode) {
  const auto dir = freshDir("store_passphrase");
  auto dek = crypto::Key32::random();
  {
    auto m = MasterKey::fromPassphrase("correct horse battery staple", {64, 1});
    auto store = RecordStore::open(dir / "vault.db", *m);
    REQUIRE(store.isOk());
    REQUIRE((*store)->put(RecordType::GRANT, "g1", (*store)->keys().systemKey(), view(std::string_view("grant"))).isOk());
  }
  auto good = MasterKey::fromPassphrase("correct horse battery staple", {64, 1});
  auto store = RecordStore::open(dir / "vault.db", *good);
  REQUIRE(store.isOk());
  auto g = (*store)->get(RecordType::GRANT, "g1", (*store)->keys().systemKey());
  REQUIRE(g.isOk());
  CHECK_EQ(text(*g), std::string("grant"));
  auto bad = MasterKey::fromPassphrase("incorrect horse battery", {64, 1});
  CHECK_ERR(RecordStore::open(dir / "vault.db", *bad), Err::UNAUTHORIZED);
}

TEST(store_detects_ciphertext_tampering_on_disk) {
  const auto dir = freshDir("store_tamper");
  auto master = keyFileMaster(dir);
  auto dek = crypto::Key32::random();
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "p1", dek, view(std::string_view("sensitive"))).isOk());
  }
  Bytes file = readFile(dir / "vault.db");
  file[file.size() - 3] ^= 0x40;  // inside the sealed ciphertext
  writeFile(dir / "vault.db", file);
  auto store = RecordStore::open(dir / "vault.db", master);
  REQUIRE(store.isOk());  // structure is fine...
  CHECK_ERR((*store)->get(RecordType::SNAPSHOT, "p1", dek), Err::INTEGRITY);  // ...but it won't decrypt
}

TEST(store_ciphertext_cannot_be_moved_between_records) {
  const auto dir = freshDir("store_swap");
  auto master = keyFileMaster(dir);
  auto dek = crypto::Key32::random();
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "alice", dek, view(std::string_view("alice-data"))).isOk());
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "bob", dek, view(std::string_view("bob-data"))).isOk());
  }
  // Rewrite the file so Bob's record carries Alice's (valid) ciphertext.
  const Bytes file = readFile(dir / "vault.db");
  auto recs = recordsOf(file);
  REQUIRE(recs.size() == 2);
  auto alice = codec::Message::parse(view(recs[0]));
  auto bob = codec::Message::parse(view(recs[1]));
  REQUIRE(alice.isOk() && bob.isOk());
  codec::Writer forged;
  forged.u64(tag::Rec::Type, *bob->u64(tag::Rec::Type))
      .str(tag::Rec::Id, *bob->str(tag::Rec::Id))
      .u64(tag::Rec::Version, *bob->u64(tag::Rec::Version))
      .bytes(tag::Rec::Sealed, view(*alice->bytes(tag::Rec::Sealed)));
  recs[1] = *forged.finish();
  writeFile(dir / "vault.db", rebuild(file, recs));

  auto store = RecordStore::open(dir / "vault.db", master);
  REQUIRE(store.isOk());
  CHECK_ERR((*store)->get(RecordType::SNAPSHOT, "bob", dek), Err::INTEGRITY);
  CHECK((*store)->get(RecordType::SNAPSHOT, "alice", dek).isOk());
}

TEST(store_rejects_version_rollback) {
  const auto dir = freshDir("store_rollback");
  auto master = keyFileMaster(dir);
  auto dek = crypto::Key32::random();
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE((*store)->put(RecordType::GRANT, "g1", dek, view(std::string_view("active"))).isOk());
    REQUIRE((*store)->put(RecordType::GRANT, "g1", dek, view(std::string_view("revoked"))).isOk());
  }
  // Replay the old "active" version after the revocation.
  const Bytes file = readFile(dir / "vault.db");
  auto recs = recordsOf(file);
  recs.push_back(recs[0]);
  writeFile(dir / "vault.db", rebuild(file, recs));
  CHECK_ERR(RecordStore::open(dir / "vault.db", master), Err::INTEGRITY);
}

TEST(store_recovers_from_torn_write) {
  const auto dir = freshDir("store_torn");
  auto master = keyFileMaster(dir);
  auto dek = crypto::Key32::random();
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "p1", dek, view(std::string_view("safe"))).isOk());
  }
  Bytes file = readFile(dir / "vault.db");
  appendBe(file, 500, 4);  // a record header promising 500 bytes...
  file.push_back(0xAB);    // ...of which only one made it to disk
  writeFile(dir / "vault.db", file);
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE(store.isOk());
    CHECK((*store)->recoveredTornWrite());
    CHECK_EQ(text(*(*store)->get(RecordType::SNAPSHOT, "p1", dek)), std::string("safe"));
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "p1", dek, view(std::string_view("after"))).isOk());
  }
  auto store = RecordStore::open(dir / "vault.db", master);
  REQUIRE(store.isOk());
  CHECK(!(*store)->recoveredTornWrite());
  CHECK_EQ(text(*(*store)->get(RecordType::SNAPSHOT, "p1", dek)), std::string("after"));
}

TEST(store_compaction_removes_ciphertext_from_disk) {
  const auto dir = freshDir("store_compact");
  auto master = keyFileMaster(dir);
  auto dek = crypto::Key32::random();
  Bytes shredded;
  {
    auto store = RecordStore::open(dir / "vault.db", master);
    REQUIRE((*store)->put(RecordType::PATIENT_KEY, "p1", (*store)->keys().wrapKey(), dek.view()).isOk());
    REQUIRE((*store)->put(RecordType::FILL, scopedId("p1", "a"), dek, view(std::string_view("fill"))).isOk());
    REQUIRE((*store)->put(RecordType::PATIENT_KEY, "p2", (*store)->keys().wrapKey(), dek.view()).isOk());
    const auto recs = recordsOf(readFile(dir / "vault.db"));
    shredded = *codec::Message::parse(view(recs[0]))->bytes(tag::Rec::Sealed);

    REQUIRE((*store)->compact([](RecordType, const std::string& id) { return id != "p1" && id.rfind("p1/", 0) != 0; }).isOk());
    CHECK(!(*store)->contains(RecordType::PATIENT_KEY, "p1"));
    CHECK((*store)->ids(RecordType::FILL, "p1/").empty());
    REQUIRE((*store)->put(RecordType::SNAPSHOT, "p2", dek, view(std::string_view("still works"))).isOk());
  }
  const Bytes file = readFile(dir / "vault.db");
  CHECK(std::search(file.begin(), file.end(), shredded.begin(), shredded.end()) == file.end());
  auto store = RecordStore::open(dir / "vault.db", master);
  REQUIRE(store.isOk());
  CHECK((*store)->contains(RecordType::PATIENT_KEY, "p2"));
  CHECK((*store)->get(RecordType::SNAPSHOT, "p2", dek).isOk());
}

namespace {

AuditEntry entry(const char* actor, const char* patient, uint32_t outcome = 0) {
  AuditEntry e;
  e.atMs = 1'760'000'000'000;
  e.actorId = actor;
  e.actorRole = static_cast<uint32_t>(proto::Role::PHARMACY);
  e.command = static_cast<uint32_t>(proto::Cmd::PATIENT_SUMMARY);
  e.patientId = patient;
  e.purpose = static_cast<uint32_t>(proto::Purpose::TREATMENT);
  e.outcome = outcome;
  e.detail = "test";
  return e;
}

}  // namespace

TEST(audit_log_persists_and_verifies) {
  const auto dir = freshDir("audit_ok");
  auto master = keyFileMaster(dir);
  auto store = RecordStore::open(dir / "vault.db", master);
  {
    auto log = AuditLog::open(dir / "audit.log", (*store)->keys());
    REQUIRE(log.isOk());
    for (int i = 0; i < 5; ++i) REQUIRE((*log)->append(entry("pharm", "p1")).isOk());
  }
  auto log = AuditLog::open(dir / "audit.log", (*store)->keys());
  REQUIRE(log.isOk());
  CHECK((*log)->integrity().intact);
  CHECK_EQ((*log)->entries().size(), size_t{5});
  CHECK_EQ((*log)->entries()[4].seq, uint64_t{5});
  CHECK_EQ((*log)->entries()[2].patientId, std::string("p1"));
  REQUIRE((*log)->append(entry("pharm", "p2", static_cast<uint32_t>(Err::FORBIDDEN))).isOk());
  CHECK_EQ((*log)->entries().back().seq, uint64_t{6});
  CHECK((*log)->verifyOnDisk().intact);
}

TEST(audit_log_detects_edits_deletions_and_truncation) {
  const auto dir = freshDir("audit_tamper");
  auto master = keyFileMaster(dir);
  auto store = RecordStore::open(dir / "vault.db", master);
  {
    auto log = AuditLog::open(dir / "audit.log", (*store)->keys());
    for (int i = 0; i < 4; ++i) REQUIRE((*log)->append(entry("pharm", "p1")).isOk());
  }
  const Bytes original = readFile(dir / "audit.log");
  const auto recs = recordsOf(original);

  // Delete entry #2: the chain breaks there.
  auto without = recs;
  without.erase(without.begin() + 1);
  writeFile(dir / "audit.log", rebuild(original, without));
  {
    auto log = AuditLog::open(dir / "audit.log", (*store)->keys());
    REQUIRE(log.isOk());
    CHECK(!(*log)->integrity().intact);
    CHECK_EQ((*log)->integrity().brokenAtSeq, uint64_t{3});
  }

  // Flip one byte inside entry #3's sealed body.
  Bytes edited = original;
  size_t pos = kFileHeaderSize;
  for (int i = 0; i < 2; ++i) pos += 4 + readBe(edited.data() + pos, 4);
  edited[pos + 40] ^= 1;
  writeFile(dir / "audit.log", edited);
  {
    auto log = AuditLog::open(dir / "audit.log", (*store)->keys());
    REQUIRE(log.isOk());
    CHECK(!(*log)->integrity().intact);
    CHECK_EQ((*log)->integrity().brokenAtSeq, uint64_t{3});
  }

  // Truncation after startup is caught by an on-demand re-verification.
  writeFile(dir / "audit.log", original);
  auto log = AuditLog::open(dir / "audit.log", (*store)->keys());
  REQUIRE(log.isOk());
  CHECK((*log)->integrity().intact);
  writeFile(dir / "audit.log", rebuild(original, {recs[0], recs[1]}));
  CHECK(!(*log)->verifyOnDisk().intact);
}
