#include "domain/model.hpp"

#include <set>

namespace dosely::domain {

namespace tag = proto::tag;
namespace Scope = proto::Scope;

namespace {

constexpr std::string_view kRxDomain = "dosely/rx/v1\n";
constexpr std::string_view kInviteDomain = "dosely/invite/v1\n";
constexpr size_t kMaxDisplayName = 80;
constexpr size_t kMaxHistory = 200;
constexpr uint32_t kMaxGrantDays = 365;

Status bad(std::string what) { return fail(Err::BAD_REQUEST, std::move(what)); }

/** Printable text within a length bound (no control characters). */
Result<std::string> text(const codec::Message& m, uint16_t t, size_t maxLen, bool required, const char* what) {
  DV_ASSIGN(std::string s, m.strOr(t, ""));
  if (required && s.empty()) return bad(std::string(what) + " is required");
  if (s.size() > maxLen) return bad(std::string(what) + " is too long");
  for (unsigned char c : s) {
    if (c < 0x20 || c == 0x7F) return bad(std::string(what) + " contains control characters");
  }
  return s;
}

Result<std::string> idField(const codec::Message& m, uint16_t t, bool required, const char* what) {
  DV_ASSIGN(std::string s, m.strOr(t, ""));
  if (s.empty() && !required) return s;
  if (!isValidId(s)) return bad(std::string("invalid ") + what);
  return s;
}

Result<uint64_t> number(const codec::Message& m, uint16_t t, uint64_t lo, uint64_t hi, uint64_t fallback,
                        const char* what) {
  DV_ASSIGN(uint64_t v, m.u64Or(t, fallback));
  if (v < lo || v > hi) return bad(std::string(what) + " is out of range");
  return v;
}

bool allDigits(std::string_view s) {
  for (char c : s) {
    if (c < '0' || c > '9') return false;
  }
  return true;
}

Result<std::string> rxcuiField(const codec::Message& m, uint16_t t) {
  DV_ASSIGN(std::string s, m.strOr(t, ""));
  if (s.size() > 12 || !allDigits(s)) return bad("invalid RxCUI");
  return s;
}

Result<RxStatus> statusField(const codec::Message& m, uint16_t t) {
  DV_ASSIGN(uint64_t v, m.u64(t));
  if (v < static_cast<uint64_t>(RxStatus::SENT) || v > static_cast<uint64_t>(RxStatus::CANCELLED)) {
    return bad("invalid prescription status");
  }
  return static_cast<RxStatus>(v);
}

Result<Role> roleField(const codec::Message& m, uint16_t t) {
  DV_ASSIGN(uint64_t v, m.u64(t));
  if (v < static_cast<uint64_t>(Role::PATIENT) || v > static_cast<uint64_t>(Role::SYSTEM)) return bad("invalid role");
  return static_cast<Role>(v);
}

void optStr(codec::Writer& w, uint16_t t, const std::string& s) {
  if (!s.empty()) w.str(t, s);
}

}  // namespace

// --- Validation ------------------------------------------------------------------

bool isValidId(std::string_view id) {
  if (id.empty() || id.size() > 64) return false;
  for (char c : id) {
    const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
    if (!ok) return false;
  }
  return true;
}

bool isValidNpi(std::string_view npi) {
  if (npi.size() != 10 || !allDigits(npi)) return false;
  // Luhn over "80840" + NPI (the ISO health-industry prefix, per CMS).
  const std::string full = "80840" + std::string(npi);
  int sum = 0;
  bool doubleIt = false;
  for (auto it = full.rbegin(); it != full.rend(); ++it) {
    int d = *it - '0';
    if (doubleIt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleIt = !doubleIt;
  }
  return sum % 10 == 0;
}

bool isProviderRole(Role role) { return role == Role::PHARMACY || role == Role::PRESCRIBER; }

uint32_t scopesAllowedFor(Role role) {
  const uint32_t reads = Scope::READ_MEDS | Scope::READ_ADHERENCE | Scope::READ_TIMING | Scope::READ_REFILL;
  if (role == Role::PHARMACY) return reads | Scope::RECEIVE_RX;
  if (role == Role::PRESCRIBER) return reads | Scope::PRESCRIBE;
  return 0;
}

std::string newId() {
  uint8_t raw[16];
  crypto::randomBytes(raw, sizeof raw);
  return toHex({raw, sizeof raw});
}

// --- Provider ---------------------------------------------------------------------

codec::Writer Provider::encode() const {
  codec::Writer w;
  w.str(tag::Provider::Id, id).u64(tag::Provider::Role, static_cast<uint64_t>(role)).str(tag::Provider::Name, name);
  optStr(w, tag::Provider::Org, org);
  w.str(tag::Provider::Npi, npi)
      .boolean(tag::Provider::Verified, verified)
      .bytes(tag::Provider::PublicKey, {publicKey.data(), publicKey.size()})
      .u64(tag::Provider::CreatedAtMs, static_cast<uint64_t>(createdAtMs));
  return w;
}

Result<Provider> Provider::decode(const codec::Message& m) {
  Provider p;
  DV_ASSIGN(p.id, idField(m, tag::Provider::Id, true, "provider id"));
  DV_ASSIGN(p.role, roleField(m, tag::Provider::Role));
  DV_ASSIGN(p.name, text(m, tag::Provider::Name, kMaxNameLength, true, "name"));
  DV_ASSIGN(p.org, text(m, tag::Provider::Org, kMaxNameLength, false, "organization"));
  DV_ASSIGN(p.npi, m.str(tag::Provider::Npi));
  DV_ASSIGN(p.verified, m.boolean(tag::Provider::Verified));
  DV_ASSIGN(Bytes pk, m.bytes(tag::Provider::PublicKey));
  DV_ASSIGN(uint64_t created, m.u64(tag::Provider::CreatedAtMs));
  if (pk.size() != p.publicKey.size() || !isProviderRole(p.role)) return fail(Err::INTEGRITY, "corrupt provider record");
  std::copy(pk.begin(), pk.end(), p.publicKey.begin());
  p.createdAtMs = static_cast<int64_t>(created);
  return p;
}

Result<Provider> Provider::fromRegistration(const codec::Message& m, std::string_view actorId, Role actorRole) {
  DV_TRY(m.expectOnly({tag::Provider::Role, tag::Provider::Name, tag::Provider::Org, tag::Provider::Npi}));
  Provider p;
  p.id = std::string(actorId);
  DV_ASSIGN(p.role, roleField(m, tag::Provider::Role));
  if (!isProviderRole(p.role) || p.role != actorRole) return bad("register as the role you are acting in (pharmacy or prescriber)");
  DV_ASSIGN(p.name, text(m, tag::Provider::Name, kMaxNameLength, true, "name"));
  DV_ASSIGN(p.org, text(m, tag::Provider::Org, kMaxNameLength, false, "organization"));
  DV_ASSIGN(p.npi, m.str(tag::Provider::Npi));
  if (!isValidNpi(p.npi)) return bad("NPI must be a valid 10-digit National Provider Identifier");
  return p;
}

// --- Grant -------------------------------------------------------------------------

codec::Writer Grant::encode() const {
  codec::Writer w;
  w.str(tag::Grant::Id, id)
      .str(tag::Grant::PatientId, patientId)
      .str(tag::Grant::ProviderId, providerId)
      .u64(tag::Grant::Scopes, scopes)
      .u64(tag::Grant::CreatedAtMs, static_cast<uint64_t>(createdAtMs))
      .u64(tag::Grant::ExpiresAtMs, static_cast<uint64_t>(expiresAtMs))
      .boolean(tag::Grant::Revoked, revoked);
  return w;
}

Result<Grant> Grant::decode(const codec::Message& m) {
  Grant g;
  DV_ASSIGN(g.id, idField(m, tag::Grant::Id, true, "grant id"));
  DV_ASSIGN(g.patientId, idField(m, tag::Grant::PatientId, true, "patient id"));
  DV_ASSIGN(g.providerId, idField(m, tag::Grant::ProviderId, true, "provider id"));
  DV_ASSIGN(uint64_t scopes, m.u64(tag::Grant::Scopes));
  DV_ASSIGN(uint64_t created, m.u64(tag::Grant::CreatedAtMs));
  DV_ASSIGN(uint64_t expires, m.u64(tag::Grant::ExpiresAtMs));
  DV_ASSIGN(g.revoked, m.boolean(tag::Grant::Revoked));
  g.scopes = static_cast<uint32_t>(scopes);
  g.createdAtMs = static_cast<int64_t>(created);
  g.expiresAtMs = static_cast<int64_t>(expires);
  return g;
}

// --- Prescription routing -----------------------------------------------------------

codec::Writer RxMeta::encode() const {
  codec::Writer w;
  w.str(tag::RxMeta::Id, id)
      .str(tag::RxMeta::PatientId, patientId)
      .str(tag::RxMeta::PrescriberId, prescriberId)
      .str(tag::RxMeta::PharmacyId, pharmacyId)
      .u64(tag::RxMeta::Status, static_cast<uint64_t>(status))
      .u64(tag::RxMeta::IssuedAtMs, static_cast<uint64_t>(issuedAtMs))
      .u64(tag::RxMeta::UpdatedAtMs, static_cast<uint64_t>(updatedAtMs));
  for (const auto& e : history) {
    codec::Writer ev;
    ev.u64(tag::StatusEvent::Status, static_cast<uint64_t>(e.status))
        .u64(tag::StatusEvent::AtMs, static_cast<uint64_t>(e.atMs))
        .str(tag::StatusEvent::ActorId, e.actorId);
    w.msg(tag::RxMeta::History, ev);
  }
  return w;
}

Result<RxMeta> RxMeta::decode(const codec::Message& m) {
  RxMeta r;
  DV_ASSIGN(r.id, idField(m, tag::RxMeta::Id, true, "rx id"));
  DV_ASSIGN(r.patientId, idField(m, tag::RxMeta::PatientId, true, "patient id"));
  DV_ASSIGN(r.prescriberId, idField(m, tag::RxMeta::PrescriberId, true, "prescriber id"));
  DV_ASSIGN(r.pharmacyId, idField(m, tag::RxMeta::PharmacyId, true, "pharmacy id"));
  DV_ASSIGN(r.status, statusField(m, tag::RxMeta::Status));
  DV_ASSIGN(uint64_t issued, m.u64(tag::RxMeta::IssuedAtMs));
  DV_ASSIGN(uint64_t updated, m.u64(tag::RxMeta::UpdatedAtMs));
  r.issuedAtMs = static_cast<int64_t>(issued);
  r.updatedAtMs = static_cast<int64_t>(updated);
  DV_ASSIGN(auto events, m.msgs(tag::RxMeta::History));
  if (events.size() > kMaxHistory) return fail(Err::LIMIT, "prescription history too long");
  for (const auto& ev : events) {
    StatusEvent e;
    DV_ASSIGN(e.status, statusField(ev, tag::StatusEvent::Status));
    DV_ASSIGN(uint64_t at, ev.u64(tag::StatusEvent::AtMs));
    DV_ASSIGN(e.actorId, idField(ev, tag::StatusEvent::ActorId, true, "actor id"));
    e.atMs = static_cast<int64_t>(at);
    r.history.push_back(std::move(e));
  }
  return r;
}

bool rxTransitionAllowed(RxStatus from, RxStatus to, Role actor) {
  const auto rank = [](RxStatus s) { return static_cast<int>(s); };
  const bool open = from != RxStatus::PICKED_UP && from != RxStatus::CANCELLED;
  switch (actor) {
    case Role::PHARMACY:
      // Forward through the fill workflow (steps may be skipped), or decline an open Rx.
      if (to == RxStatus::CANCELLED) return open;
      return open && to != RxStatus::SENT && rank(to) > rank(from);
    case Role::PRESCRIBER:
      return to == RxStatus::CANCELLED && open;
    case Role::PATIENT:
      // Cancel before the pharmacy starts work, or request a refill after pickup.
      if (to == RxStatus::CANCELLED) return from == RxStatus::SENT || from == RxStatus::RECEIVED;
      return from == RxStatus::PICKED_UP && to == RxStatus::SENT;
    case Role::SYSTEM:
      return false;
  }
  return false;
}

// --- Prescription body ----------------------------------------------------------------

namespace {

/** Clinical fields in canonical order (shared by signing, storage and responses). */
void writeClinical(codec::Writer& w, const Prescription& p) {
  w.str(tag::Rx::Id, p.id).str(tag::Rx::PatientId, p.patientId).str(tag::Rx::PrescriberId, p.prescriberId);
  w.str(tag::Rx::PharmacyId, p.pharmacyId);
  optStr(w, tag::Rx::MedId, p.medId);
  w.str(tag::Rx::DrugName, p.drugName);
  optStr(w, tag::Rx::Rxcui, p.rxcui);
  optStr(w, tag::Rx::Strength, p.strength);
  optStr(w, tag::Rx::Form, p.form);
  w.str(tag::Rx::Sig, p.sig)
      .u64(tag::Rx::QuantityMilli, p.quantityMilli)
      .u64(tag::Rx::DaysSupply, p.daysSupply)
      .u64(tag::Rx::Refills, p.refills)
      .boolean(tag::Rx::Controlled, p.controlled)
      .u64(tag::Rx::IssuedAtMs, static_cast<uint64_t>(p.issuedAtMs));
}

Status readClinical(const codec::Message& m, Prescription& p) {
  DV_ASSIGN(p.medId, idField(m, tag::Rx::MedId, false, "medication id"));
  DV_ASSIGN(p.drugName, text(m, tag::Rx::DrugName, kMaxNameLength, true, "drug name"));
  DV_ASSIGN(p.rxcui, rxcuiField(m, tag::Rx::Rxcui));
  DV_ASSIGN(p.strength, text(m, tag::Rx::Strength, kMaxShortText, false, "strength"));
  DV_ASSIGN(p.form, text(m, tag::Rx::Form, kMaxShortText, false, "form"));
  DV_ASSIGN(p.sig, text(m, tag::Rx::Sig, kMaxSigLength, true, "directions (sig)"));
  DV_ASSIGN(p.quantityMilli, number(m, tag::Rx::QuantityMilli, 1, 100'000'000, 0, "quantity"));
  DV_ASSIGN(uint64_t days, number(m, tag::Rx::DaysSupply, 1, 365, 0, "days supply"));
  DV_ASSIGN(uint64_t refills, number(m, tag::Rx::Refills, 0, 11, 0, "refills"));
  DV_ASSIGN(p.controlled, m.booleanOr(tag::Rx::Controlled, false));
  p.daysSupply = static_cast<uint32_t>(days);
  p.refills = static_cast<uint32_t>(refills);
  return Status::ok();
}

}  // namespace

void Prescription::encodeClinical(codec::Writer& w) const { writeClinical(w, *this); }

Bytes Prescription::signingBytes() const {
  codec::Writer w;
  writeClinical(w, *this);
  Bytes out(kRxDomain.begin(), kRxDomain.end());
  auto body = w.finish();
  if (body) append(out, view(*body));
  return out;
}

bool Prescription::signatureValid(const crypto::PublicKey& prescriberKey) const {
  const Bytes msg = signingBytes();
  return crypto::verify({prescriberKey.data(), prescriberKey.size()}, view(msg), {signature.data(), signature.size()});
}

codec::Writer Prescription::encode() const {
  codec::Writer w;
  writeClinical(w, *this);
  w.bytes(tag::Rx::Signature, {signature.data(), signature.size()});
  return w;
}

Result<Prescription> Prescription::decode(const codec::Message& m) {
  Prescription p;
  DV_ASSIGN(p.id, idField(m, tag::Rx::Id, true, "rx id"));
  DV_ASSIGN(p.patientId, idField(m, tag::Rx::PatientId, true, "patient id"));
  DV_ASSIGN(p.prescriberId, idField(m, tag::Rx::PrescriberId, true, "prescriber id"));
  DV_ASSIGN(p.pharmacyId, idField(m, tag::Rx::PharmacyId, true, "pharmacy id"));
  DV_TRY(readClinical(m, p));
  DV_ASSIGN(uint64_t issued, m.u64(tag::Rx::IssuedAtMs));
  DV_ASSIGN(Bytes sig, m.bytes(tag::Rx::Signature));
  if (sig.size() != p.signature.size()) return fail(Err::INTEGRITY, "corrupt prescription signature");
  std::copy(sig.begin(), sig.end(), p.signature.begin());
  p.issuedAtMs = static_cast<int64_t>(issued);
  return p;
}

Result<Prescription> Prescription::fromDraft(const codec::Message& m) {
  DV_TRY(m.expectOnly({tag::Rx::PatientId, tag::Rx::PharmacyId, tag::Rx::MedId, tag::Rx::DrugName, tag::Rx::Rxcui,
                       tag::Rx::Strength, tag::Rx::Form, tag::Rx::Sig, tag::Rx::QuantityMilli, tag::Rx::DaysSupply,
                       tag::Rx::Refills, tag::Rx::Controlled}));
  Prescription p;
  DV_ASSIGN(p.patientId, idField(m, tag::Rx::PatientId, true, "patient id"));
  DV_ASSIGN(p.pharmacyId, idField(m, tag::Rx::PharmacyId, true, "pharmacy id"));
  DV_TRY(readClinical(m, p));
  return p;
}

// --- Fill ---------------------------------------------------------------------------------

codec::Writer Fill::encode() const {
  codec::Writer w;
  w.str(tag::Fill::Id, id).str(tag::Fill::PatientId, patientId);
  optStr(w, tag::Fill::MedId, medId);
  w.str(tag::Fill::RxId, rxId)
      .u64(tag::Fill::Day, static_cast<uint64_t>(day))
      .u64(tag::Fill::QuantityMilli, quantityMilli)
      .u64(tag::Fill::DaysSupply, daysSupply)
      .str(tag::Fill::PharmacyId, pharmacyId);
  return w;
}

Result<Fill> Fill::decode(const codec::Message& m) {
  Fill f;
  DV_ASSIGN(f.id, idField(m, tag::Fill::Id, true, "fill id"));
  DV_ASSIGN(f.patientId, idField(m, tag::Fill::PatientId, true, "patient id"));
  DV_ASSIGN(f.medId, idField(m, tag::Fill::MedId, false, "medication id"));
  DV_ASSIGN(f.rxId, idField(m, tag::Fill::RxId, true, "rx id"));
  DV_ASSIGN(uint64_t day, m.u64(tag::Fill::Day));
  DV_ASSIGN(f.quantityMilli, m.u64(tag::Fill::QuantityMilli));
  DV_ASSIGN(uint64_t days, number(m, tag::Fill::DaysSupply, 1, 365, 0, "days supply"));
  DV_ASSIGN(f.pharmacyId, idField(m, tag::Fill::PharmacyId, true, "pharmacy id"));
  f.day = static_cast<int64_t>(day);
  f.daysSupply = static_cast<uint32_t>(days);
  return f;
}

// --- Snapshot ---------------------------------------------------------------------------------

codec::Writer MedRecord::encode() const {
  codec::Writer w;
  w.str(tag::Med::Id, id).str(tag::Med::Name, name);
  optStr(w, tag::Med::Rxcui, rxcui);
  optStr(w, tag::Med::Strength, strength);
  optStr(w, tag::Med::Form, form);
  w.u64(tag::Med::SlotsPerDay, slotsPerDay)
      .u64(tag::Med::DaysMask, daysMask)
      .u64(tag::Med::UnitsPerDoseMilli, unitsPerDoseMilli)
      .u64(tag::Med::OnHandMilli, onHandMilli)
      .u64(tag::Med::AsOfDay, static_cast<uint64_t>(asOfDay))
      .u64(tag::Med::LeadDays, leadDays)
      .boolean(tag::Med::AsNeeded, asNeeded);
  if (selfAdherencePct) w.u64(tag::Med::SelfAdherencePct, *selfAdherencePct);
  w.u64(tag::Med::DosesDue, dosesDue).u64(tag::Med::DosesTaken, dosesTaken).u64(tag::Med::DosesLate, dosesLate);
  if (avgDelayMin) w.i64(tag::Med::AvgDelayMin, *avgDelayMin);
  w.boolean(tag::Med::SupplyTracked, supplyTracked);
  optStr(w, tag::Med::RxId, rxId);
  return w;
}

Result<MedRecord> MedRecord::decode(const codec::Message& m) {
  DV_TRY(m.expectOnly({tag::Med::Id, tag::Med::Name, tag::Med::Rxcui, tag::Med::Strength, tag::Med::Form,
                       tag::Med::SlotsPerDay, tag::Med::DaysMask, tag::Med::UnitsPerDoseMilli, tag::Med::OnHandMilli,
                       tag::Med::AsOfDay, tag::Med::LeadDays, tag::Med::AsNeeded, tag::Med::SelfAdherencePct,
                       tag::Med::DosesDue, tag::Med::DosesTaken, tag::Med::DosesLate, tag::Med::AvgDelayMin,
                       tag::Med::SupplyTracked, tag::Med::RxId}));
  MedRecord r;
  DV_ASSIGN(r.id, idField(m, tag::Med::Id, true, "medication id"));
  DV_ASSIGN(r.name, text(m, tag::Med::Name, kMaxNameLength, true, "medication name"));
  DV_ASSIGN(r.rxcui, rxcuiField(m, tag::Med::Rxcui));
  DV_ASSIGN(r.strength, text(m, tag::Med::Strength, kMaxShortText, false, "strength"));
  DV_ASSIGN(r.form, text(m, tag::Med::Form, kMaxShortText, false, "form"));
  DV_ASSIGN(uint64_t slots, number(m, tag::Med::SlotsPerDay, 0, 24, 0, "doses per day"));
  DV_ASSIGN(uint64_t mask, number(m, tag::Med::DaysMask, 0, 127, 0, "days of week"));
  DV_ASSIGN(r.unitsPerDoseMilli, number(m, tag::Med::UnitsPerDoseMilli, 1, 1'000'000, 1000, "units per dose"));
  DV_ASSIGN(r.supplyTracked, m.booleanOr(tag::Med::SupplyTracked, false));
  DV_ASSIGN(r.onHandMilli, number(m, tag::Med::OnHandMilli, 0, 1'000'000'000, 0, "quantity on hand"));
  DV_ASSIGN(uint64_t asOf, number(m, tag::Med::AsOfDay, 0, 1'000'000, 0, "count date"));
  DV_ASSIGN(uint64_t lead, number(m, tag::Med::LeadDays, 0, 90, 7, "refill lead days"));
  DV_ASSIGN(r.asNeeded, m.booleanOr(tag::Med::AsNeeded, false));
  if (m.has(tag::Med::SelfAdherencePct)) {
    DV_ASSIGN(uint64_t pct, number(m, tag::Med::SelfAdherencePct, 0, 100, 0, "adherence"));
    r.selfAdherencePct = static_cast<uint32_t>(pct);
  }
  DV_ASSIGN(r.dosesDue, number(m, tag::Med::DosesDue, 0, 10'000'000, 0, "doses due"));
  DV_ASSIGN(r.dosesTaken, number(m, tag::Med::DosesTaken, 0, 10'000'000, 0, "doses taken"));
  DV_ASSIGN(r.dosesLate, number(m, tag::Med::DosesLate, 0, 10'000'000, 0, "late doses"));
  if (r.dosesLate > r.dosesTaken) return bad("late doses exceed doses taken");
  if (m.has(tag::Med::AvgDelayMin)) {
    DV_ASSIGN(int64_t delay, m.i64(tag::Med::AvgDelayMin));
    if (delay < -10080 || delay > 10080) return bad("average delay is out of range");
    r.avgDelayMin = delay;
  }
  DV_ASSIGN(r.rxId, idField(m, tag::Med::RxId, false, "prescription id"));
  r.slotsPerDay = static_cast<uint32_t>(slots);
  r.daysMask = static_cast<uint32_t>(mask);
  r.asOfDay = static_cast<int64_t>(asOf);
  r.leadDays = static_cast<uint32_t>(lead);
  return r;
}

codec::Writer Snapshot::encode() const {
  codec::Writer w;
  w.str(tag::Snapshot::PatientId, patientId);
  optStr(w, tag::Snapshot::DisplayName, displayName);
  for (const auto& med : meds) w.msg(tag::Snapshot::Med, med.encode());
  w.u64(tag::Snapshot::UpdatedAtMs, static_cast<uint64_t>(updatedAtMs));
  if (tzOffsetMin != 0) w.i64(tag::Snapshot::TzOffsetMin, tzOffsetMin);
  return w;
}

int64_t Snapshot::localDay(int64_t nowMs) const {
  return Clock::floorDiv(nowMs + int64_t{tzOffsetMin} * kMsPerMinute, kMsPerDay);
}

Result<Snapshot> Snapshot::decode(const codec::Message& m) {
  DV_TRY(m.expectOnly({tag::Snapshot::PatientId, tag::Snapshot::DisplayName, tag::Snapshot::Med,
                       tag::Snapshot::UpdatedAtMs, tag::Snapshot::TzOffsetMin}));
  Snapshot s;
  DV_ASSIGN(s.patientId, idField(m, tag::Snapshot::PatientId, false, "patient id"));
  DV_ASSIGN(s.displayName, text(m, tag::Snapshot::DisplayName, kMaxDisplayName, false, "display name"));
  DV_ASSIGN(uint64_t updated, m.u64Or(tag::Snapshot::UpdatedAtMs, 0));
  s.updatedAtMs = static_cast<int64_t>(updated);
  DV_ASSIGN(int64_t tz, m.i64Or(tag::Snapshot::TzOffsetMin, 0));
  if (tz < -14 * 60 || tz > 14 * 60) return bad("time zone offset is out of range");
  s.tzOffsetMin = static_cast<int32_t>(tz);
  DV_ASSIGN(auto meds, m.msgs(tag::Snapshot::Med));
  if (meds.size() > kMaxMeds) return fail(Err::LIMIT, "too many medications");
  std::set<std::string> seen;
  for (const auto& mm : meds) {
    DV_ASSIGN(auto med, MedRecord::decode(mm));
    if (!seen.insert(med.id).second) return bad("duplicate medication id");
    s.meds.push_back(std::move(med));
  }
  return s;
}

// --- Invite -----------------------------------------------------------------------------------

Bytes Invite::toToken(const crypto::SigningKey& signer) const {
  codec::Writer body;
  body.str(tag::Invite::PatientId, patientId)
      .u64(tag::Invite::Role, static_cast<uint64_t>(role))
      .u64(tag::Invite::Scopes, scopes)
      .u64(tag::Invite::ExpiresAtMs, static_cast<uint64_t>(expiresAtMs))
      .bytes(tag::Invite::Nonce, view(nonce))
      .u64(tag::Invite::GrantDays, grantDays);
  const Bytes encoded = std::move(body.finish()).value();
  Bytes signedMsg(kInviteDomain.begin(), kInviteDomain.end());
  append(signedMsg, view(encoded));
  const auto sig = signer.sign(view(signedMsg));
  codec::Writer token;
  token.bytes(tag::Token::Body, view(encoded)).bytes(tag::Token::Signature, {sig.data(), sig.size()});
  return std::move(token.finish()).value();
}

Result<Invite> Invite::fromToken(ByteView token, const crypto::PublicKey& signerKey) {
  if (token.size() > 1024) return bad("invite is malformed");
  DV_ASSIGN(auto outer, codec::Message::parse(token));
  DV_TRY(outer.expectOnly({tag::Token::Body, tag::Token::Signature}));
  DV_ASSIGN(Bytes body, outer.bytes(tag::Token::Body));
  DV_ASSIGN(Bytes sig, outer.bytes(tag::Token::Signature));
  Bytes signedMsg(kInviteDomain.begin(), kInviteDomain.end());
  append(signedMsg, view(body));
  if (!crypto::verify({signerKey.data(), signerKey.size()}, view(signedMsg), view(sig))) {
    return fail(Err::UNAUTHORIZED, "invite signature is not valid");
  }
  DV_ASSIGN(auto m, codec::Message::parse(view(body)));
  Invite inv;
  DV_ASSIGN(inv.patientId, idField(m, tag::Invite::PatientId, true, "patient id"));
  DV_ASSIGN(inv.role, roleField(m, tag::Invite::Role));
  DV_ASSIGN(uint64_t scopes, m.u64(tag::Invite::Scopes));
  DV_ASSIGN(uint64_t expires, m.u64(tag::Invite::ExpiresAtMs));
  DV_ASSIGN(inv.nonce, m.bytes(tag::Invite::Nonce));
  DV_ASSIGN(uint64_t days, number(m, tag::Invite::GrantDays, 1, kMaxGrantDays, 0, "grant days"));
  inv.scopes = static_cast<uint32_t>(scopes);
  inv.expiresAtMs = static_cast<int64_t>(expires);
  inv.grantDays = static_cast<uint32_t>(days);
  if (inv.nonce.size() != 16 || !isProviderRole(inv.role) || (inv.scopes & ~scopesAllowedFor(inv.role)) != 0 ||
      (inv.scopes & Scope::READ_MEDS) == 0) {
    return bad("invite is malformed");
  }
  return inv;
}

}  // namespace dosely::domain
