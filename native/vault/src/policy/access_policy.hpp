#pragma once
// AccessPolicy: every authorization rule in one place.
//
// The Node server authenticates *who* is calling (passkey session); the vault
// decides *what they may do*:
//   * patients act only on their own data;
//   * providers act only through an active, unexpired, unrevoked consent grant,
//     and only within its scopes (minimum necessary);
//   * providers must state a HIPAA purpose of use (treatment/payment/operations);
//   * high-impact actions (prescribing, erasing) need a recent re-authentication;
//   * prescribing requires a verified prescriber.

#include <initializer_list>
#include <string>
#include <string_view>

#include "core/clock.hpp"
#include "core/result.hpp"
#include "domain/model.hpp"
#include "service/vault.hpp"

namespace dosely::policy {

using proto::Purpose;
using proto::Role;

struct Actor {
  std::string id;
  Role role = Role::PATIENT;
};

struct RequestContext {
  Purpose purpose = Purpose::PATIENT_REQUEST;
  int64_t stepUpAtMs = 0;  // when the caller last re-authenticated (0 = unknown)
};

inline constexpr int64_t kStepUpWindowMs = 5 * kMsPerMinute;

class AccessPolicy {
 public:
  explicit AccessPolicy(const service::Vault& vault) : vault_(vault) {}

  Status requireRole(const Actor& actor, std::initializer_list<Role> allowed) const;
  /** The registered provider behind a provider actor (its role must match). */
  Result<const domain::Provider*> provider(const Actor& actor) const;
  /** Scopes the actor holds over this patient's data: everything for the
   * patient themself, the grant's scopes for a connected provider. */
  Result<uint32_t> scopesFor(const Actor& actor, std::string_view patientId) const;
  Status requireScopes(const Actor& actor, std::string_view patientId, uint32_t needed) const;
  Status requirePurpose(const Actor& actor, const RequestContext& ctx) const;
  Status requireStepUp(const RequestContext& ctx) const;
  Status requireVerified(const domain::Provider& provider) const;

 private:
  const service::Vault& vault_;
};

}  // namespace dosely::policy
