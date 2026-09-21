#include "policy/access_policy.hpp"

namespace dosely::policy {

Status AccessPolicy::requireRole(const Actor& actor, std::initializer_list<Role> allowed) const {
  for (Role r : allowed) {
    if (actor.role == r) return Status::ok();
  }
  return fail(Err::FORBIDDEN, "this action is not available to your role");
}

Result<const domain::Provider*> AccessPolicy::provider(const Actor& actor) const {
  if (!domain::isProviderRole(actor.role)) return fail(Err::FORBIDDEN, "provider account required");
  const auto* p = vault_.provider(actor.id);
  if (!p) return fail(Err::NOT_FOUND, "register your pharmacy or practice first");
  if (p->role != actor.role) return fail(Err::FORBIDDEN, "provider role mismatch");
  return p;
}

Result<uint32_t> AccessPolicy::scopesFor(const Actor& actor, std::string_view patientId) const {
  if (!domain::isValidId(patientId)) return fail(Err::BAD_REQUEST, "invalid patient id");
  if (actor.role == Role::PATIENT) {
    if (actor.id != patientId) return fail(Err::FORBIDDEN, "patients can only access their own record");
    return ~uint32_t{0};
  }
  DV_ASSIGN(const domain::Provider* p, provider(actor));
  const auto* grant = vault_.activeGrant(patientId, p->id);
  // Same answer whether the patient exists or not: no enumeration.
  if (!grant) return fail(Err::FORBIDDEN, "no active consent from this patient");
  return grant->scopes;
}

Status AccessPolicy::requireScopes(const Actor& actor, std::string_view patientId, uint32_t needed) const {
  DV_ASSIGN(uint32_t held, scopesFor(actor, patientId));
  if ((held & needed) != needed) return fail(Err::FORBIDDEN, "the patient has not shared this with you");
  return Status::ok();
}

Status AccessPolicy::requirePurpose(const Actor& actor, const RequestContext& ctx) const {
  if (actor.role == Role::PATIENT || actor.role == Role::SYSTEM) return Status::ok();
  const bool tpo = ctx.purpose == Purpose::TREATMENT || ctx.purpose == Purpose::PAYMENT || ctx.purpose == Purpose::OPERATIONS;
  if (!tpo) return fail(Err::FORBIDDEN, "state a purpose of use (treatment, payment or operations)");
  return Status::ok();
}

Status AccessPolicy::requireStepUp(const RequestContext& ctx) const {
  const int64_t now = vault_.clock().nowMs();
  const int64_t age = now - ctx.stepUpAtMs;
  // A future timestamp beyond clock skew is as suspicious as a stale one.
  if (ctx.stepUpAtMs <= 0 || age > kStepUpWindowMs || age < -static_cast<int64_t>(proto::Frame::MAX_CLOCK_SKEW_MS)) {
    return fail(Err::STEP_UP_REQUIRED, "confirm it's you to continue");
  }
  return Status::ok();
}

Status AccessPolicy::requireVerified(const domain::Provider& provider) const {
  if (!provider.verified) return fail(Err::UNVERIFIED, "your provider identity has not been verified yet");
  return Status::ok();
}

}  // namespace dosely::policy
