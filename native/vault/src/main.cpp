// dosely-vault: the encrypted patient database, run as a separate process.
//
//   dosely-vault --data <dir> [--key-file <path> | --passphrase-env <VAR>] [--dev-auto-verify]
//   dosely-vault --init-key-file <path>
//
// The parent (the Node API server) spawns the vault and writes a bootstrap
// block to its stdin: "DOSELY-VAULT-KEY" + a fresh random 32-byte session key.
// After that, stdin/stdout carry only authenticated frames (net/frame.hpp).
// Nothing but diagnostics goes to stderr, and never patient data.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>

#include "core/clock.hpp"
#include "net/frame.hpp"
#include "service/dispatcher.hpp"

#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#elif defined(__wasi__)
// Sandboxed WebAssembly: no core dumps or ptrace to disable from inside.
#else
#include <sys/resource.h>
#if defined(__linux__)
#include <sys/prctl.h>
#endif
#endif

using namespace dosely;

namespace {

constexpr std::string_view kBootstrapMagic = "DOSELY-VAULT-KEY";

class StdinSource final : public net::ByteSource {
 public:
  size_t read(uint8_t* dst, size_t n) override { return std::fread(dst, 1, n, stdin); }
};

class StdoutSink final : public net::ByteSink {
 public:
  bool write(ByteView data) override {
    return std::fwrite(data.data(), 1, data.size(), stdout) == data.size() && std::fflush(stdout) == 0;
  }
};

void hardenProcess() {
#if defined(_WIN32)
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#elif defined(__wasi__)
#else
  // Keys must never land in a core dump.
  rlimit none{0, 0};
  setrlimit(RLIMIT_CORE, &none);
#if defined(__linux__)
  prctl(PR_SET_DUMPABLE, 0, 0, 0, 0);  // also blocks same-user ptrace
#endif
#endif
}

int usage() {
  std::fprintf(stderr,
               "usage: dosely-vault --data <dir> [--key-file <path> | --passphrase-env <VAR>] [--dev-auto-verify]\n"
               "       dosely-vault --init-key-file <path>\n");
  return 64;
}

int die(int code, const std::string& message) {
  std::fprintf(stderr, "dosely-vault: %s\n", message.c_str());
  return code;
}

}  // namespace

int main(int argc, char** argv) {
  hardenProcess();

  std::string dataDir, keyFile, passphraseEnv, initKeyFile;
  bool devAutoVerify = false;
  for (int i = 1; i < argc; ++i) {
    const std::string_view arg = argv[i];
    auto next = [&](std::string& out) {
      if (i + 1 >= argc) return false;
      out = argv[++i];
      return true;
    };
    bool ok = true;
    if (arg == "--data") ok = next(dataDir);
    else if (arg == "--key-file") ok = next(keyFile);
    else if (arg == "--passphrase-env") ok = next(passphraseEnv);
    else if (arg == "--init-key-file") ok = next(initKeyFile);
    else if (arg == "--dev-auto-verify") devAutoVerify = true;
    else ok = false;
    if (!ok) return usage();
  }

  if (!initKeyFile.empty()) {
    const Status s = store::MasterKey::createKeyFile(initKeyFile);
    if (!s.isOk()) return die(1, s.message());
    std::fprintf(stderr, "dosely-vault: wrote a new key file. Keep it off the data volume and backed up.\n");
    return 0;
  }
  if (dataDir.empty() || keyFile.empty() == passphraseEnv.empty()) return usage();

  // --- Master key and database ---------------------------------------------------
  Result<store::MasterKey> master = fail(Err::INTERNAL, "no key source");
  if (!keyFile.empty()) {
    master = store::MasterKey::fromKeyFile(keyFile);
  } else {
    const char* pass = std::getenv(passphraseEnv.c_str());
    if (!pass) return die(2, "passphrase environment variable is not set");
    master = store::MasterKey::fromPassphrase(pass);
  }
  if (!master) return die(2, master.status().message());

  SystemClock clock;
  service::VaultOptions options{dataDir, devAutoVerify};
  auto vault = service::Vault::open(options, *master, clock);
  if (!vault) return die(2, "cannot open vault: " + vault.status().message());
  if (devAutoVerify) std::fprintf(stderr, "dosely-vault: DEV MODE — providers are auto-verified. Never use in production.\n");

  // --- Session key bootstrap ---------------------------------------------------------
  uint8_t bootstrap[16 + 32];
  if (std::fread(bootstrap, 1, sizeof bootstrap, stdin) != sizeof bootstrap ||
      std::memcmp(bootstrap, kBootstrapMagic.data(), kBootstrapMagic.size()) != 0) {
    crypto_wipe(bootstrap, sizeof bootstrap);
    return die(3, "missing or malformed session bootstrap");
  }
  crypto::Key32 session;
  crypto::Key32::from({bootstrap + 16, 32}, session);
  crypto_wipe(bootstrap, sizeof bootstrap);
  const auto keys = net::ChannelKeys::derive(session);

  // --- Serve --------------------------------------------------------------------------
  StdinSource in;
  StdoutSink out;
  auto channel = net::Channel::server(in, out, keys, clock);
  service::Dispatcher dispatcher(**vault, service::allCommands());
  std::fprintf(stderr, "dosely-vault: ready\n");

  for (;;) {
    auto frame = channel.receive();
    if (!frame) return die(4, "channel closed: " + frame.status().message());
    if (!frame->has_value()) return 0;  // parent closed stdin: clean shutdown
    Bytes response = dispatcher.handle((*frame)->view());
    const Status sent = channel.send(view(response));
    crypto_wipe(response.data(), response.size());
    if (!sent.isOk()) return die(5, "cannot write response");
  }
}
