// End-to-end: real requests through the Dispatcher against an on-disk vault.
// The authorization matrix lives here — every "no" is as important as the "yes".

#include <filesystem>
#include <optional>

#include "harness.hpp"
#include "service/dispatcher.hpp"

using namespace dosely;
namespace fs = std::filesystem;
namespace tag = proto::tag;
namespace Scope = proto::Scope;
using proto::Cmd;
using proto::Purpose;
using proto::Role;
using proto::RxStatus;

namespace {

constexpr int64_t kStart = 1'760'000'000'000;  // Oct 2025

/** A valid NPI built from a 9-digit base by choosing its check digit. */
std::string npi(std::string base) {
  for (char d = '0'; d <= '9'; ++d) {
    if (domain::isValidNpi(base + d)) return base + d;
  }
  std::abort();
}

struct Reply {
  Err status = Err::INTERNAL;
  std::string error;
  codec::Message result;
  bool ok() const { return status == Err::OK; }
};

class Env {
 public:
  explicit Env(const std::string& name, bool autoVerify = true) : autoVerify_(autoVerify) {
    dir_ = fs::current_path() / name;
    fs::remove_all(dir_);
    fs::create_directories(dir_);
    if (!store::MasterKey::createKeyFile(dir_ / "vault.key").isOk()) std::abort();
    master_.emplace(store::MasterKey::fromKeyFile(dir_ / "vault.key").value());
    open();
  }

  void reopen() {
    dispatcher_.reset();
    vault_.reset();
    open();
  }

  Reply call(Role role, const std::string& actor, Cmd cmd, const codec::Writer& args = codec::Writer{},
             std::optional<Purpose> purpose = std::nullopt, int64_t stepUpAtMs = 0) {
    codec::Writer a;
    a.str(tag::Actor::Id, actor).u64(tag::Actor::Role, static_cast<uint64_t>(role));
    codec::Writer ctx;
    const Purpose p = purpose.value_or(role == Role::PATIENT ? Purpose::PATIENT_REQUEST : Purpose::TREATMENT);
    ctx.u64(tag::Ctx::Purpose, static_cast<uint64_t>(p));
    if (stepUpAtMs) ctx.u64(tag::Ctx::StepUpAtMs, static_cast<uint64_t>(stepUpAtMs));
    const uint64_t id = ++nextId_;
    codec::Writer req;
    req.u64(tag::Req::RequestId, id).u64(tag::Req::Command, static_cast<uint64_t>(cmd)).msg(tag::Req::Actor, a);
    req.msg(tag::Req::Args, args).msg(tag::Req::Context, ctx);
    return decode(dispatcher_->handle(view(*req.finish())), id);
  }

  Reply raw(ByteView payload) { return decode(dispatcher_->handle(payload), 0); }

  /** Try to open a second vault on the same data while this one is running. */
  Status openSecondInstance() {
    return service::Vault::open({dir_ / "data", autoVerify_}, *master_, clock).status();
  }

  FixedClock clock{kStart};
  int64_t today() const { return clock.today(); }
  service::Vault& vault() { return *vault_; }

 private:
  void open() {
    vault_ = std::move(service::Vault::open({dir_ / "data", autoVerify_}, *master_, clock)).value();
    dispatcher_ = std::make_unique<service::Dispatcher>(*vault_, service::allCommands());
  }

  static Reply decode(const Bytes& payload, uint64_t expectedId) {
    auto m = codec::Message::parse(view(payload));
    if (!m) std::abort();
    Reply r;
    if (*m->u64(tag::Resp::RequestId) != expectedId) std::abort();
    r.status = static_cast<Err>(*m->u64(tag::Resp::Status));
    r.error = *m->strOr(tag::Resp::Error, "");
    if (m->has(tag::Resp::Result)) r.result = *m->msg(tag::Resp::Result);
    return r;
  }

  fs::path dir_;
  bool autoVerify_;
  std::optional<store::MasterKey> master_;
  std::unique_ptr<service::Vault> vault_;
  std::unique_ptr<service::Dispatcher> dispatcher_;
  uint64_t nextId_ = 0;
};

// --- Request builders -----------------------------------------------------------

codec::Writer snapshotArgs(int64_t today) {
  codec::Writer atorva;
  atorva.str(tag::Med::Id, "m-atorva").str(tag::Med::Name, "Atorvastatin").str(tag::Med::Strength, "20 mg");
  atorva.str(tag::Med::Form, "tablet").u64(tag::Med::SlotsPerDay, 1).u64(tag::Med::UnitsPerDoseMilli, 1000);
  atorva.u64(tag::Med::OnHandMilli, 5000).u64(tag::Med::AsOfDay, static_cast<uint64_t>(today)).u64(tag::Med::LeadDays, 7);
  atorva.u64(tag::Med::SelfAdherencePct, 70).u64(tag::Med::DosesDue, 20).u64(tag::Med::DosesTaken, 14);
  atorva.u64(tag::Med::DosesLate, 6).i64(tag::Med::AvgDelayMin, 45).boolean(tag::Med::SupplyTracked, true);
  codec::Writer metformin;
  metformin.str(tag::Med::Id, "m-metformin").str(tag::Med::Name, "Metformin").u64(tag::Med::SlotsPerDay, 2);
  metformin.u64(tag::Med::OnHandMilli, 40'000).u64(tag::Med::AsOfDay, static_cast<uint64_t>(today));
  metformin.boolean(tag::Med::SupplyTracked, true);
  codec::Writer snap;
  snap.str(tag::Snapshot::DisplayName, "Alex Rivera").msg(tag::Snapshot::Med, atorva).msg(tag::Snapshot::Med, metformin);
  codec::Writer args;
  args.msg(tag::Arg::Record, snap);
  return args;
}

codec::Writer registerArgs(Role role, const char* name, const std::string& npiValue) {
  codec::Writer p;
  p.u64(tag::Provider::Role, static_cast<uint64_t>(role)).str(tag::Provider::Name, name).str(tag::Provider::Npi, npiValue);
  codec::Writer args;
  args.msg(tag::Arg::Record, p);
  return args;
}

codec::Writer inviteArgs(Role role, uint32_t scopes) {
  codec::Writer args;
  args.u64(tag::Arg::Role, static_cast<uint64_t>(role)).u64(tag::Arg::Scopes, scopes);
  return args;
}

codec::Writer tokenArgs(const Bytes& token) {
  codec::Writer args;
  args.bytes(tag::Arg::Token, view(token));
  return args;
}

codec::Writer patientArgs(const std::string& patientId) {
  codec::Writer args;
  args.str(tag::Arg::PatientId, patientId);
  return args;
}

codec::Writer rxDraft(const std::string& patient, const std::string& pharmacy, bool controlled = false, uint64_t refills = 1) {
  codec::Writer rx;
  rx.str(tag::Rx::PatientId, patient).str(tag::Rx::PharmacyId, pharmacy).str(tag::Rx::MedId, "m-atorva");
  rx.str(tag::Rx::DrugName, "Atorvastatin").str(tag::Rx::Rxcui, "617312").str(tag::Rx::Strength, "20 mg");
  rx.str(tag::Rx::Form, "tablet").str(tag::Rx::Sig, "Take 1 tablet by mouth at bedtime");
  rx.u64(tag::Rx::QuantityMilli, 30'000).u64(tag::Rx::DaysSupply, 30).u64(tag::Rx::Refills, refills);
  rx.boolean(tag::Rx::Controlled, controlled);
  codec::Writer args;
  args.msg(tag::Arg::Record, rx);
  return args;
}

codec::Writer statusArgs(const std::string& rxId, RxStatus s) {
  codec::Writer args;
  args.str(tag::Arg::RxId, rxId).u64(tag::Arg::Status, static_cast<uint64_t>(s));
  return args;
}

const std::string kPatient = "pat-1";
const std::string kPharmacy = "pharm-1";
const std::string kDoctor = "doc-1";

/** Patient shares data; a pharmacy and a prescriber register and connect. */
void connectAll(Env& env, uint32_t pharmacyScopes = Scope::READ_REFILL | Scope::RECEIVE_RX | Scope::READ_ADHERENCE,
                uint32_t doctorScopes = Scope::PRESCRIBE | Scope::READ_ADHERENCE | Scope::READ_REFILL | Scope::READ_TIMING) {
  REQUIRE(env.call(Role::PATIENT, kPatient, Cmd::SNAPSHOT_PUT, snapshotArgs(env.today())).ok());
  REQUIRE(env.call(Role::PHARMACY, kPharmacy, Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "Mercy Pharmacy", "1234567893")).ok());
  REQUIRE(env.call(Role::PRESCRIBER, kDoctor, Cmd::PROVIDER_REGISTER, registerArgs(Role::PRESCRIBER, "Dr. Lee", npi("198765432"))).ok());
  auto inv = env.call(Role::PATIENT, kPatient, Cmd::INVITE_CREATE, inviteArgs(Role::PHARMACY, pharmacyScopes));
  REQUIRE(inv.ok());
  REQUIRE(env.call(Role::PHARMACY, kPharmacy, Cmd::INVITE_REDEEM, tokenArgs(*inv.result.bytes(tag::Invite::Token))).ok());
  inv = env.call(Role::PATIENT, kPatient, Cmd::INVITE_CREATE, inviteArgs(Role::PRESCRIBER, doctorScopes));
  REQUIRE(inv.ok());
  REQUIRE(env.call(Role::PRESCRIBER, kDoctor, Cmd::INVITE_REDEEM, tokenArgs(*inv.result.bytes(tag::Invite::Token))).ok());
}

std::string prescribe(Env& env, uint64_t refills = 1) {
  auto rx = env.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy, false, refills), Purpose::TREATMENT,
                     env.clock.nowMs());
  REQUIRE(rx.ok());
  return *rx.result.str(tag::Rx::Id);
}

}  // namespace

TEST(vault_end_to_end_prescription_lifecycle) {
  Env env("vault_e2e");
  connectAll(env);

  // The prescriber sees the patient's summary, including connected pharmacies.
  auto summary = env.call(Role::PRESCRIBER, kDoctor, Cmd::PATIENT_SUMMARY, patientArgs(kPatient));
  REQUIRE(summary.ok());
  CHECK_EQ(*summary.result.str(tag::Summary::DisplayName), std::string("Alex Rivera"));
  auto pharmacies = summary.result.msgs(tag::Summary::Pharmacy);
  REQUIRE(pharmacies.isOk() && pharmacies->size() == 1);
  CHECK_EQ(*(*pharmacies)[0].str(tag::PharmacyRef::Name), std::string("Mercy Pharmacy"));

  // Prescribing needs a fresh re-authentication.
  CHECK_EQ(env.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy)).status, Err::STEP_UP_REQUIRED);
  auto rx = env.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy), Purpose::TREATMENT, env.clock.nowMs());
  REQUIRE(rx.ok());
  const std::string rxId = *rx.result.str(tag::Rx::Id);
  CHECK(*rx.result.boolean(tag::Rx::SignatureValid));
  CHECK_EQ(*rx.result.u64(tag::Rx::Status), static_cast<uint64_t>(RxStatus::SENT));

  // It lands at the top of the pharmacy's worklist.
  auto work = env.call(Role::PHARMACY, kPharmacy, Cmd::WORKLIST);
  REQUIRE(work.ok());
  auto items = work.result.msgs(tag::List::Item);
  REQUIRE(items.isOk() && !items->empty());
  CHECK_EQ(*(*items)[0].u64(tag::Work::Kind), static_cast<uint64_t>(proto::WorkKind::NEW_RX));
  CHECK_EQ(*(*items)[0].str(tag::Work::RxId), rxId);

  // Pharmacy works it through to pickup; that records a fill.
  CHECK(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::RECEIVED)).ok());
  CHECK(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::READY)).ok());
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::RECEIVED)).status, Err::CONFLICT);
  CHECK(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::PICKED_UP)).ok());
  auto mine = env.call(Role::PATIENT, kPatient, Cmd::PATIENT_SUMMARY, patientArgs(kPatient));
  REQUIRE(mine.ok());
  auto meds = mine.result.msgs(tag::Summary::Med);
  REQUIRE(meds.isOk());
  CHECK_EQ(*(*meds)[0].u64(tag::MedSummary::FillCount), uint64_t{1});

  // One refill is allowed, then the patient must go back to the prescriber.
  CHECK(env.call(Role::PATIENT, kPatient, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::SENT)).ok());
  CHECK(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::PICKED_UP)).ok());
  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::SENT)).status, Err::CONFLICT);
  auto got = env.call(Role::PATIENT, kPatient, Cmd::RX_GET, [&] {
    codec::Writer a;
    a.str(tag::Arg::RxId, rxId);
    return a;
  }());
  REQUIRE(got.ok());
  CHECK_EQ(*got.result.u64(tag::Rx::RefillsUsed), uint64_t{1});

  // Everything survives a restart.
  env.reopen();
  auto again = env.call(Role::PHARMACY, kPharmacy, Cmd::RX_LIST);
  REQUIRE(again.ok());
  CHECK_EQ(again.result.msgs(tag::List::Item)->size(), size_t{1});
}

TEST(vault_access_requires_consent_and_hides_existence) {
  Env env("vault_consent");
  connectAll(env);
  REQUIRE(env.call(Role::PHARMACY, "pharm-2", Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "Other", npi("111111111"))).ok());

  // Unconnected provider: same answer for a real and a made-up patient.
  const auto real = env.call(Role::PHARMACY, "pharm-2", Cmd::PATIENT_SUMMARY, patientArgs(kPatient));
  const auto fake = env.call(Role::PHARMACY, "pharm-2", Cmd::PATIENT_SUMMARY, patientArgs("nobody"));
  CHECK_EQ(real.status, Err::FORBIDDEN);
  CHECK_EQ(fake.status, Err::FORBIDDEN);
  CHECK_EQ(real.error, fake.error);

  // Patients only see themselves; unregistered providers get nothing.
  CHECK_EQ(env.call(Role::PATIENT, "pat-2", Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::FORBIDDEN);
  CHECK_EQ(env.call(Role::PHARMACY, "ghost", Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::NOT_FOUND);
  // A role claim must match the registered provider.
  CHECK_EQ(env.call(Role::PRESCRIBER, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::FORBIDDEN);

  // Providers must state a purpose of use.
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient), Purpose::PATIENT_REQUEST).status,
           Err::FORBIDDEN);

  // Minimum necessary: this pharmacy wasn't given dose timing.
  auto view1 = env.call(Role::PHARMACY, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient));
  REQUIRE(view1.ok());
  auto meds = view1.result.msgs(tag::Summary::Med);
  REQUIRE(meds.isOk() && !meds->empty());
  CHECK((*meds)[0].has(tag::MedSummary::Level));
  CHECK(!(*meds)[0].has(tag::MedSummary::DosesLate));
  CHECK(!(*meds)[0].has(tag::MedSummary::AvgDelayMin));
  CHECK(!view1.result.has(tag::Summary::Pharmacy));  // only prescribers pick pharmacies

  // Revocation takes effect immediately.
  auto grants = env.call(Role::PATIENT, kPatient, Cmd::GRANT_LIST);
  REQUIRE(grants.ok());
  std::string pharmacyGrant;
  const auto grantItems = grants.result.msgs(tag::List::Item);  // keep alive for the loop
  REQUIRE(grantItems.isOk());
  for (const auto& g : *grantItems) {
    if (*g.str(tag::Grant::ProviderId) == kPharmacy) pharmacyGrant = *g.str(tag::Grant::Id);
  }
  REQUIRE(!pharmacyGrant.empty());
  codec::Writer revoke;
  revoke.str(tag::Arg::GrantId, pharmacyGrant);
  CHECK_EQ(env.call(Role::PATIENT, "pat-2", Cmd::GRANT_REVOKE, revoke).status, Err::NOT_FOUND);  // not theirs
  CHECK(env.call(Role::PATIENT, kPatient, Cmd::GRANT_REVOKE, revoke).ok());
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::FORBIDDEN);

  // Grants expire on their own.
  env.clock.advance(181 * kMsPerDay);
  CHECK_EQ(env.call(Role::PRESCRIBER, kDoctor, Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::FORBIDDEN);
}

TEST(vault_invites_are_single_use_expiring_and_unforgeable) {
  Env env("vault_invites");
  REQUIRE(env.call(Role::PATIENT, kPatient, Cmd::SNAPSHOT_PUT, snapshotArgs(env.today())).ok());
  REQUIRE(env.call(Role::PHARMACY, kPharmacy, Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "Mercy", "1234567893")).ok());
  REQUIRE(env.call(Role::PRESCRIBER, kDoctor, Cmd::PROVIDER_REGISTER, registerArgs(Role::PRESCRIBER, "Dr. Lee", npi("198765432"))).ok());

  auto inv = env.call(Role::PATIENT, kPatient, Cmd::INVITE_CREATE, inviteArgs(Role::PHARMACY, Scope::READ_REFILL));
  REQUIRE(inv.ok());
  Bytes token = *inv.result.bytes(tag::Invite::Token);

  // Wrong kind of provider, forged bytes, then the real redemption and a replay.
  CHECK_EQ(env.call(Role::PRESCRIBER, kDoctor, Cmd::INVITE_REDEEM, tokenArgs(token)).status, Err::FORBIDDEN);
  Bytes forged = token;
  forged[20] ^= 1;
  CHECK(!env.call(Role::PHARMACY, kPharmacy, Cmd::INVITE_REDEEM, tokenArgs(forged)).ok());
  CHECK(env.call(Role::PHARMACY, kPharmacy, Cmd::INVITE_REDEEM, tokenArgs(token)).ok());
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::INVITE_REDEEM, tokenArgs(token)).status, Err::CONFLICT);

  // Expiry (default 15 minutes).
  inv = env.call(Role::PATIENT, kPatient, Cmd::INVITE_CREATE, inviteArgs(Role::PRESCRIBER, Scope::PRESCRIBE));
  REQUIRE(inv.ok());
  env.clock.advance(16 * kMsPerMinute);
  CHECK_EQ(env.call(Role::PRESCRIBER, kDoctor, Cmd::INVITE_REDEEM, tokenArgs(*inv.result.bytes(tag::Invite::Token))).status,
           Err::EXPIRED);

  // Scopes that don't fit the role are refused at creation.
  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::INVITE_CREATE, inviteArgs(Role::PHARMACY, Scope::PRESCRIBE)).status,
           Err::BAD_REQUEST);
  // Providers can't mint invites.
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::INVITE_CREATE, inviteArgs(Role::PHARMACY, Scope::READ_MEDS)).status,
           Err::FORBIDDEN);
}

TEST(vault_prescribing_guards) {
  Env env("vault_rx_guards", /*autoVerify=*/false);
  connectAll(env);
  const int64_t now = env.clock.nowMs();

  CHECK_EQ(env.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy), Purpose::TREATMENT, now).status,
           Err::UNVERIFIED);
  // Pharmacies can't prescribe; patients can't move an Rx to READY.
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy), Purpose::TREATMENT, now).status,
           Err::FORBIDDEN);

  Env verified("vault_rx_guards_verified");
  connectAll(verified, Scope::READ_REFILL);  // pharmacy NOT allowed to receive prescriptions
  const int64_t t = verified.clock.nowMs();
  CHECK_EQ(verified.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy, true), Purpose::TREATMENT, t).status,
           Err::UNSUPPORTED);  // controlled substance
  CHECK_EQ(verified.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy), Purpose::TREATMENT, t).status,
           Err::FORBIDDEN);  // pharmacy can't receive
  CHECK_EQ(verified.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy), Purpose::OPERATIONS, t).status,
           Err::FORBIDDEN);  // prescribing is treatment
  // A stale re-authentication doesn't count.
  CHECK_EQ(verified.call(Role::PRESCRIBER, kDoctor, Cmd::RX_CREATE, rxDraft(kPatient, kPharmacy), Purpose::TREATMENT,
                         t - 6 * kMsPerMinute)
               .status,
           Err::STEP_UP_REQUIRED);

  Env full("vault_rx_guards_full");
  connectAll(full);
  const std::string rxId = prescribe(full);
  CHECK_EQ(full.call(Role::PATIENT, kPatient, Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::READY)).status, Err::CONFLICT);
  CHECK_EQ(full.call(Role::PHARMACY, "pharm-x", Cmd::RX_SET_STATUS, statusArgs(rxId, RxStatus::READY)).status, Err::NOT_FOUND);
}

TEST(vault_provider_registration_rules) {
  Env env("vault_register");
  CHECK_EQ(env.call(Role::PHARMACY, "p1", Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "A", "1234567890")).status,
           Err::BAD_REQUEST);  // bad NPI check digit
  CHECK(env.call(Role::PHARMACY, "p1", Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "A", "1234567893")).ok());
  CHECK_EQ(env.call(Role::PHARMACY, "p2", Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "B", "1234567893")).status,
           Err::CONFLICT);  // NPI already claimed
  CHECK_EQ(env.call(Role::PATIENT, "p3", Cmd::PROVIDER_REGISTER, registerArgs(Role::PHARMACY, "C", npi("222222222"))).status,
           Err::FORBIDDEN);
  CHECK_EQ(env.call(Role::PHARMACY, "p4", Cmd::PROVIDER_REGISTER, registerArgs(Role::PRESCRIBER, "D", npi("333333333"))).status,
           Err::BAD_REQUEST);  // role must match the acting role
}

TEST(vault_patient_access_log_shows_views_and_denials) {
  Env env("vault_audit");
  connectAll(env);
  REQUIRE(env.call(Role::PHARMACY, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).ok());
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient), Purpose::PATIENT_REQUEST).status,
           Err::FORBIDDEN);

  auto log = env.call(Role::PATIENT, kPatient, Cmd::AUDIT_QUERY);
  REQUIRE(log.ok());
  auto entries = log.result.msgs(tag::List::Item);
  REQUIRE(entries.isOk() && entries->size() >= 2);
  const auto& denied = (*entries)[0];  // newest first
  CHECK_EQ(*denied.u64(tag::Audit::Outcome), static_cast<uint64_t>(Err::FORBIDDEN));
  CHECK_EQ(*denied.str(tag::Audit::ActorName), std::string("Mercy Pharmacy"));
  const auto& viewed = (*entries)[1];
  CHECK_EQ(*viewed.u64(tag::Audit::Outcome), uint64_t{0});
  CHECK_EQ(*viewed.u64(tag::Audit::Command), static_cast<uint64_t>(Cmd::PATIENT_SUMMARY));

  // Another patient's log doesn't include any of this.
  auto other = env.call(Role::PATIENT, "pat-2", Cmd::AUDIT_QUERY);
  REQUIRE(other.ok());
  CHECK(other.result.msgs(tag::List::Item)->empty());

  auto verify = env.call(Role::PATIENT, kPatient, Cmd::AUDIT_VERIFY);
  REQUIRE(verify.ok());
  CHECK(*verify.result.boolean(tag::Stats::AuditIntact));
}

TEST(vault_erase_is_step_up_gated_and_crypto_shreds) {
  Env env("vault_erase");
  connectAll(env);
  prescribe(env);

  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::PATIENT_ERASE).status, Err::STEP_UP_REQUIRED);
  REQUIRE(env.call(Role::PATIENT, kPatient, Cmd::PATIENT_ERASE, codec::Writer{}, std::nullopt, env.clock.nowMs()).ok());

  CHECK(!env.vault().hasPatient(kPatient));
  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::NOT_FOUND);
  CHECK_EQ(env.call(Role::PHARMACY, kPharmacy, Cmd::PATIENT_SUMMARY, patientArgs(kPatient)).status, Err::FORBIDDEN);
  CHECK(env.call(Role::PHARMACY, kPharmacy, Cmd::RX_LIST).result.msgs(tag::List::Item)->empty());

  env.reopen();
  CHECK(!env.vault().hasPatient(kPatient));
  CHECK(env.call(Role::PATIENT, kPatient, Cmd::GRANT_LIST).result.msgs(tag::List::Item)->empty());
  // The patient can start over later.
  CHECK(env.call(Role::PATIENT, kPatient, Cmd::SNAPSHOT_PUT, snapshotArgs(env.today())).ok());
}

TEST(vault_data_directory_is_single_writer) {
  Env env("vault_lock");
  CHECK_ERR(env.openSecondInstance(), Err::CONFLICT);
  env.reopen();  // releasing and re-acquiring works
  CHECK(env.call(Role::PATIENT, kPatient, Cmd::SNAPSHOT_PUT, snapshotArgs(env.today())).ok());
}

TEST(vault_rejects_malformed_requests) {
  Env env("vault_malformed");
  CHECK_EQ(env.raw(view(Bytes{0xde, 0xad, 0xbe, 0xef})).status, Err::BAD_REQUEST);
  CHECK_EQ(env.call(Role::PATIENT, kPatient, static_cast<Cmd>(999)).status, Err::UNSUPPORTED);
  CHECK_EQ(env.call(Role::SYSTEM, "system", Cmd::SNAPSHOT_PUT, snapshotArgs(env.today())).status, Err::FORBIDDEN);
  CHECK(env.call(Role::SYSTEM, "system", Cmd::STATS).ok());
  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::STATS).status, Err::FORBIDDEN);
  // Unknown argument fields are rejected, not ignored.
  codec::Writer extra;
  extra.str(tag::Arg::PatientId, kPatient).u64(tag::Arg::Limit, 1);
  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::PATIENT_SUMMARY, extra).status, Err::BAD_REQUEST);
  // A snapshot claiming someone else's identity is refused.
  codec::Writer snap;
  snap.str(tag::Snapshot::PatientId, "someone-else");
  codec::Writer args;
  args.msg(tag::Arg::Record, snap);
  CHECK_EQ(env.call(Role::PATIENT, kPatient, Cmd::SNAPSHOT_PUT, args).status, Err::FORBIDDEN);
  auto hello = env.call(Role::PATIENT, kPatient, Cmd::HELLO);
  REQUIRE(hello.ok());
  CHECK_EQ(hello.result.bytes(tag::Hello::SystemKey)->size(), size_t{32});
}
