#pragma once
// Commands: one class per operation, all behind ICommand.
//
// Each command validates its own arguments (expectOnly + bounded getters),
// asks the AccessPolicy before touching data, and fills in an AuditNote. The
// Dispatcher owns everything cross-cutting — decoding, error mapping,
// auditing, encoding — so a command is only its business rule.

#include <memory>
#include <string>
#include <vector>

#include "codec/codec.hpp"
#include "policy/access_policy.hpp"
#include "service/vault.hpp"

namespace dosely::service {

using policy::Actor;
using policy::RequestContext;
using proto::Cmd;

struct Request {
  uint64_t requestId = 0;
  Cmd command = Cmd::HELLO;
  Actor actor;
  RequestContext context;
  codec::Message args;
};

/** What the audit log should say about this command (never clinical content). */
struct AuditNote {
  std::string patientId;
  std::string detail;
};

struct CommandContext {
  Vault& vault;
  const policy::AccessPolicy& policy;
  const Request& request;
  AuditNote& audit;

  const Actor& actor() const { return request.actor; }
  const codec::Message& args() const { return request.args; }
  int64_t now() const { return vault.clock().nowMs(); }
  int64_t today() const { return vault.clock().today(); }
};

class ICommand {
 public:
  virtual ~ICommand() = default;
  virtual Cmd id() const = 0;
  /** Housekeeping reads (HELLO, STATS, directory lookups) are not audited. */
  virtual bool audited() const { return true; }
  virtual Result<codec::Writer> execute(CommandContext& ctx) const = 0;
};

using CommandList = std::vector<std::unique_ptr<ICommand>>;

CommandList directoryCommands();     // providers, invites, grants
CommandList patientCommands();       // snapshot, summary, erase, provider patient list
CommandList prescriptionCommands();  // create, list, get, status
CommandList operationsCommands();    // hello, stats, worklist, audit
CommandList allCommands();

// Shared helpers.
/** Wrap a list of messages as List{Item*}. */
codec::Writer listOf(std::vector<codec::Writer> items);
std::string scopeText(uint32_t scopes);

}  // namespace dosely::service
