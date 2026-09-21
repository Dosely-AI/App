#pragma once
// Systems: stateless transforms over components, run in a fixed pipeline.
//
//   SupplySystem     Schedule + Supply      -> RefillForecast
//   AdherenceSystem  FillHistory            -> Adherence (PDC)
//   RiskSystem       forecast/PDC/reports   -> Risk, PatientRisk
//   MedSyncSystem    forecasts per patient  -> SyncPlan
//   WorklistSystem   everything above       -> Worklist resource
//
// The math lives in pure functions (below) so it is unit-tested directly.

#include <memory>
#include <string_view>
#include <vector>

#include "ecs/components.hpp"
#include "ecs/registry.hpp"

namespace dosely::ecs {

struct SystemContext {
  int64_t today = 0;  // days since the Unix epoch (UTC); a patient's LocalDay overrides it
};

/** "Today" for a medication entity: its patient's LocalDay, else the context's. */
int64_t todayFor(Registry& registry, Entity med, const SystemContext& ctx);

class ISystem {
 public:
  virtual ~ISystem() = default;
  virtual std::string_view name() const = 0;
  virtual void run(Registry& registry, const SystemContext& ctx) const = 0;
};

class SupplySystem final : public ISystem {
 public:
  std::string_view name() const override { return "supply"; }
  void run(Registry& registry, const SystemContext& ctx) const override;
};

class AdherenceSystem final : public ISystem {
 public:
  std::string_view name() const override { return "adherence"; }
  void run(Registry& registry, const SystemContext& ctx) const override;
};

class RiskSystem final : public ISystem {
 public:
  std::string_view name() const override { return "risk"; }
  void run(Registry& registry, const SystemContext& ctx) const override;
};

class MedSyncSystem final : public ISystem {
 public:
  std::string_view name() const override { return "med-sync"; }
  void run(Registry& registry, const SystemContext& ctx) const override;
};

class WorklistSystem final : public ISystem {
 public:
  std::string_view name() const override { return "worklist"; }
  void run(Registry& registry, const SystemContext& ctx) const override;
};

class Pipeline {
 public:
  Pipeline& add(std::unique_ptr<ISystem> system);
  void run(Registry& registry, const SystemContext& ctx) const;
  /** Supply -> Adherence -> Risk -> MedSync -> Worklist. */
  static Pipeline standard();

 private:
  std::vector<std::unique_ptr<ISystem>> systems_;
};

// --- Pure analytics (unit-tested) ---------------------------------------------------------

/** Mirrors the app's refill projection (src/features/refill/refill.ts) in exact integer math. */
RefillForecast forecastSupply(const Schedule& schedule, const Supply& supply, int64_t today);

inline constexpr int64_t kPdcWindowDays = 180;
/** Proportion of days covered with PQA-style carry-over of early refills. */
Adherence proportionOfDaysCovered(std::vector<FillEvent> fills, int64_t today, int64_t windowDays = kPdcWindowDays);

inline constexpr uint32_t kPdcThresholdPermille = 800;  // the standard 80% adherence threshold
Risk assessRisk(const RefillForecast* forecast, const Adherence* adherence, const SelfReport* report,
                const Timing* timing);

inline constexpr int64_t kSyncHorizonDays = 30;
inline constexpr uint32_t kHighRiskScore = 6;

}  // namespace dosely::ecs
