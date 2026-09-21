#include "service/vault.hpp"

namespace dosely::service {

using proto::RecordType;
using store::scopedId;

namespace {

Result<codec::Message> openMessage(const Result<crypto::SecureBytes>& plain) {
  if (!plain) return plain.status();
  return codec::Message::parse(plain->view());
}

}  // namespace

Result<std::unique_ptr<Vault>> Vault::open(const VaultOptions& options, const store::MasterKey& master,
                                           const Clock& clock) {
  std::error_code ec;
  std::filesystem::create_directories(options.dataDir, ec);
  if (ec) return fail(Err::INTERNAL, "cannot create data directory");
  std::unique_ptr<Vault> v(new Vault(options, clock));
  DV_ASSIGN(v->lock_, store::DirLock::acquire(options.dataDir));
  DV_ASSIGN(v->store_, store::RecordStore::open(options.dataDir / "vault.db", master));
  DV_ASSIGN(v->audit_, store::AuditLog::open(options.dataDir / "audit.log", v->store_->keys()));
  DV_TRY(v->loadDirectory());
  DV_TRY(v->finishPendingErasures());
  return v;
}

Status Vault::loadDirectory() {
  const auto& key = keys().systemKey();
  auto loadAll = [&](RecordType type, auto&& onRecord) -> Status {
    for (const auto& id : store_->ids(type)) {
      auto m = openMessage(store_->get(type, id, key));
      if (!m) return fail(Err::INTEGRITY, "directory record failed authentication; refusing to start");
      DV_TRY(onRecord(id, *m));
    }
    return Status::ok();
  };
  DV_TRY(loadAll(RecordType::PROVIDER, [&](const std::string& id, const codec::Message& m) -> Status {
    DV_ASSIGN(auto p, domain::Provider::decode(m));
    if (p.id != id) return fail(Err::INTEGRITY, "provider record id mismatch");
    providers_.emplace(id, std::move(p));
    return Status::ok();
  }));
  DV_TRY(loadAll(RecordType::GRANT, [&](const std::string& id, const codec::Message& m) -> Status {
    DV_ASSIGN(auto g, domain::Grant::decode(m));
    if (g.id != id) return fail(Err::INTEGRITY, "grant record id mismatch");
    grants_.emplace(id, std::move(g));
    return Status::ok();
  }));
  DV_TRY(loadAll(RecordType::RX_META, [&](const std::string& id, const codec::Message& m) -> Status {
    DV_ASSIGN(auto r, domain::RxMeta::decode(m));
    if (r.id != id) return fail(Err::INTEGRITY, "prescription record id mismatch");
    rxMeta_.emplace(id, std::move(r));
    return Status::ok();
  }));
  DV_TRY(loadAll(RecordType::INVITE_SPENT, [&](const std::string& id, const codec::Message& m) -> Status {
    DV_ASSIGN(uint64_t expires, m.u64(proto::tag::Invite::ExpiresAtMs));
    spentInvites_.emplace(id, static_cast<int64_t>(expires));
    return Status::ok();
  }));
  return Status::ok();
}

// --- Directory ------------------------------------------------------------------------

Status Vault::putSystem(RecordType type, std::string_view id, const codec::Writer& w) {
  DV_ASSIGN(Bytes plain, w.finish());
  const Status s = store_->put(type, id, keys().systemKey(), view(plain));
  crypto_wipe(plain.data(), plain.size());
  return s;
}

const domain::Provider* Vault::provider(std::string_view id) const {
  auto it = providers_.find(id);
  return it == providers_.end() ? nullptr : &it->second;
}

Status Vault::saveProvider(const domain::Provider& p) {
  DV_TRY(putSystem(RecordType::PROVIDER, p.id, p.encode()));
  providers_.insert_or_assign(p.id, p);
  return Status::ok();
}

Status Vault::saveProviderSigner(std::string_view providerId, const crypto::SigningKey& key) {
  // Only the 32-byte seed is stored, wrapped under the key-wrapping key.
  return store_->put(RecordType::PROVIDER_KEY, providerId, keys().wrapKey(), key.seed());
}

Result<crypto::SigningKey> Vault::providerSigner(std::string_view providerId) const {
  DV_ASSIGN(auto seed, store_->get(RecordType::PROVIDER_KEY, providerId, keys().wrapKey()));
  return crypto::SigningKey::fromSeed(seed.view());
}

const domain::Grant* Vault::grant(std::string_view id) const {
  auto it = grants_.find(id);
  return it == grants_.end() ? nullptr : &it->second;
}

const domain::Grant* Vault::activeGrant(std::string_view patientId, std::string_view providerId) const {
  const int64_t now = clock_.nowMs();
  for (const auto& [id, g] : grants_) {
    if (g.patientId == patientId && g.providerId == providerId && g.activeAt(now)) return &g;
  }
  return nullptr;
}

Status Vault::saveGrant(const domain::Grant& g) {
  DV_TRY(putSystem(RecordType::GRANT, g.id, g.encode()));
  grants_.insert_or_assign(g.id, g);
  return Status::ok();
}

const domain::RxMeta* Vault::rxMeta(std::string_view id) const {
  auto it = rxMeta_.find(id);
  return it == rxMeta_.end() ? nullptr : &it->second;
}

Status Vault::saveRxMeta(const domain::RxMeta& r) {
  DV_TRY(putSystem(RecordType::RX_META, r.id, r.encode()));
  rxMeta_.insert_or_assign(r.id, r);
  return Status::ok();
}

bool Vault::inviteSpent(ByteView nonce) const { return spentInvites_.count(toHex(nonce)) > 0; }

Status Vault::spendInvite(ByteView nonce, int64_t expiresAtMs) {
  const std::string id = toHex(nonce);
  codec::Writer w;
  w.u64(proto::tag::Invite::ExpiresAtMs, static_cast<uint64_t>(expiresAtMs));
  DV_TRY(putSystem(RecordType::INVITE_SPENT, id, w));
  spentInvites_.emplace(id, expiresAtMs);
  return Status::ok();
}

// --- Patient data ---------------------------------------------------------------------------

bool Vault::hasPatient(std::string_view patientId) const { return store_->contains(RecordType::PATIENT_KEY, patientId); }

size_t Vault::patientCount() const { return store_->count(RecordType::PATIENT_KEY); }

Result<crypto::Key32> Vault::patientKey(std::string_view patientId, bool create) {
  if (!domain::isValidId(patientId)) return fail(Err::BAD_REQUEST, "invalid patient id");
  if (!store_->contains(RecordType::PATIENT_KEY, patientId)) {
    if (!create) return fail(Err::NOT_FOUND, "no data shared for this patient");
    auto dek = crypto::Key32::random();
    DV_TRY(store_->put(RecordType::PATIENT_KEY, patientId, keys().wrapKey(), dek.view()));
    return dek;
  }
  DV_ASSIGN(auto raw, store_->get(RecordType::PATIENT_KEY, patientId, keys().wrapKey()));
  crypto::Key32 dek;
  if (!crypto::Key32::from(raw.view(), dek)) return fail(Err::INTEGRITY, "corrupt patient key");
  return dek;
}

Status Vault::putPatient(std::string_view patientId, RecordType type, std::string_view id, const codec::Writer& w) {
  DV_ASSIGN(auto dek, patientKey(patientId, true));
  DV_ASSIGN(Bytes plain, w.finish());
  const Status s = store_->put(type, id, dek, view(plain));
  crypto_wipe(plain.data(), plain.size());
  return s;
}

Result<std::optional<domain::Snapshot>> Vault::loadSnapshot(std::string_view patientId) {
  if (!store_->contains(RecordType::SNAPSHOT, patientId)) return std::optional<domain::Snapshot>{};
  DV_ASSIGN(auto dek, patientKey(patientId, false));
  auto m = openMessage(store_->get(RecordType::SNAPSHOT, patientId, dek));
  if (!m) {
    noteIntegrityError();
    return m.status();
  }
  DV_ASSIGN(auto s, domain::Snapshot::decode(*m));
  return std::optional<domain::Snapshot>(std::move(s));
}

Status Vault::saveSnapshot(const domain::Snapshot& s) {
  return putPatient(s.patientId, RecordType::SNAPSHOT, s.patientId, s.encode());
}

Result<domain::Prescription> Vault::loadPrescription(std::string_view patientId, std::string_view rxId) {
  DV_ASSIGN(auto dek, patientKey(patientId, false));
  auto m = openMessage(store_->get(RecordType::RX_BODY, scopedId(patientId, rxId), dek));
  if (!m) {
    if (m.status().code() == Err::INTEGRITY) noteIntegrityError();
    return m.status();
  }
  DV_ASSIGN(auto p, domain::Prescription::decode(*m));
  if (p.id != rxId || p.patientId != patientId) return fail(Err::INTEGRITY, "prescription record mismatch");
  return p;
}

Status Vault::savePrescription(const domain::Prescription& p) {
  return putPatient(p.patientId, RecordType::RX_BODY, scopedId(p.patientId, p.id), p.encode());
}

Result<std::vector<domain::Fill>> Vault::loadFills(std::string_view patientId) {
  std::vector<domain::Fill> fills;
  const auto ids = store_->ids(RecordType::FILL, scopedId(patientId, ""));
  if (ids.empty()) return fills;
  DV_ASSIGN(auto dek, patientKey(patientId, false));
  for (const auto& id : ids) {
    auto m = openMessage(store_->get(RecordType::FILL, id, dek));
    if (!m) {
      noteIntegrityError();
      return m.status();
    }
    DV_ASSIGN(auto f, domain::Fill::decode(*m));
    fills.push_back(std::move(f));
  }
  return fills;
}

Status Vault::saveFill(const domain::Fill& f) {
  return putPatient(f.patientId, RecordType::FILL, scopedId(f.patientId, f.id), f.encode());
}

Status Vault::erasePatient(std::string_view patientId) {
  if (!domain::isValidId(patientId)) return fail(Err::BAD_REQUEST, "invalid patient id");
  // 1. Revoke every grant and drop routing so no one can reach the data meanwhile.
  for (auto& [id, g] : grants_) {
    if (g.patientId == patientId && !g.revoked) {
      domain::Grant revoked = g;
      revoked.revoked = true;
      DV_TRY(saveGrant(revoked));
    }
  }
  // 2. Durable intent, so a crash mid-erase is finished at next startup.
  codec::Writer w;
  w.u64(proto::tag::Invite::ExpiresAtMs, static_cast<uint64_t>(clock_.nowMs()));
  DV_TRY(putSystem(RecordType::TOMBSTONE, patientId, w));
  return finishPendingErasures();
}

Status Vault::finishPendingErasures() {
  const auto pending = store_->ids(RecordType::TOMBSTONE);
  if (pending.empty()) return Status::ok();
  const std::set<std::string, std::less<>> erased(pending.begin(), pending.end());
  std::set<std::string, std::less<>> rxToDrop;
  for (const auto& [id, r] : rxMeta_) {
    if (erased.count(r.patientId)) rxToDrop.insert(id);
  }
  // Rewrite the database without the patient's key, data, grants or routing.
  DV_TRY(store_->compact([&](RecordType type, const std::string& id) {
    switch (type) {
      case RecordType::TOMBSTONE:
        return false;
      case RecordType::PATIENT_KEY:
      case RecordType::SNAPSHOT:
        return erased.count(id) == 0;
      case RecordType::RX_BODY:
      case RecordType::FILL:
        return erased.count(id.substr(0, id.find('/'))) == 0;
      case RecordType::GRANT: {
        auto it = grants_.find(id);
        return it == grants_.end() || erased.count(it->second.patientId) == 0;
      }
      case RecordType::RX_META:
        return rxToDrop.count(id) == 0;
      default:
        return true;
    }
  }));
  std::erase_if(grants_, [&](const auto& kv) { return erased.count(kv.second.patientId) > 0; });
  std::erase_if(rxMeta_, [&](const auto& kv) { return rxToDrop.count(kv.first) > 0; });
  return Status::ok();
}

}  // namespace dosely::service
