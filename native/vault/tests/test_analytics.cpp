// Analytics: the ECS registry, and each system's math. The refill cases are
// ported from the app's own tests (src/features/refill/__tests__/refill.test.ts)
// so the pharmacy's forecast and the patient's forecast can't disagree.

#include "ecs/systems.hpp"
#include "harness.hpp"
#include "service/analytics.hpp"

using namespace dosely;
using namespace dosely::ecs;

namespace {
constexpr int64_t kJan1 = 19723;  // 2024-01-01 as days since the epoch
namespace Reason = proto::RiskReason;
}  // namespace

TEST(registry_components_and_generations) {
  Registry r;
  const Entity a = r.create();
  const Entity b = r.create();
  r.add(a, MedInfo{"a", "A", "", "", false});
  r.add(b, MedInfo{"b", "B", "", "", false});
  r.add(b, Supply{1000, 0, 7});
  int both = 0;
  r.each<MedInfo, Supply>([&](Entity e, MedInfo& m, Supply&) {
    ++both;
    CHECK(e == b);
    CHECK_EQ(m.medId, std::string("b"));
  });
  CHECK_EQ(both, 1);

  r.destroy(a);  // swap-remove must keep b's data intact
  CHECK(!r.alive(a));
  CHECK_EQ(r.get<MedInfo>(b)->medId, std::string("b"));
  const Entity c = r.create();  // reuses a's slot with a new generation
  CHECK_EQ(c.index, a.index);
  CHECK(!(c == a));
  CHECK(r.get<MedInfo>(a) == nullptr);  // the stale handle doesn't resolve
  CHECK(!r.has<MedInfo>(c));
}

TEST(forecast_matches_app_refill_math) {
  const Schedule daily{1, 0, 1000, false};
  const Supply thirty{30'000, kJan1, 7};

  auto s = forecastSupply(daily, thirty, kJan1);
  CHECK_EQ(s.remainingMilli, uint64_t{30'000});
  CHECK_EQ(s.daysLeft, int64_t{30});
  CHECK_EQ(s.runOutDay, kJan1 + 30);  // 2024-01-31
  CHECK(s.level == RefillLevel::OK);

  s = forecastSupply(daily, thirty, kJan1 + 20);
  CHECK_EQ(s.remainingMilli, uint64_t{10'000});
  CHECK_EQ(s.daysLeft, int64_t{10});

  s = forecastSupply(daily, thirty, kJan1 + 24);
  CHECK_EQ(s.daysLeft, int64_t{6});
  CHECK(s.level == RefillLevel::SOON);

  s = forecastSupply(daily, thirty, kJan1 + 60);  // 2024-03-01
  CHECK_EQ(s.remainingMilli, uint64_t{0});
  CHECK_EQ(s.daysLeft, int64_t{0});
  CHECK(s.level == RefillLevel::OUT);

  s = forecastSupply(daily, {30'000, kJan1 + 31, 7}, kJan1);  // count dated in the future
  CHECK_EQ(s.remainingMilli, uint64_t{30'000});

  s = forecastSupply({0, 0, 1000, false}, thirty, kJan1);  // no scheduled times
  CHECK(s.level == RefillLevel::UNKNOWN);
  CHECK(!s.projected);

  // Two slots x two pills = 4/day; Mon/Wed/Fri = 3/7 per day, exact.
  CHECK_EQ(forecastSupply({2, 0, 2000, false}, thirty, kJan1).dailyMilli, uint64_t{4000});
  const Schedule mwf{1, (1u << 1) | (1u << 3) | (1u << 5), 1000, false};
  s = forecastSupply(mwf, {3000, kJan1, 2}, kJan1);
  CHECK_EQ(s.daysLeft, int64_t{7});  // 3 pills at 3/7 per day
}

TEST(pdc_counts_days_covered_with_carryover) {
  // Two 30-day fills 30 days apart, measured at day 89: 60 of 90 days covered.
  auto a = proportionOfDaysCovered({{0, 30}, {30, 30}}, 89);
  CHECK(a.valid);
  CHECK_EQ(a.pdcPermille, uint32_t{666});

  // An early refill carries over instead of double counting: 60 of 60 days.
  a = proportionOfDaysCovered({{20, 30}, {0, 30}}, 59);
  CHECK_EQ(a.pdcPermille, uint32_t{1000});

  // One fill isn't enough to judge adherence.
  a = proportionOfDaysCovered({{0, 30}}, 10);
  CHECK(!a.valid);

  // Only the trailing 180-day window counts.
  a = proportionOfDaysCovered({{0, 30}, {400, 30}}, 429);
  CHECK(a.valid);
  CHECK_EQ(a.pdcPermille, uint32_t{166});  // 30 of 180
}

TEST(risk_scoring_combines_signals) {
  RefillForecast out;
  out.level = RefillLevel::OUT;
  Adherence low{700, true, 3};
  SelfReport missed{std::nullopt, 20, 12};  // 60%
  Timing late{12, 6, 40};                    // half late
  const auto r = assessRisk(&out, &low, &missed, &late);
  CHECK_EQ(r.score, uint32_t{10});  // 4 + 3 + 3 + 1, capped at 10
  CHECK_EQ(r.reasons, Reason::REFILL_OVERDUE | Reason::LOW_PDC | Reason::MISSED_DOSES | Reason::LATE_DOSES);

  const SelfReport tooFew{std::nullopt, 3, 0};  // below the sample threshold
  CHECK_EQ(assessRisk(nullptr, nullptr, &tooFew, nullptr).score, uint32_t{0});
  RefillForecast soon;
  soon.level = RefillLevel::SOON;
  CHECK_EQ(assessRisk(&soon, nullptr, nullptr, nullptr).reasons, Reason::REFILL_SOON);
}

namespace {

domain::MedRecord med(const char* id, const char* name, uint32_t slots, uint64_t onHandMilli, int64_t asOf) {
  domain::MedRecord m;
  m.id = id;
  m.name = name;
  m.slotsPerDay = slots;
  m.unitsPerDoseMilli = 1000;
  m.supplyTracked = true;
  m.onHandMilli = onHandMilli;
  m.asOfDay = asOf;
  m.leadDays = 7;
  m.dosesDue = 30;
  m.dosesTaken = 18;
  m.dosesLate = 9;
  m.avgDelayMin = 50;
  return m;
}

}  // namespace

TEST(pipeline_respects_scopes_and_builds_worklist) {
  namespace Scope = proto::Scope;
  domain::Snapshot snap;
  snap.patientId = "pat";
  snap.displayName = "Alex";
  snap.meds = {med("m1", "Atorvastatin", 1, 5000, kJan1), med("m2", "Metformin", 2, 24'000, kJan1)};

  // Only the medication list: no forecasts, no risk, no worklist.
  {
    service::CareAnalytics a(kJan1 * kMsPerDay);
    const auto p = a.addPatient(snap, {}, Scope::READ_MEDS);
    a.run();
    CHECK(a.worklist().empty());
    CHECK_EQ(a.riskScore(p), uint32_t{0});
    auto summary = codec::Message::parse(view(*a.summary(p, Scope::READ_MEDS, 1, {}).finish()));
    REQUIRE(summary.isOk());
    auto meds = summary->msgs(proto::tag::Summary::Med);
    REQUIRE(meds.isOk() && meds->size() == 2);
    CHECK(!(*meds)[0].has(proto::tag::MedSummary::Level));
    CHECK(!(*meds)[0].has(proto::tag::MedSummary::DosesLate));
    CHECK(!summary->has(proto::tag::Summary::RiskScore));
  }

  // Refill + adherence + timing: forecasts, med sync, risk and a worklist.
  {
    const uint32_t scopes = Scope::READ_MEDS | Scope::READ_REFILL | Scope::READ_ADHERENCE | Scope::READ_TIMING;
    service::CareAnalytics a(kJan1 * kMsPerDay);
    const auto p = a.addPatient(snap, {}, scopes);
    a.addPendingRx(p, {"rx1", "Lisinopril", kJan1, false});
    a.run();
    const auto& work = a.worklist();
    REQUIRE(work.size() >= 3);
    CHECK(work[0].kind == WorkKind::NEW_RX);       // priority 80
    CHECK(work[1].kind == WorkKind::REFILL_DUE);   // 5 days left, priority 70
    CHECK_EQ(work[1].medName, std::string("Atorvastatin"));
    bool synced = false;
    for (const auto& w : work) synced = synced || w.kind == WorkKind::MED_SYNC;
    CHECK(synced);  // run-outs on day 5 and day 12 -> align

    auto summary = codec::Message::parse(view(*a.summary(p, scopes, 1, {}).finish()));
    REQUIRE(summary.isOk());
    auto sync = summary->msg(proto::tag::Summary::Sync);
    REQUIRE(sync.isOk());
    CHECK_EQ(*sync->u64(proto::tag::SyncPlan::SyncDay), static_cast<uint64_t>(kJan1 + 12));
    auto shortFills = sync->msgs(proto::tag::SyncPlan::ShortFill);
    REQUIRE(shortFills.isOk() && shortFills->size() == 1);
    CHECK_EQ(*(*shortFills)[0].u64(proto::tag::ShortFill::Days), uint64_t{7});
    CHECK_EQ(*(*shortFills)[0].u64(proto::tag::ShortFill::UnitsMilli), uint64_t{7000});
    CHECK(*summary->u64(proto::tag::Summary::RiskScore) >= 4);  // missed + late doses
  }
}

TEST(refill_math_uses_the_patients_own_calendar) {
  namespace Scope = proto::Scope;
  // 11:30 pm on Jan 1 in UTC-7 is already Jan 2 in UTC.
  const int64_t now = kJan1 * kMsPerDay + (23 * 60 + 30 + 7 * 60) * kMsPerMinute;
  domain::Snapshot snap;
  snap.patientId = "pat";
  snap.meds = {med("m1", "Atorvastatin", 1, 5000, kJan1)};  // counted 5 on the patient's Jan 1

  auto daysLeft = [&](int32_t tz) {
    snap.tzOffsetMin = tz;
    service::CareAnalytics a(now);
    const auto p = a.addPatient(snap, {}, Scope::READ_MEDS | Scope::READ_REFILL);
    a.run();
    auto summary = codec::Message::parse(view(*a.summary(p, Scope::READ_REFILL, 1, {}).finish()));
    return *(*summary->msgs(proto::tag::Summary::Med))[0].u64(proto::tag::MedSummary::DaysLeft);
  };
  CHECK_EQ(daysLeft(-7 * 60), uint64_t{5});  // same answer the patient's app gives
  CHECK_EQ(daysLeft(0), uint64_t{4});        // what a UTC-only vault would have said
}
