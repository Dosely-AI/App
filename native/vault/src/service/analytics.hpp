#pragma once
// CareAnalytics: turns decrypted patient records into a scope-limited ECS
// working set, runs the standard pipeline, and renders protocol messages.
//
// One instance serves one command and is then destroyed, so decrypted data
// never outlives the request that was authorized to see it.

#include <map>
#include <string>
#include <vector>

#include "codec/codec.hpp"
#include "core/clock.hpp"
#include "domain/model.hpp"
#include "ecs/components.hpp"
#include "ecs/registry.hpp"
#include "ecs/systems.hpp"

namespace dosely::service {

struct PharmacyRef {
  std::string id;
  std::string name;
  std::string org;
  bool verified = false;
};

class CareAnalytics {
 public:
  explicit CareAnalytics(int64_t nowMs) : nowMs_(nowMs), ctx_{Clock::floorDiv(nowMs, kMsPerDay)} {}
  ~CareAnalytics() { registry_.clear(); }
  CareAnalytics(const CareAnalytics&) = delete;
  CareAnalytics& operator=(const CareAnalytics&) = delete;

  /** Materialize one patient, creating only the components `scopes` allow. */
  ecs::Entity addPatient(const domain::Snapshot& snapshot, const std::vector<domain::Fill>& fills, uint32_t scopes);
  /** A patient known only by id (connected, but nothing shared yet). */
  ecs::Entity addEmptyPatient(const std::string& patientId);
  void addPendingRx(ecs::Entity patient, ecs::PendingRxItem item);

  void run();

  /** The Summary message (tags in canonical order, pharmacies inserted in place). */
  codec::Writer summary(ecs::Entity patient, uint32_t scopes, int64_t updatedAtMs,
                        const std::vector<PharmacyRef>& pharmacies);
  uint32_t riskScore(ecs::Entity patient);
  const std::vector<ecs::WorkItem>& worklist();

 private:
  codec::Writer medSummary(ecs::Entity med, uint32_t scopes);

  ecs::Registry registry_;
  int64_t nowMs_;
  ecs::SystemContext ctx_;
  std::map<uint32_t, std::vector<ecs::Entity>> medsByPatient_;
};

}  // namespace dosely::service
