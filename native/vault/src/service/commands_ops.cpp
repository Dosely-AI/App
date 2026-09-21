// Operations: handshake, health, the care worklist, and the audit log.

#include <algorithm>

#include "service/analytics.hpp"
#include "service/command.hpp"

namespace dosely::service {

namespace tag = proto::tag;
namespace Scope = proto::Scope;
using proto::Role;
using proto::RxStatus;

namespace {

constexpr uint64_t kVaultVersion = 1;

class Hello final : public ICommand {
 public:
  Cmd id() const override { return Cmd::HELLO; }
  bool audited() const override { return false; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({}));
    const auto& pk = ctx.vault.keys().signer().publicKey();
    codec::Writer w;
    w.u64(tag::Hello::Version, kVaultVersion).bytes(tag::Hello::SystemKey, {pk.data(), pk.size()});
    return w;
  }
};

class Stats final : public ICommand {
 public:
  Cmd id() const override { return Cmd::STATS; }
  bool audited() const override { return false; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.policy.requireRole(ctx.actor(), {Role::SYSTEM}));
    DV_TRY(ctx.args().expectOnly({}));
    const auto& v = ctx.vault;
    const auto activeGrants = std::count_if(v.grants().begin(), v.grants().end(),
                                            [&](const auto& kv) { return kv.second.activeAt(ctx.now()); });
    const auto& integrity = v.audit().integrity();
    codec::Writer w;
    w.u64(tag::Stats::Version, kVaultVersion)
        .u64(tag::Stats::Providers, v.providers().size())
        .u64(tag::Stats::Patients, v.patientCount())
        .u64(tag::Stats::Grants, static_cast<uint64_t>(activeGrants))
        .u64(tag::Stats::Prescriptions, v.prescriptions().size())
        .u64(tag::Stats::AuditEntries, integrity.entries)
        .u64(tag::Stats::IntegrityErrors, v.integrityErrors())
        .boolean(tag::Stats::AuditIntact, integrity.intact);
    if (!integrity.intact) w.u64(tag::Stats::AuditBrokenAt, integrity.brokenAtSeq);
    return w;
  }
};

/** Proactive outreach queue: who needs a refill, who is struggling, what's new. */
class Worklist final : public ICommand {
 public:
  Cmd id() const override { return Cmd::WORKLIST; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_ASSIGN(const domain::Provider* me, ctx.policy.provider(ctx.actor()));
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_TRY(ctx.args().expectOnly({tag::Arg::Limit}));
    DV_ASSIGN(uint64_t limit, ctx.args().u64Or(tag::Arg::Limit, 100));
    limit = std::clamp<uint64_t>(limit, 1, 500);

    CareAnalytics analytics(ctx.now());
    std::map<std::string, ecs::Entity> patients;
    std::map<std::string, int32_t> tzOffsetMin;  // for dating items on each patient's calendar
    for (const auto& [id, g] : ctx.vault.grants()) {
      if (g.providerId != me->id || !g.activeAt(ctx.now())) continue;
      DV_ASSIGN(auto snapshot, ctx.vault.loadSnapshot(g.patientId));
      std::vector<domain::Fill> fills;
      if (snapshot && (g.scopes & Scope::READ_ADHERENCE)) {
        DV_ASSIGN(fills, ctx.vault.loadFills(g.patientId));
      }
      patients[g.patientId] =
          snapshot ? analytics.addPatient(*snapshot, fills, g.scopes) : analytics.addEmptyPatient(g.patientId);
      tzOffsetMin[g.patientId] = snapshot ? snapshot->tzOffsetMin : 0;
    }

    if (me->role == Role::PHARMACY) {
      for (const auto& [id, meta] : ctx.vault.prescriptions()) {
        if (meta.pharmacyId != me->id || meta.status != RxStatus::SENT) continue;
        const auto* g = ctx.vault.activeGrant(meta.patientId, me->id);
        auto it = patients.find(meta.patientId);
        if (!g || !(g->scopes & Scope::RECEIVE_RX) || it == patients.end()) continue;
        DV_ASSIGN(auto body, ctx.vault.loadPrescription(meta.patientId, meta.id));
        const bool refill = std::any_of(meta.history.begin(), meta.history.end(),
                                        [](const auto& e) { return e.status == RxStatus::PICKED_UP; });
        const int64_t issuedDay =
            Clock::floorDiv(meta.updatedAtMs + int64_t{tzOffsetMin[meta.patientId]} * kMsPerMinute, kMsPerDay);
        analytics.addPendingRx(it->second, {meta.id, body.drugName, issuedDay, refill});
      }
    }
    analytics.run();

    std::vector<codec::Writer> items;
    for (const auto& item : analytics.worklist()) {
      if (items.size() >= limit) break;
      codec::Writer w;
      w.u64(tag::Work::Kind, static_cast<uint64_t>(item.kind)).str(tag::Work::PatientId, item.patientId);
      if (!item.patientName.empty()) w.str(tag::Work::PatientName, item.patientName);
      if (!item.medId.empty()) w.str(tag::Work::MedId, item.medId).str(tag::Work::MedName, item.medName);
      w.u64(tag::Work::DueDay, static_cast<uint64_t>(std::max<int64_t>(0, item.dueDay))).u64(tag::Work::Priority, item.priority);
      if (!item.detail.empty()) w.str(tag::Work::Detail, item.detail);
      if (!item.rxId.empty()) w.str(tag::Work::RxId, item.rxId);
      items.push_back(std::move(w));
    }
    ctx.audit.detail = "worklist across " + std::to_string(patients.size()) + " patients";
    return listOf(std::move(items));
  }
};

/** Patients see who touched their record; providers see their own activity. */
class AuditQuery final : public ICommand {
 public:
  Cmd id() const override { return Cmd::AUDIT_QUERY; }
  bool audited() const override { return false; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::PatientId, tag::Arg::Limit}));
    DV_ASSIGN(uint64_t limit, ctx.args().u64Or(tag::Arg::Limit, 50));
    DV_ASSIGN(std::string patientFilter, ctx.args().strOr(tag::Arg::PatientId, ""));
    limit = std::clamp<uint64_t>(limit, 1, 500);
    const auto& actor = ctx.actor();

    auto visible = [&](const store::AuditEntry& e) {
      switch (actor.role) {
        case Role::PATIENT: return e.patientId == actor.id;
        case Role::PHARMACY:
        case Role::PRESCRIBER: return e.actorId == actor.id && (patientFilter.empty() || e.patientId == patientFilter);
        case Role::SYSTEM: return patientFilter.empty() || e.patientId == patientFilter;
      }
      return false;
    };

    std::vector<codec::Writer> items;
    const auto& entries = ctx.vault.audit().entries();
    for (auto it = entries.rbegin(); it != entries.rend() && items.size() < limit; ++it) {
      if (!visible(*it)) continue;
      codec::Writer w = it->encode();
      if (const auto* p = ctx.vault.provider(it->actorId)) w.str(tag::Audit::ActorName, p->name);
      items.push_back(std::move(w));
    }
    return listOf(std::move(items));
  }
};

class AuditVerify final : public ICommand {
 public:
  Cmd id() const override { return Cmd::AUDIT_VERIFY; }
  bool audited() const override { return false; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({}));
    const auto result = ctx.vault.audit().verifyOnDisk();
    codec::Writer w;
    w.u64(tag::Stats::AuditEntries, result.entries).boolean(tag::Stats::AuditIntact, result.intact);
    if (!result.intact) w.u64(tag::Stats::AuditBrokenAt, result.brokenAtSeq);
    return w;
  }
};

}  // namespace

CommandList operationsCommands() {
  CommandList out;
  out.push_back(std::make_unique<Hello>());
  out.push_back(std::make_unique<Stats>());
  out.push_back(std::make_unique<Worklist>());
  out.push_back(std::make_unique<AuditQuery>());
  out.push_back(std::make_unique<AuditVerify>());
  return out;
}

}  // namespace dosely::service
