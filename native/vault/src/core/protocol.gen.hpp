// GENERATED from native/vault/protocol/protocol.def by build.mjs — do not edit.
#pragma once
#include <cstdint>

namespace dosely::proto {

enum class Role : uint32_t {
  PATIENT = 1,
  PHARMACY = 2,
  PRESCRIBER = 3,
  SYSTEM = 4,
};

namespace Scope {
inline constexpr uint32_t READ_MEDS = 1u;
inline constexpr uint32_t READ_ADHERENCE = 2u;
inline constexpr uint32_t READ_TIMING = 4u;
inline constexpr uint32_t READ_REFILL = 8u;
inline constexpr uint32_t RECEIVE_RX = 16u;
inline constexpr uint32_t PRESCRIBE = 32u;
}  // namespace Scope

enum class Purpose : uint32_t {
  TREATMENT = 1,
  PAYMENT = 2,
  OPERATIONS = 3,
  PATIENT_REQUEST = 4,
};

enum class RxStatus : uint32_t {
  SENT = 1,
  RECEIVED = 2,
  IN_PROGRESS = 3,
  READY = 4,
  PICKED_UP = 5,
  CANCELLED = 6,
};

enum class RefillLevel : uint32_t {
  UNTRACKED = 0,
  UNKNOWN = 1,
  OK = 2,
  SOON = 3,
  OUT = 4,
};

namespace RiskReason {
inline constexpr uint32_t REFILL_OVERDUE = 1u;
inline constexpr uint32_t REFILL_SOON = 2u;
inline constexpr uint32_t LOW_PDC = 4u;
inline constexpr uint32_t LATE_DOSES = 8u;
inline constexpr uint32_t MISSED_DOSES = 16u;
}  // namespace RiskReason

enum class WorkKind : uint32_t {
  REFILL_OVERDUE = 1,
  NEW_RX = 2,
  REFILL_DUE = 3,
  HIGH_RISK = 4,
  LOW_PDC = 5,
  MED_SYNC = 6,
};

enum class Cmd : uint32_t {
  HELLO = 1,
  STATS = 2,
  PROVIDER_REGISTER = 10,
  PROVIDER_GET = 11,
  INVITE_CREATE = 20,
  INVITE_REDEEM = 21,
  GRANT_LIST = 22,
  GRANT_REVOKE = 23,
  SNAPSHOT_PUT = 30,
  PATIENT_SUMMARY = 31,
  PATIENT_ERASE = 32,
  PROVIDER_PATIENTS = 33,
  RX_CREATE = 40,
  RX_LIST = 41,
  RX_GET = 42,
  RX_SET_STATUS = 43,
  WORKLIST = 50,
  AUDIT_QUERY = 60,
  AUDIT_VERIFY = 61,
};

enum class Err : uint32_t {
  OK = 0,
  BAD_REQUEST = 1,
  UNAUTHORIZED = 2,
  FORBIDDEN = 3,
  NOT_FOUND = 4,
  CONFLICT = 5,
  EXPIRED = 6,
  STEP_UP_REQUIRED = 7,
  INTEGRITY = 8,
  INTERNAL = 9,
  UNSUPPORTED = 10,
  LIMIT = 11,
  UNVERIFIED = 12,
};

enum class FieldType : uint32_t {
  U64 = 1,
  I64 = 2,
  BOOL = 3,
  BYTES = 4,
  STR = 5,
  MSG = 6,
};

namespace Frame {
inline constexpr uint32_t VERSION = 1u;
inline constexpr uint32_t KIND_REQUEST = 1u;
inline constexpr uint32_t KIND_RESPONSE = 2u;
inline constexpr uint32_t HEADER_SIZE = 28u;
inline constexpr uint32_t MAC_SIZE = 32u;
inline constexpr uint32_t MAX_PAYLOAD = 1048576u;
inline constexpr uint32_t MAX_CLOCK_SKEW_MS = 300000u;
}  // namespace Frame

namespace Codec {
inline constexpr uint32_t MAX_DEPTH = 8u;
inline constexpr uint32_t MAX_FIELDS = 65536u;
inline constexpr uint32_t MAX_STRING = 65536u;
inline constexpr uint32_t MAX_BYTES = 65536u;
}  // namespace Codec

enum class RecordType : uint32_t {
  PATIENT_KEY = 1,
  SNAPSHOT = 2,
  PROVIDER = 3,
  PROVIDER_KEY = 4,
  GRANT = 5,
  RX_BODY = 6,
  RX_META = 7,
  INVITE_SPENT = 8,
  FILL = 9,
  TOMBSTONE = 10,
};

namespace tag {
namespace Req {
inline constexpr uint16_t RequestId = 1;
inline constexpr uint16_t Command = 2;
inline constexpr uint16_t Actor = 3;
inline constexpr uint16_t Args = 4;
inline constexpr uint16_t Context = 5;
}  // namespace Req
namespace Resp {
inline constexpr uint16_t RequestId = 1;
inline constexpr uint16_t Status = 2;
inline constexpr uint16_t Result = 3;
inline constexpr uint16_t Error = 4;
}  // namespace Resp
namespace Actor {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t Role = 2;
}  // namespace Actor
namespace Ctx {
inline constexpr uint16_t Purpose = 1;
inline constexpr uint16_t StepUpAtMs = 2;
}  // namespace Ctx
namespace Arg {
inline constexpr uint16_t PatientId = 1;
inline constexpr uint16_t ProviderId = 2;
inline constexpr uint16_t GrantId = 3;
inline constexpr uint16_t RxId = 4;
inline constexpr uint16_t Status = 5;
inline constexpr uint16_t Limit = 6;
inline constexpr uint16_t Token = 7;
inline constexpr uint16_t Role = 8;
inline constexpr uint16_t Scopes = 9;
inline constexpr uint16_t GrantDays = 10;
inline constexpr uint16_t Day = 11;
inline constexpr uint16_t Record = 12;
inline constexpr uint16_t ExpiresInMs = 13;
}  // namespace Arg
namespace List {
inline constexpr uint16_t Item = 1;
}  // namespace List
namespace Hello {
inline constexpr uint16_t Version = 1;
inline constexpr uint16_t SystemKey = 2;
}  // namespace Hello
namespace Provider {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t Role = 2;
inline constexpr uint16_t Name = 3;
inline constexpr uint16_t Org = 4;
inline constexpr uint16_t Npi = 5;
inline constexpr uint16_t Verified = 6;
inline constexpr uint16_t PublicKey = 7;
inline constexpr uint16_t CreatedAtMs = 8;
}  // namespace Provider
namespace Grant {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t PatientId = 2;
inline constexpr uint16_t ProviderId = 3;
inline constexpr uint16_t Scopes = 4;
inline constexpr uint16_t CreatedAtMs = 5;
inline constexpr uint16_t ExpiresAtMs = 6;
inline constexpr uint16_t Revoked = 7;
inline constexpr uint16_t ProviderName = 8;
inline constexpr uint16_t ProviderRole = 9;
inline constexpr uint16_t ProviderVerified = 10;
inline constexpr uint16_t ProviderOrg = 11;
inline constexpr uint16_t PatientName = 12;
}  // namespace Grant
namespace Invite {
inline constexpr uint16_t PatientId = 1;
inline constexpr uint16_t Role = 2;
inline constexpr uint16_t Scopes = 3;
inline constexpr uint16_t ExpiresAtMs = 4;
inline constexpr uint16_t Nonce = 5;
inline constexpr uint16_t GrantDays = 6;
inline constexpr uint16_t Token = 7;
}  // namespace Invite
namespace Token {
inline constexpr uint16_t Body = 1;
inline constexpr uint16_t Signature = 2;
}  // namespace Token
namespace Snapshot {
inline constexpr uint16_t PatientId = 1;
inline constexpr uint16_t DisplayName = 2;
inline constexpr uint16_t Med = 3;
inline constexpr uint16_t UpdatedAtMs = 4;
inline constexpr uint16_t TzOffsetMin = 5;
}  // namespace Snapshot
namespace Med {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t Name = 2;
inline constexpr uint16_t Rxcui = 3;
inline constexpr uint16_t Strength = 4;
inline constexpr uint16_t Form = 5;
inline constexpr uint16_t SlotsPerDay = 6;
inline constexpr uint16_t DaysMask = 7;
inline constexpr uint16_t UnitsPerDoseMilli = 8;
inline constexpr uint16_t OnHandMilli = 9;
inline constexpr uint16_t AsOfDay = 10;
inline constexpr uint16_t LeadDays = 11;
inline constexpr uint16_t AsNeeded = 12;
inline constexpr uint16_t SelfAdherencePct = 13;
inline constexpr uint16_t DosesDue = 14;
inline constexpr uint16_t DosesTaken = 15;
inline constexpr uint16_t DosesLate = 16;
inline constexpr uint16_t AvgDelayMin = 17;
inline constexpr uint16_t SupplyTracked = 18;
inline constexpr uint16_t RxId = 19;
}  // namespace Med
namespace Fill {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t PatientId = 2;
inline constexpr uint16_t MedId = 3;
inline constexpr uint16_t RxId = 4;
inline constexpr uint16_t Day = 5;
inline constexpr uint16_t QuantityMilli = 6;
inline constexpr uint16_t DaysSupply = 7;
inline constexpr uint16_t PharmacyId = 8;
}  // namespace Fill
namespace Rx {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t PatientId = 2;
inline constexpr uint16_t PrescriberId = 3;
inline constexpr uint16_t PharmacyId = 4;
inline constexpr uint16_t MedId = 5;
inline constexpr uint16_t DrugName = 6;
inline constexpr uint16_t Rxcui = 7;
inline constexpr uint16_t Strength = 8;
inline constexpr uint16_t Form = 9;
inline constexpr uint16_t Sig = 10;
inline constexpr uint16_t QuantityMilli = 11;
inline constexpr uint16_t DaysSupply = 12;
inline constexpr uint16_t Refills = 13;
inline constexpr uint16_t Controlled = 14;
inline constexpr uint16_t IssuedAtMs = 15;
inline constexpr uint16_t Status = 16;
inline constexpr uint16_t UpdatedAtMs = 17;
inline constexpr uint16_t Signature = 18;
inline constexpr uint16_t PrescriberKey = 19;
inline constexpr uint16_t SignatureValid = 20;
inline constexpr uint16_t PrescriberName = 21;
inline constexpr uint16_t PatientName = 22;
inline constexpr uint16_t PharmacyName = 23;
inline constexpr uint16_t History = 24;
inline constexpr uint16_t RefillsUsed = 25;
}  // namespace Rx
namespace StatusEvent {
inline constexpr uint16_t Status = 1;
inline constexpr uint16_t AtMs = 2;
inline constexpr uint16_t ActorId = 3;
}  // namespace StatusEvent
namespace RxMeta {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t PatientId = 2;
inline constexpr uint16_t PrescriberId = 3;
inline constexpr uint16_t PharmacyId = 4;
inline constexpr uint16_t Status = 5;
inline constexpr uint16_t IssuedAtMs = 6;
inline constexpr uint16_t UpdatedAtMs = 7;
inline constexpr uint16_t History = 8;
}  // namespace RxMeta
namespace Summary {
inline constexpr uint16_t PatientId = 1;
inline constexpr uint16_t DisplayName = 2;
inline constexpr uint16_t Med = 3;
inline constexpr uint16_t RiskScore = 4;
inline constexpr uint16_t RiskReasons = 5;
inline constexpr uint16_t Sync = 6;
inline constexpr uint16_t Pharmacy = 7;
inline constexpr uint16_t UpdatedAtMs = 8;
inline constexpr uint16_t Scopes = 9;
}  // namespace Summary
namespace MedSummary {
inline constexpr uint16_t MedId = 1;
inline constexpr uint16_t Name = 2;
inline constexpr uint16_t Strength = 3;
inline constexpr uint16_t Form = 4;
inline constexpr uint16_t Level = 5;
inline constexpr uint16_t DaysLeft = 6;
inline constexpr uint16_t RunOutDay = 7;
inline constexpr uint16_t RefillByDay = 8;
inline constexpr uint16_t PdcPermille = 9;
inline constexpr uint16_t PdcValid = 10;
inline constexpr uint16_t RiskScore = 11;
inline constexpr uint16_t RiskReasons = 12;
inline constexpr uint16_t SelfAdherencePct = 13;
inline constexpr uint16_t DosesDue = 14;
inline constexpr uint16_t DosesTaken = 15;
inline constexpr uint16_t DosesLate = 16;
inline constexpr uint16_t AvgDelayMin = 17;
inline constexpr uint16_t AsNeeded = 18;
inline constexpr uint16_t FillCount = 19;
inline constexpr uint16_t RemainingMilli = 20;
inline constexpr uint16_t DailyMilli = 21;
}  // namespace MedSummary
namespace SyncPlan {
inline constexpr uint16_t SyncDay = 1;
inline constexpr uint16_t ShortFill = 2;
}  // namespace SyncPlan
namespace ShortFill {
inline constexpr uint16_t MedId = 1;
inline constexpr uint16_t Name = 2;
inline constexpr uint16_t Days = 3;
inline constexpr uint16_t UnitsMilli = 4;
}  // namespace ShortFill
namespace PharmacyRef {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t Name = 2;
inline constexpr uint16_t Org = 3;
inline constexpr uint16_t Verified = 4;
}  // namespace PharmacyRef
namespace PatientRef {
inline constexpr uint16_t Id = 1;
inline constexpr uint16_t DisplayName = 2;
inline constexpr uint16_t Scopes = 3;
inline constexpr uint16_t GrantExpiresAtMs = 4;
inline constexpr uint16_t RiskScore = 5;
inline constexpr uint16_t UpdatedAtMs = 6;
}  // namespace PatientRef
namespace Work {
inline constexpr uint16_t Kind = 1;
inline constexpr uint16_t PatientId = 2;
inline constexpr uint16_t PatientName = 3;
inline constexpr uint16_t MedId = 4;
inline constexpr uint16_t MedName = 5;
inline constexpr uint16_t DueDay = 6;
inline constexpr uint16_t Priority = 7;
inline constexpr uint16_t Detail = 8;
inline constexpr uint16_t RxId = 9;
}  // namespace Work
namespace Audit {
inline constexpr uint16_t Seq = 1;
inline constexpr uint16_t AtMs = 2;
inline constexpr uint16_t ActorId = 3;
inline constexpr uint16_t ActorRole = 4;
inline constexpr uint16_t Command = 5;
inline constexpr uint16_t PatientId = 6;
inline constexpr uint16_t Purpose = 7;
inline constexpr uint16_t Outcome = 8;
inline constexpr uint16_t Detail = 9;
inline constexpr uint16_t ActorName = 10;
}  // namespace Audit
namespace Stats {
inline constexpr uint16_t Version = 1;
inline constexpr uint16_t Providers = 2;
inline constexpr uint16_t Patients = 3;
inline constexpr uint16_t Grants = 4;
inline constexpr uint16_t Prescriptions = 5;
inline constexpr uint16_t AuditEntries = 6;
inline constexpr uint16_t IntegrityErrors = 7;
inline constexpr uint16_t AuditIntact = 8;
inline constexpr uint16_t AuditBrokenAt = 9;
}  // namespace Stats
namespace Rec {
inline constexpr uint16_t Type = 1;
inline constexpr uint16_t Id = 2;
inline constexpr uint16_t Version = 3;
inline constexpr uint16_t Sealed = 4;
}  // namespace Rec
namespace AuditRec {
inline constexpr uint16_t Seq = 1;
inline constexpr uint16_t Sealed = 2;
inline constexpr uint16_t Chain = 3;
}  // namespace AuditRec
}  // namespace tag

}  // namespace dosely::proto
