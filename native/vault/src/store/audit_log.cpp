#include "store/audit_log.hpp"

namespace dosely::store {

namespace tag = proto::tag;

namespace {

constexpr std::string_view kMagic = "DSAL";

Bytes freshHeader() {
  Bytes h(kFileHeaderSize, 0);
  std::copy(kMagic.begin(), kMagic.end(), h.begin());
  h[4] = 1;  // format version
  return h;
}

/** Binds each sealed entry to its position in the log. */
Bytes sealAd(uint64_t seq) {
  const std::string ad = "dosely/audit/" + std::to_string(seq);
  return Bytes(ad.begin(), ad.end());
}

}  // namespace

codec::Writer AuditEntry::encode() const {
  codec::Writer w;
  w.u64(tag::Audit::Seq, seq)
      .u64(tag::Audit::AtMs, static_cast<uint64_t>(atMs))
      .str(tag::Audit::ActorId, actorId)
      .u64(tag::Audit::ActorRole, actorRole)
      .u64(tag::Audit::Command, command);
  if (!patientId.empty()) w.str(tag::Audit::PatientId, patientId);
  w.u64(tag::Audit::Purpose, purpose).u64(tag::Audit::Outcome, outcome);
  if (!detail.empty()) w.str(tag::Audit::Detail, detail);
  return w;
}

Result<AuditEntry> AuditEntry::decode(const codec::Message& m) {
  AuditEntry e;
  DV_ASSIGN(e.seq, m.u64(tag::Audit::Seq));
  DV_ASSIGN(uint64_t at, m.u64(tag::Audit::AtMs));
  e.atMs = static_cast<int64_t>(at);
  DV_ASSIGN(e.actorId, m.str(tag::Audit::ActorId));
  DV_ASSIGN(uint64_t role, m.u64(tag::Audit::ActorRole));
  DV_ASSIGN(uint64_t command, m.u64(tag::Audit::Command));
  DV_ASSIGN(e.patientId, m.strOr(tag::Audit::PatientId, ""));
  DV_ASSIGN(uint64_t purpose, m.u64(tag::Audit::Purpose));
  DV_ASSIGN(uint64_t outcome, m.u64(tag::Audit::Outcome));
  DV_ASSIGN(e.detail, m.strOr(tag::Audit::Detail, ""));
  e.actorRole = static_cast<uint32_t>(role);
  e.command = static_cast<uint32_t>(command);
  e.purpose = static_cast<uint32_t>(purpose);
  e.outcome = static_cast<uint32_t>(outcome);
  return e;
}

std::array<uint8_t, 32> AuditLog::genesis() const {
  return crypto::mac32(keys_.auditMacKey().view(), view(std::string_view("dosely/audit/genesis")));
}

std::array<uint8_t, 32> AuditLog::link(const std::array<uint8_t, 32>& prev, uint64_t seq, ByteView sealed) const {
  Bytes msg(prev.begin(), prev.end());
  appendBe(msg, seq, 8);
  dosely::append(msg, sealed);
  return crypto::mac32(keys_.auditMacKey().view(), view(msg));
}

AuditIntegrity AuditLog::replay(const std::vector<Bytes>& records, std::vector<AuditEntry>* out,
                                std::array<uint8_t, 32>& lastChain, uint64_t& lastSeq) const {
  AuditIntegrity result;
  auto chain = genesis();
  uint64_t expectedSeq = 1;
  auto markBroken = [&](uint64_t seq) {
    if (result.intact) {
      result.intact = false;
      result.brokenAtSeq = seq;
    }
  };

  for (const auto& raw : records) {
    ++result.entries;
    auto m = codec::Message::parse(view(raw));
    if (!m) {
      markBroken(expectedSeq);
      ++expectedSeq;
      continue;
    }
    auto seq = m->u64(tag::AuditRec::Seq);
    auto sealed = m->bytes(tag::AuditRec::Sealed);
    auto stored = m->bytes(tag::AuditRec::Chain);
    if (!seq || !sealed || !stored || stored->size() != 32) {
      markBroken(expectedSeq);
      ++expectedSeq;
      continue;
    }
    const auto expected = link(chain, *seq, view(*sealed));
    if (*seq != expectedSeq || !crypto::equalConstantTime({expected.data(), 32}, view(*stored))) markBroken(*seq);
    // Continue from the stored link so one bad entry doesn't hide later ones.
    std::copy(stored->begin(), stored->end(), chain.begin());
    expectedSeq = *seq + 1;

    if (out) {
      auto plain = crypto::open(keys_.auditSealKey(), view(sealAd(*seq)), view(*sealed));
      auto parsed = plain ? codec::Message::parse(plain->view()) : Result<codec::Message>(plain.status());
      auto entry = parsed ? AuditEntry::decode(*parsed) : Result<AuditEntry>(parsed.status());
      if (entry && entry->seq == *seq) {
        out->push_back(std::move(entry).value());
      } else {
        markBroken(*seq);
      }
    }
  }
  lastChain = chain;
  lastSeq = expectedSeq - 1;
  return result;
}

Result<std::unique_ptr<AuditLog>> AuditLog::open(const std::filesystem::path& path, const KeyRing& keys) {
  std::unique_ptr<AuditLog> log(new AuditLog(keys));
  const Bytes header = freshHeader();
  DV_ASSIGN(log->file_, AppendFile::open(path, kMagic, view(header)));
  if (log->file_->header()[4] != 1) return fail(Err::UNSUPPORTED, "unsupported audit log version");
  log->integrity_ = log->replay(log->file_->takeRecords(), &log->entries_, log->lastChain_, log->lastSeq_);
  return log;
}

Status AuditLog::append(AuditEntry entry) {
  entry.seq = lastSeq_ + 1;
  DV_ASSIGN(Bytes plain, entry.encode().finish());
  const Bytes sealed = crypto::seal(keys_.auditSealKey(), view(sealAd(entry.seq)), view(plain));
  crypto_wipe(plain.data(), plain.size());
  const auto chain = link(lastChain_, entry.seq, view(sealed));

  codec::Writer rec;
  rec.u64(tag::AuditRec::Seq, entry.seq).bytes(tag::AuditRec::Sealed, view(sealed)).bytes(tag::AuditRec::Chain, {chain.data(), chain.size()});
  DV_ASSIGN(Bytes encoded, rec.finish());
  DV_TRY(file_->append(view(encoded)));

  lastChain_ = chain;
  lastSeq_ = entry.seq;
  ++integrity_.entries;
  entries_.push_back(std::move(entry));
  return Status::ok();
}

AuditIntegrity AuditLog::verifyOnDisk() const {
  auto records = file_->reread();
  if (!records) return {false, 1, 0};
  std::array<uint8_t, 32> chain{};
  uint64_t seq = 0;
  auto result = replay(*records, nullptr, chain, seq);
  // Truncation after startup: fewer entries on disk than we have appended.
  if (result.intact && seq != lastSeq_) {
    result.intact = false;
    result.brokenAtSeq = seq + 1;
  }
  return result;
}

}  // namespace dosely::store
