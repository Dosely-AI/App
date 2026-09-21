// Patient-record commands: share a snapshot, read a summary, erase, and the
// provider's list of connected patients.

#include "service/analytics.hpp"
#include "service/command.hpp"

namespace dosely::service {

namespace tag = proto::tag;
namespace Scope = proto::Scope;
using proto::Role;

namespace {

constexpr uint32_t kProviderScopes = Scope::READ_MEDS | Scope::READ_ADHERENCE | Scope::READ_TIMING |
                                     Scope::READ_REFILL | Scope::RECEIVE_RX | Scope::PRESCRIBE;

/** Pharmacies this patient has connected for receiving prescriptions. */
std::vector<PharmacyRef> connectedPharmacies(const Vault& vault, const std::string& patientId, int64_t now) {
  std::vector<PharmacyRef> out;
  for (const auto& [id, g] : vault.grants()) {
    if (g.patientId != patientId || !g.activeAt(now) || !(g.scopes & Scope::RECEIVE_RX)) continue;
    if (const auto* p = vault.provider(g.providerId); p && p->role == Role::PHARMACY) {
      out.push_back({p->id, p->name, p->org, p->verified});
    }
  }
  return out;
}

class SnapshotPut final : public ICommand {
 public:
  Cmd id() const override { return Cmd::SNAPSHOT_PUT; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.policy.requireRole(ctx.actor(), {Role::PATIENT}));
    DV_TRY(ctx.args().expectOnly({tag::Arg::Record}));
    DV_ASSIGN(auto record, ctx.args().msg(tag::Arg::Record));
    DV_ASSIGN(domain::Snapshot snapshot, domain::Snapshot::decode(record));
    if (!snapshot.patientId.empty() && snapshot.patientId != ctx.actor().id) {
      return fail(Err::FORBIDDEN, "patients can only share their own record");
    }
    snapshot.patientId = ctx.actor().id;
    snapshot.updatedAtMs = ctx.now();
    DV_TRY(ctx.vault.saveSnapshot(snapshot));
    ctx.audit.patientId = snapshot.patientId;
    ctx.audit.detail = "shared " + std::to_string(snapshot.meds.size()) + " medications";
    codec::Writer w;
    w.u64(tag::Snapshot::UpdatedAtMs, static_cast<uint64_t>(snapshot.updatedAtMs));
    return w;
  }
};

class PatientSummary final : public ICommand {
 public:
  Cmd id() const override { return Cmd::PATIENT_SUMMARY; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::PatientId, tag::Arg::Scopes}));
    DV_ASSIGN(std::string patientId, ctx.args().str(tag::Arg::PatientId));
    ctx.audit.patientId = patientId;
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_ASSIGN(uint32_t scopes, ctx.policy.scopesFor(ctx.actor(), patientId));

    // Patients can preview exactly what a provider with given scopes would see.
    const bool preview = ctx.actor().role == Role::PATIENT && ctx.args().has(tag::Arg::Scopes);
    if (preview) {
      DV_ASSIGN(uint64_t requested, ctx.args().u64(tag::Arg::Scopes));
      scopes = (static_cast<uint32_t>(requested) & kProviderScopes) | Scope::READ_MEDS;
    } else if (ctx.actor().role == Role::PATIENT) {
      scopes = kProviderScopes;
    } else if (ctx.args().has(tag::Arg::Scopes)) {
      return fail(Err::BAD_REQUEST, "only patients can preview scopes");
    }

    DV_ASSIGN(auto snapshot, ctx.vault.loadSnapshot(patientId));
    if (!snapshot) return fail(Err::NOT_FOUND, "nothing has been shared yet");
    std::vector<domain::Fill> fills;
    if (scopes & Scope::READ_ADHERENCE) {
      DV_ASSIGN(fills, ctx.vault.loadFills(patientId));
    }
    CareAnalytics analytics(ctx.now());
    const auto patient = analytics.addPatient(*snapshot, fills, scopes);
    analytics.run();

    const bool showPharmacies = ctx.actor().role == Role::PATIENT || (scopes & Scope::PRESCRIBE);
    const auto pharmacies = showPharmacies ? connectedPharmacies(ctx.vault, patientId, ctx.now()) : std::vector<PharmacyRef>{};
    ctx.audit.detail = std::string(preview ? "previewed " : "viewed ") + scopeText(scopes & kProviderScopes);
    return analytics.summary(patient, scopes & kProviderScopes, snapshot->updatedAtMs, pharmacies);
  }
};

class PatientErase final : public ICommand {
 public:
  Cmd id() const override { return Cmd::PATIENT_ERASE; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.policy.requireRole(ctx.actor(), {Role::PATIENT}));
    DV_TRY(ctx.args().expectOnly({}));
    ctx.audit.patientId = ctx.actor().id;
    DV_TRY(ctx.policy.requireStepUp(ctx.request.context));
    DV_TRY(ctx.vault.erasePatient(ctx.actor().id));
    ctx.audit.detail = "erased all shared data (keys destroyed)";
    return codec::Writer{};
  }
};

class ProviderPatients final : public ICommand {
 public:
  Cmd id() const override { return Cmd::PROVIDER_PATIENTS; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_ASSIGN(const domain::Provider* me, ctx.policy.provider(ctx.actor()));
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_TRY(ctx.args().expectOnly({}));

    struct Row {
      const domain::Grant* grant;
      ecs::Entity entity;
      int64_t updatedAtMs;
      std::string name;
    };
    std::vector<Row> rows;
    CareAnalytics analytics(ctx.now());
    for (const auto& [id, g] : ctx.vault.grants()) {
      if (g.providerId != me->id || !g.activeAt(ctx.now())) continue;
      DV_ASSIGN(auto snapshot, ctx.vault.loadSnapshot(g.patientId));
      if (!snapshot) {
        rows.push_back({&g, analytics.addEmptyPatient(g.patientId), 0, ""});
        continue;
      }
      std::vector<domain::Fill> fills;
      if (g.scopes & Scope::READ_ADHERENCE) {
        DV_ASSIGN(fills, ctx.vault.loadFills(g.patientId));
      }
      rows.push_back({&g, analytics.addPatient(*snapshot, fills, g.scopes), snapshot->updatedAtMs, snapshot->displayName});
    }
    analytics.run();

    std::vector<codec::Writer> items;
    for (const auto& r : rows) {
      codec::Writer w;
      w.str(tag::PatientRef::Id, r.grant->patientId);
      if (!r.name.empty()) w.str(tag::PatientRef::DisplayName, r.name);
      w.u64(tag::PatientRef::Scopes, r.grant->scopes)
          .u64(tag::PatientRef::GrantExpiresAtMs, static_cast<uint64_t>(r.grant->expiresAtMs))
          .u64(tag::PatientRef::RiskScore, analytics.riskScore(r.entity));
      if (r.updatedAtMs > 0) w.u64(tag::PatientRef::UpdatedAtMs, static_cast<uint64_t>(r.updatedAtMs));
      items.push_back(std::move(w));
    }
    ctx.audit.detail = "listed " + std::to_string(items.size()) + " connected patients";
    return listOf(std::move(items));
  }
};

}  // namespace

CommandList patientCommands() {
  CommandList out;
  out.push_back(std::make_unique<SnapshotPut>());
  out.push_back(std::make_unique<PatientSummary>());
  out.push_back(std::make_unique<PatientErase>());
  out.push_back(std::make_unique<ProviderPatients>());
  return out;
}

}  // namespace dosely::service
