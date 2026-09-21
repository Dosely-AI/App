#include "service/dispatcher.hpp"

#include <cstdio>
#include <exception>
#include <new>

namespace dosely::service {

namespace tag = proto::tag;
using proto::Purpose;
using proto::Role;

Dispatcher::Dispatcher(Vault& vault, CommandList commands) : vault_(vault), policy_(vault) {
  for (auto& c : commands) {
    const Cmd id = c->id();
    commands_[id] = std::move(c);
  }
}

Result<Request> Dispatcher::decode(ByteView payload) const {
  DV_ASSIGN(auto m, codec::Message::parse(payload));
  DV_TRY(m.expectOnly({tag::Req::RequestId, tag::Req::Command, tag::Req::Actor, tag::Req::Args, tag::Req::Context}));
  Request r;
  DV_ASSIGN(r.requestId, m.u64(tag::Req::RequestId));
  DV_ASSIGN(uint64_t command, m.u64(tag::Req::Command));
  r.command = static_cast<Cmd>(command);

  DV_ASSIGN(auto actor, m.msg(tag::Req::Actor));
  DV_TRY(actor.expectOnly({tag::Actor::Id, tag::Actor::Role}));
  DV_ASSIGN(r.actor.id, actor.str(tag::Actor::Id));
  DV_ASSIGN(uint64_t role, actor.u64(tag::Actor::Role));
  if (!domain::isValidId(r.actor.id)) return fail(Err::UNAUTHORIZED, "invalid actor");
  if (role < static_cast<uint64_t>(Role::PATIENT) || role > static_cast<uint64_t>(Role::SYSTEM)) {
    return fail(Err::UNAUTHORIZED, "invalid actor role");
  }
  r.actor.role = static_cast<Role>(role);

  if (m.has(tag::Req::Context)) {
    DV_ASSIGN(auto ctx, m.msg(tag::Req::Context));
    DV_TRY(ctx.expectOnly({tag::Ctx::Purpose, tag::Ctx::StepUpAtMs}));
    DV_ASSIGN(uint64_t purpose, ctx.u64Or(tag::Ctx::Purpose, static_cast<uint64_t>(Purpose::PATIENT_REQUEST)));
    if (purpose < static_cast<uint64_t>(Purpose::TREATMENT) || purpose > static_cast<uint64_t>(Purpose::PATIENT_REQUEST)) {
      return fail(Err::BAD_REQUEST, "invalid purpose of use");
    }
    DV_ASSIGN(uint64_t stepUp, ctx.u64Or(tag::Ctx::StepUpAtMs, 0));
    r.context.purpose = static_cast<Purpose>(purpose);
    r.context.stepUpAtMs = static_cast<int64_t>(stepUp);
  }
  if (m.has(tag::Req::Args)) {
    DV_ASSIGN(r.args, m.msg(tag::Req::Args));
  }
  return r;
}

Bytes Dispatcher::respond(uint64_t requestId, const Status& status, const codec::Writer* result) const {
  codec::Writer w;
  w.u64(tag::Resp::RequestId, requestId).u64(tag::Resp::Status, static_cast<uint64_t>(status.code()));
  if (status.isOk() && result) w.msg(tag::Resp::Result, *result);
  if (!status.isOk()) w.str(tag::Resp::Error, status.message());
  auto encoded = w.finish();
  if (encoded) return std::move(encoded).value();
  // The result itself couldn't be encoded (e.g. too large): report that instead.
  codec::Writer fallback;
  fallback.u64(tag::Resp::RequestId, requestId)
      .u64(tag::Resp::Status, static_cast<uint64_t>(encoded.status().code()))
      .str(tag::Resp::Error, encoded.status().message());
  return std::move(fallback.finish()).value();
}

Bytes Dispatcher::handle(ByteView payload) {
  auto decoded = decode(payload);
  if (!decoded) return respond(0, decoded.status(), nullptr);
  const Request& req = *decoded;

  auto it = commands_.find(req.command);
  if (it == commands_.end()) return respond(req.requestId, fail(Err::UNSUPPORTED, "unknown command"), nullptr);
  const ICommand& command = *it->second;
  if (req.actor.role == Role::SYSTEM && command.id() != Cmd::HELLO && command.id() != Cmd::STATS &&
      command.id() != Cmd::AUDIT_QUERY && command.id() != Cmd::AUDIT_VERIFY) {
    return respond(req.requestId, fail(Err::FORBIDDEN, "system actor is limited to health and audit"), nullptr);
  }

  AuditNote note;
  CommandContext ctx{vault_, policy_, req, note};
  Result<codec::Writer> result = fail(Err::INTERNAL, "not executed");
#if defined(__cpp_exceptions)
  try {
    result = command.execute(ctx);
  } catch (const std::bad_alloc&) {
    result = fail(Err::LIMIT, "out of memory");
  } catch (const std::exception&) {
    result = fail(Err::INTERNAL, "internal error");
  }
#else
  // Built without exceptions (WebAssembly): failures are Status values, and
  // anything truly exceptional aborts the process, which the host restarts.
  result = command.execute(ctx);
#endif

  // Validate the encoding before auditing, so the log records what was actually returned.
  Status status = result.status();
  if (status.isOk() && !result->status().isOk()) status = result->status();

  if (command.audited()) {
    store::AuditEntry entry;
    entry.atMs = vault_.clock().nowMs();
    entry.actorId = req.actor.id;
    entry.actorRole = static_cast<uint32_t>(req.actor.role);
    entry.command = static_cast<uint32_t>(req.command);
    entry.patientId = domain::isValidId(note.patientId) ? note.patientId : "";
    entry.purpose = static_cast<uint32_t>(req.context.purpose);
    entry.outcome = static_cast<uint32_t>(status.code());
    entry.detail = status.isOk() ? note.detail : status.message();
    if (const Status logged = vault_.audit().append(std::move(entry)); !logged.isOk()) {
      std::fprintf(stderr, "dosely-vault: audit append failed: %s\n", logged.message().c_str());
      return respond(req.requestId, fail(Err::INTERNAL, "could not record access; request withheld"), nullptr);
    }
  }
  return respond(req.requestId, status, status.isOk() ? &*result : nullptr);
}

}  // namespace dosely::service
