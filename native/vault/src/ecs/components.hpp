#pragma once
// Components: plain data, no behavior.
//
// Which components exist for a patient is decided by the viewer's consent
// scopes when the working set is built (service/analytics). A system can only
// compute over components that exist, so "minimum necessary" is enforced by
// construction rather than by remembering to filter every output.

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "core/protocol.gen.hpp"
#include "ecs/registry.hpp"

namespace dosely::ecs {

using proto::RefillLevel;
using proto::WorkKind;

// --- Patient entities ------------------------------------------------------------

struct PatientInfo {
  std::string patientId;
  std::string displayName;
};

/** The patient's own calendar day; date math for their medications uses it. */
struct LocalDay {
  int64_t today = 0;
};

struct PendingRxItem {
  std::string rxId;
  std::string drugName;
  int64_t issuedDay = 0;
  bool refillRequest = false;
};
/** Prescriptions waiting for this pharmacy (only materialized with RECEIVE_RX). */
struct PendingRx {
  std::vector<PendingRxItem> items;
};

// --- Medication entities ---------------------------------------------------------------

struct Owner {
  Entity patient;
};

struct MedInfo {  // READ_MEDS
  std::string medId;
  std::string name;
  std::string strength;
  std::string form;
  bool asNeeded = false;
};

struct Schedule {  // READ_REFILL
  uint32_t slotsPerDay = 0;
  uint32_t daysMask = 0;  // 0 = every day
  uint64_t unitsPerDoseMilli = 1000;
  bool asNeeded = false;
};

struct Supply {  // READ_REFILL, when the patient tracks quantity
  uint64_t onHandMilli = 0;
  int64_t asOfDay = 0;
  uint32_t leadDays = 7;
};

struct SelfReport {  // READ_ADHERENCE
  std::optional<uint32_t> adherencePct;
  uint64_t dosesDue = 0;
  uint64_t dosesTaken = 0;
};

struct Timing {  // READ_TIMING
  uint64_t dosesTaken = 0;
  uint64_t dosesLate = 0;
  std::optional<int64_t> avgDelayMin;
};

struct FillEvent {
  int64_t day = 0;
  uint32_t daysSupply = 0;
};
struct FillHistory {  // READ_ADHERENCE
  std::vector<FillEvent> fills;
};

// --- System outputs --------------------------------------------------------------------------

struct RefillForecast {
  RefillLevel level = RefillLevel::UNTRACKED;
  uint64_t weeklyMilli = 0;
  uint64_t dailyMilli = 0;
  uint64_t remainingMilli = 0;
  bool projected = false;  // daysLeft/runOutDay/refillByDay are meaningful
  int64_t daysLeft = 0;
  int64_t runOutDay = 0;
  int64_t refillByDay = 0;
};

struct Adherence {
  uint32_t pdcPermille = 0;  // proportion of days covered, x1000
  bool valid = false;        // needs at least two fills
  uint32_t fills = 0;
};

struct Risk {
  uint32_t score = 0;  // 0..10
  uint32_t reasons = 0;  // proto::RiskReason flags
};

struct PatientRisk {
  uint32_t score = 0;
  uint32_t reasons = 0;
};

struct ShortFill {
  std::string medId;
  std::string name;
  uint32_t days = 0;
  uint64_t unitsMilli = 0;
};
/** Medication synchronization: bring every refill onto one pickup day. */
struct SyncPlan {
  int64_t syncDay = 0;
  std::vector<ShortFill> shortFills;
};

// --- Resources ----------------------------------------------------------------------------------

struct WorkItem {
  WorkKind kind = WorkKind::REFILL_DUE;
  std::string patientId;
  std::string patientName;
  std::string medId;
  std::string medName;
  std::string rxId;
  std::string detail;
  int64_t dueDay = 0;
  uint32_t priority = 0;
};

struct Worklist {
  std::vector<WorkItem> items;
};

}  // namespace dosely::ecs
