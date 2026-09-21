#pragma once
// Domain records and their canonical encodings.
//
// Everything that enters the vault is decoded and bounds-checked here, once;
// code downstream works with validated structs and never re-parses bytes.
// Quantities are fixed-point integers (milli-units, per-mille) so arithmetic is
// exact and identical on every platform.

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "codec/codec.hpp"
#include "core/clock.hpp"
#include "core/result.hpp"
#include "crypto/crypto.hpp"

namespace dosely::domain {

using proto::Role;
using proto::RxStatus;

// --- Validation ------------------------------------------------------------------

/** Account/record ids: [A-Za-z0-9_-]{1,64}. Excludes '/', which scopes record ids. */
bool isValidId(std::string_view id);
/** US National Provider Identifier: 10 digits, Luhn check over the "80840" prefix. */
bool isValidNpi(std::string_view npi);
/** The consent scopes a role may hold. READ_MEDS is the base of every grant. */
uint32_t scopesAllowedFor(Role role);
bool isProviderRole(Role role);
/** A fresh 128-bit random id (hex). */
std::string newId();

inline constexpr size_t kMaxNameLength = 120;
inline constexpr size_t kMaxShortText = 60;
inline constexpr size_t kMaxSigLength = 500;
inline constexpr size_t kMaxMeds = 64;

// --- Directory records (sealed with the system key) ---------------------------------

struct Provider {
  std::string id;
  Role role = Role::PHARMACY;
  std::string name;
  std::string org;
  std::string npi;
  bool verified = false;
  crypto::PublicKey publicKey{};
  int64_t createdAtMs = 0;

  codec::Writer encode() const;
  static Result<Provider> decode(const codec::Message& m);
  /** Validate a registration request (name, org, NPI, role). */
  static Result<Provider> fromRegistration(const codec::Message& m, std::string_view actorId, Role actorRole);
};

struct Grant {
  std::string id;
  std::string patientId;
  std::string providerId;
  uint32_t scopes = 0;
  int64_t createdAtMs = 0;
  int64_t expiresAtMs = 0;
  bool revoked = false;

  bool activeAt(int64_t nowMs) const { return !revoked && nowMs < expiresAtMs; }
  codec::Writer encode() const;
  static Result<Grant> decode(const codec::Message& m);
};

struct StatusEvent {
  RxStatus status = RxStatus::SENT;
  int64_t atMs = 0;
  std::string actorId;
};

/** Routing and status of a prescription — no clinical content, so it can live
 * in the directory and drive queues without opening patient data. */
struct RxMeta {
  std::string id;
  std::string patientId;
  std::string prescriberId;
  std::string pharmacyId;
  RxStatus status = RxStatus::SENT;
  int64_t issuedAtMs = 0;
  int64_t updatedAtMs = 0;
  std::vector<StatusEvent> history;

  codec::Writer encode() const;
  static Result<RxMeta> decode(const codec::Message& m);
};

/** May `actor` move a prescription from `from` to `to`? (Refill availability is checked separately.) */
bool rxTransitionAllowed(RxStatus from, RxStatus to, Role actor);

// --- Patient records (sealed with the patient's own key) ---------------------------------

struct Prescription {
  std::string id;
  std::string patientId;
  std::string prescriberId;
  std::string pharmacyId;
  std::string medId;  // the patient's medication this continues, if any
  std::string drugName;
  std::string rxcui;
  std::string strength;
  std::string form;
  std::string sig;  // directions for use
  uint64_t quantityMilli = 0;
  uint32_t daysSupply = 0;
  uint32_t refills = 0;
  bool controlled = false;
  int64_t issuedAtMs = 0;
  crypto::Signature signature{};

  /** Domain-separated canonical bytes the prescriber signs. */
  Bytes signingBytes() const;
  /** The clinical fields (Rx tags 1..15) in canonical order. */
  void encodeClinical(codec::Writer& w) const;
  bool signatureValid(const crypto::PublicKey& prescriberKey) const;
  codec::Writer encode() const;
  static Result<Prescription> decode(const codec::Message& m);
  /** Validate a prescriber's draft (clinical fields only; routing is set by the vault). */
  static Result<Prescription> fromDraft(const codec::Message& m);
};

struct Fill {
  std::string id;
  std::string patientId;
  std::string medId;
  std::string rxId;
  std::string pharmacyId;
  int64_t day = 0;
  uint64_t quantityMilli = 0;
  uint32_t daysSupply = 0;

  codec::Writer encode() const;
  static Result<Fill> decode(const codec::Message& m);
};

struct MedRecord {
  std::string id;
  std::string name;
  std::string rxcui;
  std::string strength;
  std::string form;
  uint32_t slotsPerDay = 0;
  uint32_t daysMask = 0;  // bit d = weekday d (0 = Sunday); 0 = every day
  uint64_t unitsPerDoseMilli = 1000;
  bool supplyTracked = false;
  uint64_t onHandMilli = 0;
  int64_t asOfDay = 0;
  uint32_t leadDays = 7;
  bool asNeeded = false;
  std::optional<uint32_t> selfAdherencePct;
  uint64_t dosesDue = 0;
  uint64_t dosesTaken = 0;
  uint64_t dosesLate = 0;
  std::optional<int64_t> avgDelayMin;
  std::string rxId;  // the prescription this medication was started from, if any

  codec::Writer encode() const;
  static Result<MedRecord> decode(const codec::Message& m);
};

/** What the patient's app shares: their medication list and self-reported
 * adherence. Uploaded whole (last write wins) whenever it changes. */
struct Snapshot {
  std::string patientId;
  std::string displayName;
  std::vector<MedRecord> meds;
  int64_t updatedAtMs = 0;
  int32_t tzOffsetMin = 0;  // minutes east of UTC on the patient's device

  /** The patient's own calendar day at `nowMs` (refills are counted in their days). */
  int64_t localDay(int64_t nowMs) const;
  codec::Writer encode() const;
  static Result<Snapshot> decode(const codec::Message& m);
};

// --- Consent invites ------------------------------------------------------------------

/** A one-time, expiring, signed capability: "the holder may connect to this
 * patient with these scopes". Shared as a QR code or link. */
struct Invite {
  std::string patientId;
  Role role = Role::PHARMACY;
  uint32_t scopes = 0;
  int64_t expiresAtMs = 0;
  Bytes nonce;  // 16 random bytes; spent on redemption
  uint32_t grantDays = 180;

  Bytes toToken(const crypto::SigningKey& signer) const;
  /** Verify signature and structure (not expiry or spent-ness — the caller owns time and state). */
  static Result<Invite> fromToken(ByteView token, const crypto::PublicKey& signerKey);
};

}  // namespace dosely::domain
