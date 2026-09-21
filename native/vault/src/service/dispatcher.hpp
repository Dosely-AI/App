#pragma once
// Dispatcher: request bytes in, response bytes out, never throws.
//
//   decode Req (strict) -> find command -> execute -> audit -> encode Resp
//
// Every audited command is logged with its outcome, including denials. If an
// access can't be written to the audit log, its result is withheld: data never
// leaves the vault unaccounted for.

#include <map>

#include "core/bytes.hpp"
#include "service/command.hpp"

namespace dosely::service {

class Dispatcher {
 public:
  Dispatcher(Vault& vault, CommandList commands);
  Bytes handle(ByteView requestPayload);

 private:
  Result<Request> decode(ByteView payload) const;
  Bytes respond(uint64_t requestId, const Status& status, const codec::Writer* result) const;

  Vault& vault_;
  policy::AccessPolicy policy_;
  std::map<Cmd, std::unique_ptr<ICommand>> commands_;
};

}  // namespace dosely::service
