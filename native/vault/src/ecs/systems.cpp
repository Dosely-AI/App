#include "ecs/systems.hpp"

#include <algorithm>
#include <bit>
#include <map>

namespace dosely::ecs {

namespace Reason = proto::RiskReason;

// --- Pure analytics -------------------------------------------------------------------

RefillForecast forecastSupply(const Schedule& schedule, const Supply& supply, int64_t today) {
  RefillForecast f;
  const uint32_t daysPerWeek = schedule.daysMask == 0 ? 7 : static_cast<uint32_t>(std::popcount(schedule.daysMask & 0x7Fu));
  f.weeklyMilli = schedule.asNeeded ? 0 : uint64_t{schedule.slotsPerDay} * schedule.unitsPerDoseMilli * daysPerWeek;
  f.dailyMilli = (f.weeklyMilli + 3) / 7;

  // Units used since the count (a future count date can't add stock).
  const int64_t elapsed = std::max<int64_t>(0, today - supply.asOfDay);
  if (f.weeklyMilli == 0) {
    f.level = RefillLevel::UNKNOWN;  // tracked, but nothing is consumed on a schedule
    f.remainingMilli = supply.onHandMilli;
    return f;
  }

  // Work in sevenths of a milli-unit so a Mon/Wed/Fri schedule stays exact.
  const auto weekly = static_cast<int64_t>(f.weeklyMilli);
  const int64_t remaining7 = static_cast<int64_t>(supply.onHandMilli) * 7 - elapsed * weekly;
  f.projected = true;
  if (remaining7 <= 0) {
    f.level = RefillLevel::OUT;
    f.remainingMilli = 0;
    f.daysLeft = 0;
  } else {
    f.remainingMilli = static_cast<uint64_t>((remaining7 + 3) / 7);
    f.daysLeft = remaining7 / weekly;
    f.level = f.daysLeft <= supply.leadDays ? RefillLevel::SOON : RefillLevel::OK;
  }
  f.runOutDay = today + f.daysLeft;
  f.refillByDay = f.runOutDay - supply.leadDays;
  return f;
}

Adherence proportionOfDaysCovered(std::vector<FillEvent> fills, int64_t today, int64_t windowDays) {
  Adherence a;
  a.fills = static_cast<uint32_t>(fills.size());
  if (fills.empty() || windowDays <= 0) return a;
  std::sort(fills.begin(), fills.end(), [](const FillEvent& x, const FillEvent& y) { return x.day < y.day; });

  const int64_t periodEnd = today;
  const int64_t periodStart = std::max(fills.front().day, today - windowDays + 1);
  if (periodStart > periodEnd) return a;

  int64_t covered = 0;
  int64_t cursor = fills.front().day;
  for (const auto& f : fills) {
    // An early refill starts after the previous supply runs out (carry-over).
    const int64_t start = std::max(f.day, cursor);
    const int64_t end = start + f.daysSupply - 1;
    cursor = end + 1;
    const int64_t lo = std::max(start, periodStart);
    const int64_t hi = std::min(end, periodEnd);
    if (hi >= lo) covered += hi - lo + 1;
  }
  const int64_t days = periodEnd - periodStart + 1;
  a.pdcPermille = static_cast<uint32_t>(std::min<int64_t>(1000, covered * 1000 / days));
  a.valid = fills.size() >= 2;
  return a;
}

Risk assessRisk(const RefillForecast* forecast, const Adherence* adherence, const SelfReport* report,
                const Timing* timing) {
  constexpr uint64_t kMinSample = 5;  // don't judge on a handful of doses
  Risk r;
  auto add = [&](uint32_t points, uint32_t reason) {
    r.score += points;
    r.reasons |= reason;
  };
  if (forecast && forecast->level == RefillLevel::OUT) add(4, Reason::REFILL_OVERDUE);
  else if (forecast && forecast->level == RefillLevel::SOON) add(1, Reason::REFILL_SOON);
  if (adherence && adherence->valid && adherence->pdcPermille < kPdcThresholdPermille) add(3, Reason::LOW_PDC);
  if (timing && timing->dosesTaken >= kMinSample && timing->dosesLate * 1000 > timing->dosesTaken * 300) {
    add(1, Reason::LATE_DOSES);
  }
  if (report && report->dosesDue >= kMinSample) {
    const uint64_t pct = report->adherencePct ? *report->adherencePct : report->dosesTaken * 100 / report->dosesDue;
    if (pct < 80) add(3, Reason::MISSED_DOSES);
  }
  r.score = std::min<uint32_t>(r.score, 10);
  return r;
}

// --- Systems -------------------------------------------------------------------------------

int64_t todayFor(Registry& registry, Entity med, const SystemContext& ctx) {
  const auto* owner = registry.get<Owner>(med);
  const auto* day = owner ? registry.get<LocalDay>(owner->patient) : nullptr;
  return day ? day->today : ctx.today;
}

void SupplySystem::run(Registry& registry, const SystemContext& ctx) const {
  registry.each<Schedule, Supply>([&](Entity e, Schedule& schedule, Supply& supply) {
    registry.add(e, forecastSupply(schedule, supply, todayFor(registry, e, ctx)));
  });
}

void AdherenceSystem::run(Registry& registry, const SystemContext& ctx) const {
  registry.each<FillHistory, MedInfo>([&](Entity e, FillHistory& history, MedInfo& info) {
    if (info.asNeeded) return;  // PDC is defined for scheduled therapy only
    registry.add(e, proportionOfDaysCovered(history.fills, todayFor(registry, e, ctx)));
  });
}

void RiskSystem::run(Registry& registry, const SystemContext&) const {
  registry.each<MedInfo, Owner>([&](Entity e, MedInfo&, Owner& owner) {
    const Risk risk =
        assessRisk(registry.get<RefillForecast>(e), registry.get<Adherence>(e), registry.get<SelfReport>(e), registry.get<Timing>(e));
    registry.add(e, risk);
    if (!registry.has<PatientRisk>(owner.patient)) registry.add(owner.patient, PatientRisk{});
    PatientRisk& pr = *registry.get<PatientRisk>(owner.patient);
    pr.score = std::max(pr.score, risk.score);
    pr.reasons |= risk.reasons;
  });
}

void MedSyncSystem::run(Registry& registry, const SystemContext& ctx) const {
  struct Candidate {
    const MedInfo* info;
    const RefillForecast* forecast;
  };
  std::map<uint32_t, std::pair<Entity, std::vector<Candidate>>> byPatient;
  registry.each<RefillForecast, MedInfo, Owner>([&](Entity e, RefillForecast& f, MedInfo& info, Owner& owner) {
    if (!f.projected || info.asNeeded || f.runOutDay > todayFor(registry, e, ctx) + kSyncHorizonDays) return;
    auto& slot = byPatient[owner.patient.index];
    slot.first = owner.patient;
    slot.second.push_back({&info, &f});
  });

  for (auto& [index, entry] : byPatient) {
    auto& [patient, meds] = entry;
    if (meds.size() < 2) continue;
    SyncPlan plan;
    for (const auto& c : meds) plan.syncDay = std::max(plan.syncDay, c.forecast->runOutDay);
    for (const auto& c : meds) {
      const int64_t gap = plan.syncDay - c.forecast->runOutDay;
      if (gap <= 0) continue;
      const auto units = (static_cast<uint64_t>(gap) * c.forecast->weeklyMilli + 6) / 7;  // round up: never short
      plan.shortFills.push_back({c.info->medId, c.info->name, static_cast<uint32_t>(gap), units});
    }
    if (!plan.shortFills.empty()) registry.add(patient, std::move(plan));
  }
}

namespace {

std::string reasonText(uint32_t reasons) {
  std::string out;
  auto add = [&](uint32_t flag, const char* label) {
    if (!(reasons & flag)) return;
    if (!out.empty()) out += ", ";
    out += label;
  };
  add(Reason::REFILL_OVERDUE, "out of medication");
  add(Reason::REFILL_SOON, "refill due soon");
  add(Reason::LOW_PDC, "low refill adherence");
  add(Reason::MISSED_DOSES, "missed doses");
  add(Reason::LATE_DOSES, "late doses");
  return out;
}

}  // namespace

void WorklistSystem::run(Registry& registry, const SystemContext& ctx) const {
  auto& list = registry.resource<Worklist>().items;
  list.clear();

  registry.each<PatientInfo>([&](Entity e, PatientInfo& p) {
    if (const auto* pending = registry.get<PendingRx>(e)) {
      for (const auto& rx : pending->items) {
        list.push_back({WorkKind::NEW_RX, p.patientId, p.displayName, "", "", rx.rxId,
                        rx.drugName + (rx.refillRequest ? " (refill request)" : ""), rx.issuedDay, 80});
      }
    }
    if (const auto* risk = registry.get<PatientRisk>(e); risk && risk->score >= kHighRiskScore) {
      const auto* day = registry.get<LocalDay>(e);
      list.push_back({WorkKind::HIGH_RISK, p.patientId, p.displayName, "", "", "", reasonText(risk->reasons),
                      day ? day->today : ctx.today, 60});
    }
    if (const auto* sync = registry.get<SyncPlan>(e)) {
      list.push_back({WorkKind::MED_SYNC, p.patientId, p.displayName, "", "", "",
                      "Align " + std::to_string(sync->shortFills.size() + 1) + " medications to one pickup day",
                      sync->syncDay, 30});
    }
  });

  registry.each<MedInfo, Owner>([&](Entity e, MedInfo& med, Owner& owner) {
    const auto* patient = registry.get<PatientInfo>(owner.patient);
    if (!patient) return;
    if (const auto* f = registry.get<RefillForecast>(e)) {
      if (f->level == RefillLevel::OUT) {
        list.push_back({WorkKind::REFILL_OVERDUE, patient->patientId, patient->displayName, med.medId, med.name, "",
                        "Projected to have run out", f->runOutDay, 90});
      } else if (f->level == RefillLevel::SOON) {
        list.push_back({WorkKind::REFILL_DUE, patient->patientId, patient->displayName, med.medId, med.name, "",
                        std::to_string(f->daysLeft) + " days of supply left", f->runOutDay, 70});
      }
    }
    if (const auto* a = registry.get<Adherence>(e); a && a->valid && a->pdcPermille < kPdcThresholdPermille) {
      list.push_back({WorkKind::LOW_PDC, patient->patientId, patient->displayName, med.medId, med.name, "",
                      "Days covered " + std::to_string(a->pdcPermille / 10) + "%", todayFor(registry, e, ctx), 50});
    }
  });

  std::stable_sort(list.begin(), list.end(), [](const WorkItem& a, const WorkItem& b) {
    if (a.priority != b.priority) return a.priority > b.priority;
    if (a.dueDay != b.dueDay) return a.dueDay < b.dueDay;
    return a.patientName < b.patientName;
  });
}

Pipeline& Pipeline::add(std::unique_ptr<ISystem> system) {
  systems_.push_back(std::move(system));
  return *this;
}

void Pipeline::run(Registry& registry, const SystemContext& ctx) const {
  for (const auto& s : systems_) s->run(registry, ctx);
}

Pipeline Pipeline::standard() {
  Pipeline p;
  p.add(std::make_unique<SupplySystem>())
      .add(std::make_unique<AdherenceSystem>())
      .add(std::make_unique<RiskSystem>())
      .add(std::make_unique<MedSyncSystem>())
      .add(std::make_unique<WorklistSystem>());
  return p;
}

}  // namespace dosely::ecs
