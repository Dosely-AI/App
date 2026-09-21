// Prescription commands: a prescriber sends a signed prescription to the
// patient's chosen pharmacy; the pharmacy works it through to pickup; the
// patient can follow it, cancel it early, or request a refill.
//
// Sandbox only: this is not a certified e-prescribing network (see
// docs/care-network/COMPLIANCE.md). Controlled substances are refused.

#include <algorithm>

#include "service/command.hpp"

namespace dosely::service {

namespace tag = proto::tag;
namespace Scope = proto::Scope;
using domain::Prescription;
using domain::RxMeta;
using proto::Role;
using proto::RxStatus;

namespace {

constexpr uint64_t kDefaultListLimit = 50;
constexpr uint64_t kMaxListLimit = 200;

uint32_t pickups(const RxMeta& meta) {
  return static_cast<uint32_t>(std::count_if(meta.history.begin(), meta.history.end(),
                                             [](const domain::StatusEvent& e) { return e.status == RxStatus::PICKED_UP; }));
}

/** May this actor see this prescription? Providers need a live connection. */
Status canAccess(const CommandContext& ctx, const RxMeta& meta) {
  const auto& actor = ctx.actor();
  switch (actor.role) {
    case Role::PATIENT:
      if (meta.patientId == actor.id) return Status::ok();
      break;
    case Role::PRESCRIBER:
      if (meta.prescriberId == actor.id && ctx.vault.activeGrant(meta.patientId, actor.id)) return Status::ok();
      break;
    case Role::PHARMACY:
      if (meta.pharmacyId == actor.id) {
        const auto* g = ctx.vault.activeGrant(meta.patientId, actor.id);
        if (g && (g->scopes & Scope::RECEIVE_RX)) return Status::ok();
      }
      break;
    case Role::SYSTEM:
      break;
  }
  return fail(Err::NOT_FOUND, "prescription not found");  // no existence oracle
}

const char* statusLabel(RxStatus s) {
  switch (s) {
    case RxStatus::SENT: return "sent";
    case RxStatus::RECEIVED: return "received by the pharmacy";
    case RxStatus::IN_PROGRESS: return "being filled";
    case RxStatus::READY: return "ready for pickup";
    case RxStatus::PICKED_UP: return "picked up";
    case RxStatus::CANCELLED: return "cancelled";
  }
  return "updated";
}

std::string nameOf(const Vault& vault, const std::string& providerId) {
  const auto* p = vault.provider(providerId);
  return p ? p->name : std::string();
}

/** The full prescription as a reader sees it, with signature verification. */
Result<codec::Writer> render(CommandContext& ctx, const RxMeta& meta) {
  DV_ASSIGN(Prescription body, ctx.vault.loadPrescription(meta.patientId, meta.id));
  const auto* prescriber = ctx.vault.provider(meta.prescriberId);
  const bool valid = prescriber && body.signatureValid(prescriber->publicKey);
  if (!valid) ctx.vault.noteIntegrityError();

  codec::Writer w;
  body.encodeClinical(w);
  w.u64(tag::Rx::Status, static_cast<uint64_t>(meta.status))
      .u64(tag::Rx::UpdatedAtMs, static_cast<uint64_t>(meta.updatedAtMs))
      .bytes(tag::Rx::Signature, {body.signature.data(), body.signature.size()});
  if (prescriber) w.bytes(tag::Rx::PrescriberKey, {prescriber->publicKey.data(), prescriber->publicKey.size()});
  w.boolean(tag::Rx::SignatureValid, valid);
  if (prescriber) w.str(tag::Rx::PrescriberName, prescriber->name);
  if (auto snap = ctx.vault.loadSnapshot(meta.patientId); snap && snap->has_value() && !(*snap)->displayName.empty()) {
    w.str(tag::Rx::PatientName, (*snap)->displayName);
  }
  if (const auto name = nameOf(ctx.vault, meta.pharmacyId); !name.empty()) w.str(tag::Rx::PharmacyName, name);
  for (const auto& e : meta.history) {
    codec::Writer ev;
    ev.u64(tag::StatusEvent::Status, static_cast<uint64_t>(e.status))
        .u64(tag::StatusEvent::AtMs, static_cast<uint64_t>(e.atMs))
        .str(tag::StatusEvent::ActorId, e.actorId);
    w.msg(tag::Rx::History, ev);
  }
  const uint32_t n = pickups(meta);
  w.u64(tag::Rx::RefillsUsed, n > 0 ? n - 1 : 0);
  return w;
}

class RxCreate final : public ICommand {
 public:
  Cmd id() const override { return Cmd::RX_CREATE; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_ASSIGN(const domain::Provider* me, ctx.policy.provider(ctx.actor()));
    if (me->role != Role::PRESCRIBER) return fail(Err::FORBIDDEN, "only prescribers can send prescriptions");
    DV_TRY(ctx.args().expectOnly({tag::Arg::Record}));
    DV_ASSIGN(auto record, ctx.args().msg(tag::Arg::Record));
    DV_ASSIGN(Prescription rx, Prescription::fromDraft(record));
    ctx.audit.patientId = rx.patientId;

    if (ctx.request.context.purpose != proto::Purpose::TREATMENT) {
      return fail(Err::FORBIDDEN, "prescribing must be for treatment");
    }
    DV_TRY(ctx.policy.requireVerified(*me));
    DV_TRY(ctx.policy.requireScopes(ctx.actor(), rx.patientId, Scope::READ_MEDS | Scope::PRESCRIBE));
    DV_TRY(ctx.policy.requireStepUp(ctx.request.context));
    if (rx.controlled) {
      return fail(Err::UNSUPPORTED,
                  "controlled substances need a DEA-certified EPCS system; this network doesn't support them");
    }
    const auto* pharmacy = ctx.vault.provider(rx.pharmacyId);
    const auto* route = ctx.vault.activeGrant(rx.patientId, rx.pharmacyId);
    if (!pharmacy || pharmacy->role != Role::PHARMACY || !route || !(route->scopes & Scope::RECEIVE_RX)) {
      return fail(Err::FORBIDDEN, "the patient hasn't connected that pharmacy to receive prescriptions");
    }
    if (!rx.medId.empty()) {
      DV_ASSIGN(auto snapshot, ctx.vault.loadSnapshot(rx.patientId));
      const bool known = snapshot && std::any_of(snapshot->meds.begin(), snapshot->meds.end(),
                                                 [&](const domain::MedRecord& m) { return m.id == rx.medId; });
      if (!known) return fail(Err::BAD_REQUEST, "that medication isn't on the patient's list");
    }

    rx.id = domain::newId();
    rx.prescriberId = me->id;
    rx.issuedAtMs = ctx.now();
    DV_ASSIGN(auto signer, ctx.vault.providerSigner(me->id));
    const Bytes signedBytes = rx.signingBytes();
    rx.signature = signer.sign(view(signedBytes));
    DV_TRY(ctx.vault.savePrescription(rx));

    RxMeta meta;
    meta.id = rx.id;
    meta.patientId = rx.patientId;
    meta.prescriberId = rx.prescriberId;
    meta.pharmacyId = rx.pharmacyId;
    meta.status = RxStatus::SENT;
    meta.issuedAtMs = meta.updatedAtMs = rx.issuedAtMs;
    meta.history.push_back({RxStatus::SENT, rx.issuedAtMs, me->id});
    DV_TRY(ctx.vault.saveRxMeta(meta));
    ctx.audit.detail = "prescribed; sent to " + pharmacy->name;
    return render(ctx, meta);
  }
};

class RxList final : public ICommand {
 public:
  Cmd id() const override { return Cmd::RX_LIST; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::PatientId, tag::Arg::Status, tag::Arg::Limit}));
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_ASSIGN(std::string patientFilter, ctx.args().strOr(tag::Arg::PatientId, ""));
    DV_ASSIGN(uint64_t statusFilter, ctx.args().u64Or(tag::Arg::Status, 0));
    DV_ASSIGN(uint64_t limit, ctx.args().u64Or(tag::Arg::Limit, kDefaultListLimit));
    limit = std::clamp<uint64_t>(limit, 1, kMaxListLimit);
    ctx.audit.patientId = patientFilter;

    std::vector<const RxMeta*> visible;
    for (const auto& [id, meta] : ctx.vault.prescriptions()) {
      if (!patientFilter.empty() && meta.patientId != patientFilter) continue;
      if (statusFilter != 0 && static_cast<uint64_t>(meta.status) != statusFilter) continue;
      if (canAccess(ctx, meta).isOk()) visible.push_back(&meta);
    }
    std::sort(visible.begin(), visible.end(), [](const RxMeta* a, const RxMeta* b) { return a->updatedAtMs > b->updatedAtMs; });
    if (visible.size() > limit) visible.resize(limit);

    std::vector<codec::Writer> items;
    for (const auto* meta : visible) {
      DV_ASSIGN(auto w, render(ctx, *meta));
      items.push_back(std::move(w));
    }
    ctx.audit.detail = "listed " + std::to_string(items.size()) + " prescriptions";
    return listOf(std::move(items));
  }
};

class RxGet final : public ICommand {
 public:
  Cmd id() const override { return Cmd::RX_GET; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::RxId}));
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_ASSIGN(std::string rxId, ctx.args().str(tag::Arg::RxId));
    const auto* meta = ctx.vault.rxMeta(rxId);
    if (!meta) return fail(Err::NOT_FOUND, "prescription not found");
    DV_TRY(canAccess(ctx, *meta));
    ctx.audit.patientId = meta->patientId;
    ctx.audit.detail = "viewed prescription";
    return render(ctx, *meta);
  }
};

class RxSetStatus final : public ICommand {
 public:
  Cmd id() const override { return Cmd::RX_SET_STATUS; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::RxId, tag::Arg::Status}));
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_ASSIGN(std::string rxId, ctx.args().str(tag::Arg::RxId));
    DV_ASSIGN(uint64_t statusValue, ctx.args().u64(tag::Arg::Status));
    if (statusValue < 1 || statusValue > 6) return fail(Err::BAD_REQUEST, "invalid status");
    const auto next = static_cast<RxStatus>(statusValue);

    const auto* current = ctx.vault.rxMeta(rxId);
    if (!current) return fail(Err::NOT_FOUND, "prescription not found");
    DV_TRY(canAccess(ctx, *current));
    ctx.audit.patientId = current->patientId;
    if (!domain::rxTransitionAllowed(current->status, next, ctx.actor().role)) {
      return fail(Err::CONFLICT, "that status change isn't allowed from here");
    }

    RxMeta meta = *current;
    const bool refillRequest = current->status == RxStatus::PICKED_UP && next == RxStatus::SENT;
    if (refillRequest || next == RxStatus::PICKED_UP) {
      DV_ASSIGN(Prescription body, ctx.vault.loadPrescription(meta.patientId, meta.id));
      if (refillRequest && pickups(meta) > body.refills) {
        return fail(Err::CONFLICT, "no refills left on this prescription; ask your prescriber for a new one");
      }
      if (next == RxStatus::PICKED_UP) {
        // Dispensing is what adherence (PDC) is measured from.
        domain::Fill fill;
        fill.id = domain::newId();
        fill.patientId = meta.patientId;
        fill.medId = body.medId;
        fill.rxId = meta.id;
        fill.pharmacyId = meta.pharmacyId;
        // Recorded on the patient's calendar, like the rest of their refill math.
        DV_ASSIGN(auto snapshot, ctx.vault.loadSnapshot(meta.patientId));
        fill.day = snapshot ? snapshot->localDay(ctx.now()) : ctx.today();
        fill.quantityMilli = body.quantityMilli;
        fill.daysSupply = body.daysSupply;
        DV_TRY(ctx.vault.saveFill(fill));
      }
    }
    meta.status = next;
    meta.updatedAtMs = ctx.now();
    meta.history.push_back({next, meta.updatedAtMs, ctx.actor().id});
    DV_TRY(ctx.vault.saveRxMeta(meta));
    ctx.audit.detail = refillRequest ? "requested a refill" : std::string("marked ") + statusLabel(next);
    return render(ctx, meta);
  }
};

}  // namespace

CommandList prescriptionCommands() {
  CommandList out;
  out.push_back(std::make_unique<RxCreate>());
  out.push_back(std::make_unique<RxList>());
  out.push_back(std::make_unique<RxGet>());
  out.push_back(std::make_unique<RxSetStatus>());
  return out;
}

}  // namespace dosely::service
