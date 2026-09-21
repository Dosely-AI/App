// Directory commands: provider registration, consent invites, consent grants.

#include <algorithm>

#include "service/command.hpp"

namespace dosely::service {

namespace tag = proto::tag;
namespace Scope = proto::Scope;
using domain::Grant;
using domain::Provider;
using proto::Role;

namespace {

constexpr int64_t kDefaultInviteTtlMs = 15 * kMsPerMinute;
constexpr int64_t kMaxInviteTtlMs = 24 * 60 * kMsPerMinute;
constexpr uint64_t kDefaultGrantDays = 180;

codec::Writer publicProvider(const Provider& p) {
  codec::Writer w;
  w.str(tag::Provider::Id, p.id).u64(tag::Provider::Role, static_cast<uint64_t>(p.role)).str(tag::Provider::Name, p.name);
  if (!p.org.empty()) w.str(tag::Provider::Org, p.org);
  w.str(tag::Provider::Npi, p.npi)
      .boolean(tag::Provider::Verified, p.verified)
      .bytes(tag::Provider::PublicKey, {p.publicKey.data(), p.publicKey.size()})
      .u64(tag::Provider::CreatedAtMs, static_cast<uint64_t>(p.createdAtMs));
  return w;
}

/** A grant as its patient sees it: who holds it and what they can see. */
codec::Writer grantView(const Grant& g, const Vault& vault, const std::string& patientName) {
  codec::Writer w = g.encode();
  if (const auto* p = vault.provider(g.providerId)) {
    w.str(tag::Grant::ProviderName, p->name)
        .u64(tag::Grant::ProviderRole, static_cast<uint64_t>(p->role))
        .boolean(tag::Grant::ProviderVerified, p->verified);
    if (!p->org.empty()) w.str(tag::Grant::ProviderOrg, p->org);
  }
  if (!patientName.empty()) w.str(tag::Grant::PatientName, patientName);
  return w;
}

class ProviderRegister final : public ICommand {
 public:
  Cmd id() const override { return Cmd::PROVIDER_REGISTER; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.policy.requireRole(ctx.actor(), {Role::PHARMACY, Role::PRESCRIBER}));
    DV_TRY(ctx.args().expectOnly({tag::Arg::Record}));
    DV_ASSIGN(auto record, ctx.args().msg(tag::Arg::Record));
    DV_ASSIGN(Provider p, Provider::fromRegistration(record, ctx.actor().id, ctx.actor().role));

    // One account per NPI: stops a second account from claiming a registered identity.
    for (const auto& [id, other] : ctx.vault.providers()) {
      if (id != p.id && other.npi == p.npi) return fail(Err::CONFLICT, "this NPI is already registered");
    }
    if (const auto* existing = ctx.vault.provider(p.id)) {
      if (existing->role != p.role) return fail(Err::CONFLICT, "this account is registered with a different role");
      p.publicKey = existing->publicKey;
      p.createdAtMs = existing->createdAtMs;
      p.verified = existing->verified && existing->npi == p.npi;  // a new NPI must be re-verified
      ctx.audit.detail = "updated provider profile";
    } else {
      const auto signer = crypto::SigningKey::generate();
      DV_TRY(ctx.vault.saveProviderSigner(p.id, signer));
      p.publicKey = signer.publicKey();
      p.createdAtMs = ctx.now();
      p.verified = ctx.vault.options().devAutoVerify;
      ctx.audit.detail = p.verified ? "registered provider (dev auto-verified)" : "registered provider";
    }
    DV_TRY(ctx.vault.saveProvider(p));
    return publicProvider(p);
  }
};

class ProviderGet final : public ICommand {
 public:
  Cmd id() const override { return Cmd::PROVIDER_GET; }
  bool audited() const override { return false; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::ProviderId}));
    DV_ASSIGN(std::string providerId, ctx.args().str(tag::Arg::ProviderId));
    const auto* p = ctx.vault.provider(providerId);
    if (!p) return fail(Err::NOT_FOUND, "provider not found");
    return publicProvider(*p);
  }
};

class InviteCreate final : public ICommand {
 public:
  Cmd id() const override { return Cmd::INVITE_CREATE; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.policy.requireRole(ctx.actor(), {Role::PATIENT}));
    DV_TRY(ctx.args().expectOnly({tag::Arg::Role, tag::Arg::Scopes, tag::Arg::GrantDays, tag::Arg::ExpiresInMs}));
    DV_ASSIGN(uint64_t roleValue, ctx.args().u64(tag::Arg::Role));
    const auto role = static_cast<Role>(roleValue);
    if (!domain::isProviderRole(role)) return fail(Err::BAD_REQUEST, "invites are for a pharmacy or a prescriber");
    DV_ASSIGN(uint64_t scopes, ctx.args().u64(tag::Arg::Scopes));
    scopes |= Scope::READ_MEDS;  // every connection can at least see the medication list
    if ((scopes & ~uint64_t{domain::scopesAllowedFor(role)}) != 0) {
      return fail(Err::BAD_REQUEST, "those permissions don't apply to this kind of provider");
    }
    DV_ASSIGN(uint64_t days, ctx.args().u64Or(tag::Arg::GrantDays, kDefaultGrantDays));
    DV_ASSIGN(uint64_t ttl, ctx.args().u64Or(tag::Arg::ExpiresInMs, kDefaultInviteTtlMs));
    if (days < 1 || days > 365) return fail(Err::BAD_REQUEST, "access can last 1 to 365 days");
    if (ttl < static_cast<uint64_t>(kMsPerMinute) || ttl > static_cast<uint64_t>(kMaxInviteTtlMs)) {
      return fail(Err::BAD_REQUEST, "invite lifetime must be between 1 minute and 24 hours");
    }

    domain::Invite invite;
    invite.patientId = ctx.actor().id;
    invite.role = role;
    invite.scopes = static_cast<uint32_t>(scopes);
    invite.expiresAtMs = ctx.now() + static_cast<int64_t>(ttl);
    invite.grantDays = static_cast<uint32_t>(days);
    invite.nonce.resize(16);
    crypto::randomBytes(invite.nonce.data(), invite.nonce.size());
    const Bytes token = invite.toToken(ctx.vault.keys().signer());

    ctx.audit.patientId = invite.patientId;
    ctx.audit.detail = std::string("invite for a ") + (role == Role::PHARMACY ? "pharmacy" : "prescriber") + ": " +
                       scopeText(invite.scopes);
    codec::Writer w;
    w.str(tag::Invite::PatientId, invite.patientId)
        .u64(tag::Invite::Role, roleValue)
        .u64(tag::Invite::Scopes, invite.scopes)
        .u64(tag::Invite::ExpiresAtMs, static_cast<uint64_t>(invite.expiresAtMs))
        .u64(tag::Invite::GrantDays, invite.grantDays)
        .bytes(tag::Invite::Token, view(token));
    return w;
  }
};

class InviteRedeem final : public ICommand {
 public:
  Cmd id() const override { return Cmd::INVITE_REDEEM; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_ASSIGN(const Provider* me, ctx.policy.provider(ctx.actor()));
    DV_TRY(ctx.policy.requirePurpose(ctx.actor(), ctx.request.context));
    DV_TRY(ctx.args().expectOnly({tag::Arg::Token}));
    DV_ASSIGN(Bytes token, ctx.args().bytes(tag::Arg::Token));
    DV_ASSIGN(auto invite, domain::Invite::fromToken(view(token), ctx.vault.keys().signer().publicKey()));
    ctx.audit.patientId = invite.patientId;

    if (invite.expiresAtMs <= ctx.now()) return fail(Err::EXPIRED, "this invite has expired; ask for a new one");
    if (invite.role != me->role) {
      return fail(Err::FORBIDDEN, invite.role == Role::PHARMACY ? "this invite is for a pharmacy"
                                                                : "this invite is for a prescriber");
    }
    if (invite.patientId == me->id) return fail(Err::FORBIDDEN, "you can't connect to your own record");
    if (ctx.vault.inviteSpent(view(invite.nonce))) return fail(Err::CONFLICT, "this invite has already been used");

    // Spend first (durably), so a crash can never let one invite create two grants.
    DV_TRY(ctx.vault.spendInvite(view(invite.nonce), invite.expiresAtMs));
    if (const auto* old = ctx.vault.activeGrant(invite.patientId, me->id)) {
      Grant replaced = *old;
      replaced.revoked = true;
      DV_TRY(ctx.vault.saveGrant(replaced));
    }
    Grant g;
    g.id = domain::newId();
    g.patientId = invite.patientId;
    g.providerId = me->id;
    g.scopes = invite.scopes;
    g.createdAtMs = ctx.now();
    g.expiresAtMs = g.createdAtMs + static_cast<int64_t>(invite.grantDays) * kMsPerDay;
    DV_TRY(ctx.vault.saveGrant(g));
    ctx.audit.detail = "connected with " + scopeText(g.scopes);

    std::string patientName;
    if (auto snap = ctx.vault.loadSnapshot(g.patientId); snap && snap->has_value()) patientName = (*snap)->displayName;
    return grantView(g, ctx.vault, patientName);
  }
};

class GrantList final : public ICommand {
 public:
  Cmd id() const override { return Cmd::GRANT_LIST; }
  bool audited() const override { return false; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.policy.requireRole(ctx.actor(), {Role::PATIENT}));
    DV_TRY(ctx.args().expectOnly({}));
    std::vector<const Grant*> mine;
    for (const auto& [id, g] : ctx.vault.grants()) {
      if (g.patientId == ctx.actor().id && g.activeAt(ctx.now())) mine.push_back(&g);
    }
    std::sort(mine.begin(), mine.end(), [](const Grant* a, const Grant* b) { return a->createdAtMs > b->createdAtMs; });
    std::vector<codec::Writer> items;
    for (const auto* g : mine) items.push_back(grantView(*g, ctx.vault, ""));
    return listOf(std::move(items));
  }
};

class GrantRevoke final : public ICommand {
 public:
  Cmd id() const override { return Cmd::GRANT_REVOKE; }
  Result<codec::Writer> execute(CommandContext& ctx) const override {
    DV_TRY(ctx.args().expectOnly({tag::Arg::GrantId}));
    DV_ASSIGN(std::string grantId, ctx.args().str(tag::Arg::GrantId));
    const auto* g = ctx.vault.grant(grantId);
    const auto& actor = ctx.actor();
    const bool owner = g && ((actor.role == Role::PATIENT && g->patientId == actor.id) ||
                             (domain::isProviderRole(actor.role) && g->providerId == actor.id));
    if (!owner) return fail(Err::NOT_FOUND, "connection not found");
    ctx.audit.patientId = g->patientId;
    Grant updated = *g;
    if (!updated.revoked) {
      updated.revoked = true;
      DV_TRY(ctx.vault.saveGrant(updated));
    }
    ctx.audit.detail = actor.role == Role::PATIENT ? "patient revoked access" : "provider disconnected";
    return grantView(updated, ctx.vault, "");
  }
};

}  // namespace

CommandList directoryCommands() {
  CommandList out;
  out.push_back(std::make_unique<ProviderRegister>());
  out.push_back(std::make_unique<ProviderGet>());
  out.push_back(std::make_unique<InviteCreate>());
  out.push_back(std::make_unique<InviteRedeem>());
  out.push_back(std::make_unique<GrantList>());
  out.push_back(std::make_unique<GrantRevoke>());
  return out;
}

codec::Writer listOf(std::vector<codec::Writer> items) {
  codec::Writer w;
  for (const auto& item : items) w.msg(tag::List::Item, item);
  return w;
}

std::string scopeText(uint32_t scopes) {
  std::string out;
  auto add = [&](uint32_t flag, const char* label) {
    if (!(scopes & flag)) return;
    if (!out.empty()) out += ", ";
    out += label;
  };
  add(Scope::READ_MEDS, "medications");
  add(Scope::READ_ADHERENCE, "adherence");
  add(Scope::READ_TIMING, "dose timing");
  add(Scope::READ_REFILL, "refills");
  add(Scope::RECEIVE_RX, "receive prescriptions");
  add(Scope::PRESCRIBE, "prescribe");
  return out;
}

CommandList allCommands() {
  CommandList all;
  for (auto* group : {&directoryCommands, &patientCommands, &prescriptionCommands, &operationsCommands}) {
    for (auto& c : (*group)()) all.push_back(std::move(c));
  }
  return all;
}

}  // namespace dosely::service
