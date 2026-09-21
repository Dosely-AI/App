#include "service/analytics.hpp"

namespace dosely::service {

namespace tag = proto::tag;
namespace Scope = proto::Scope;
using namespace ecs;

namespace {
constexpr uint32_t kAnalysisScopes = Scope::READ_ADHERENCE | Scope::READ_REFILL | Scope::READ_TIMING;
}

Entity CareAnalytics::addEmptyPatient(const std::string& patientId) {
  const Entity p = registry_.create();
  registry_.add(p, PatientInfo{patientId, ""});
  medsByPatient_[p.index];
  return p;
}

Entity CareAnalytics::addPatient(const domain::Snapshot& snapshot, const std::vector<domain::Fill>& fills,
                                 uint32_t scopes) {
  const Entity patient = registry_.create();
  registry_.add(patient, PatientInfo{snapshot.patientId, snapshot.displayName});
  registry_.add(patient, LocalDay{snapshot.localDay(nowMs_)});
  auto& meds = medsByPatient_[patient.index];

  for (const auto& m : snapshot.meds) {
    const Entity e = registry_.create();
    meds.push_back(e);
    registry_.add(e, Owner{patient});
    registry_.add(e, MedInfo{m.id, m.name, m.strength, m.form, m.asNeeded});

    if (scopes & Scope::READ_REFILL) {
      registry_.add(e, Schedule{m.slotsPerDay, m.daysMask, m.unitsPerDoseMilli, m.asNeeded});
      if (m.supplyTracked) registry_.add(e, Supply{m.onHandMilli, m.asOfDay, m.leadDays});
    }
    if (scopes & Scope::READ_ADHERENCE) {
      registry_.add(e, SelfReport{m.selfAdherencePct, m.dosesDue, m.dosesTaken});
      FillHistory history;
      for (const auto& f : fills) {
        const bool linked = (!f.medId.empty() && f.medId == m.id) || (!m.rxId.empty() && f.rxId == m.rxId);
        if (linked) history.fills.push_back({f.day, f.daysSupply});
      }
      registry_.add(e, std::move(history));
    }
    if (scopes & Scope::READ_TIMING) registry_.add(e, Timing{m.dosesTaken, m.dosesLate, m.avgDelayMin});
  }
  return patient;
}

void CareAnalytics::addPendingRx(Entity patient, PendingRxItem item) {
  if (!registry_.has<PendingRx>(patient)) registry_.add(patient, PendingRx{});
  registry_.get<PendingRx>(patient)->items.push_back(std::move(item));
}

void CareAnalytics::run() {
  static const Pipeline pipeline = Pipeline::standard();
  pipeline.run(registry_, ctx_);
}

codec::Writer CareAnalytics::medSummary(Entity e, uint32_t scopes) {
  codec::Writer w;
  const auto* info = registry_.get<MedInfo>(e);
  w.str(tag::MedSummary::MedId, info->medId).str(tag::MedSummary::Name, info->name);
  if (!info->strength.empty()) w.str(tag::MedSummary::Strength, info->strength);
  if (!info->form.empty()) w.str(tag::MedSummary::Form, info->form);

  const auto* forecast = registry_.get<RefillForecast>(e);
  if (forecast) {
    w.u64(tag::MedSummary::Level, static_cast<uint64_t>(forecast->level));
    if (forecast->projected) {
      w.u64(tag::MedSummary::DaysLeft, static_cast<uint64_t>(forecast->daysLeft))
          .u64(tag::MedSummary::RunOutDay, static_cast<uint64_t>(forecast->runOutDay))
          .u64(tag::MedSummary::RefillByDay, static_cast<uint64_t>(std::max<int64_t>(0, forecast->refillByDay)));
    }
  } else if (scopes & Scope::READ_REFILL) {
    w.u64(tag::MedSummary::Level, static_cast<uint64_t>(RefillLevel::UNTRACKED));
  }

  if (const auto* a = registry_.get<Adherence>(e)) {
    w.u64(tag::MedSummary::PdcPermille, a->pdcPermille).boolean(tag::MedSummary::PdcValid, a->valid);
  }
  if (scopes & kAnalysisScopes) {
    if (const auto* r = registry_.get<Risk>(e)) {
      w.u64(tag::MedSummary::RiskScore, r->score).u64(tag::MedSummary::RiskReasons, r->reasons);
    }
  }

  const auto* report = registry_.get<SelfReport>(e);
  const auto* timing = registry_.get<Timing>(e);
  if (report) {
    if (report->adherencePct) {
      w.u64(tag::MedSummary::SelfAdherencePct, *report->adherencePct);
    } else if (report->dosesDue > 0) {
      w.u64(tag::MedSummary::SelfAdherencePct, std::min<uint64_t>(100, report->dosesTaken * 100 / report->dosesDue));
    }
    w.u64(tag::MedSummary::DosesDue, report->dosesDue);
  }
  if (report || timing) w.u64(tag::MedSummary::DosesTaken, report ? report->dosesTaken : timing->dosesTaken);
  if (timing) {
    w.u64(tag::MedSummary::DosesLate, timing->dosesLate);
    if (timing->avgDelayMin) w.i64(tag::MedSummary::AvgDelayMin, *timing->avgDelayMin);
  }
  w.boolean(tag::MedSummary::AsNeeded, info->asNeeded);
  if (const auto* h = registry_.get<FillHistory>(e)) w.u64(tag::MedSummary::FillCount, h->fills.size());
  if (forecast) {
    w.u64(tag::MedSummary::RemainingMilli, forecast->remainingMilli).u64(tag::MedSummary::DailyMilli, forecast->dailyMilli);
  }
  return w;
}

codec::Writer CareAnalytics::summary(Entity patient, uint32_t scopes, int64_t updatedAtMs,
                                     const std::vector<PharmacyRef>& pharmacies) {
  codec::Writer w;
  const auto* info = registry_.get<PatientInfo>(patient);
  w.str(tag::Summary::PatientId, info->patientId);
  if (!info->displayName.empty()) w.str(tag::Summary::DisplayName, info->displayName);
  for (Entity med : medsByPatient_[patient.index]) w.msg(tag::Summary::Med, medSummary(med, scopes));

  if (scopes & kAnalysisScopes) {
    const auto* risk = registry_.get<PatientRisk>(patient);
    w.u64(tag::Summary::RiskScore, risk ? risk->score : 0).u64(tag::Summary::RiskReasons, risk ? risk->reasons : 0);
  }
  if (const auto* sync = registry_.get<SyncPlan>(patient)) {
    codec::Writer plan;
    plan.u64(tag::SyncPlan::SyncDay, static_cast<uint64_t>(sync->syncDay));
    for (const auto& s : sync->shortFills) {
      codec::Writer sf;
      sf.str(tag::ShortFill::MedId, s.medId)
          .str(tag::ShortFill::Name, s.name)
          .u64(tag::ShortFill::Days, s.days)
          .u64(tag::ShortFill::UnitsMilli, s.unitsMilli);
      plan.msg(tag::SyncPlan::ShortFill, sf);
    }
    w.msg(tag::Summary::Sync, plan);
  }
  for (const auto& ph : pharmacies) {
    codec::Writer p;
    p.str(tag::PharmacyRef::Id, ph.id).str(tag::PharmacyRef::Name, ph.name);
    if (!ph.org.empty()) p.str(tag::PharmacyRef::Org, ph.org);
    p.boolean(tag::PharmacyRef::Verified, ph.verified);
    w.msg(tag::Summary::Pharmacy, p);
  }
  if (updatedAtMs > 0) w.u64(tag::Summary::UpdatedAtMs, static_cast<uint64_t>(updatedAtMs));
  w.u64(tag::Summary::Scopes, scopes & (Scope::READ_MEDS | Scope::READ_ADHERENCE | Scope::READ_TIMING | Scope::READ_REFILL |
                                        Scope::RECEIVE_RX | Scope::PRESCRIBE));
  return w;
}

uint32_t CareAnalytics::riskScore(Entity patient) {
  const auto* risk = registry_.get<PatientRisk>(patient);
  return risk ? risk->score : 0;
}

const std::vector<WorkItem>& CareAnalytics::worklist() { return registry_.resource<Worklist>().items; }

}  // namespace dosely::service
