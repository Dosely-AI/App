// Operating-system CSPRNG. On failure we abort rather than continue with weak
// randomness — a vault must never mint keys or nonces from a broken RNG.

#include <cerrno>
#include <cstdlib>

#include "crypto/secure.hpp"

#if defined(_WIN32)
#include <windows.h>
// windows.h must precede bcrypt.h.
#include <bcrypt.h>
#elif defined(__wasi__)
#include <unistd.h>  // getentropy -> WASI random_get -> the host OS CSPRNG
#elif defined(__linux__)
#include <sys/random.h>
#else
#include <stdlib.h>  // arc4random_buf (macOS / BSD)
#endif

namespace dosely::crypto {

void randomBytes(uint8_t* out, size_t n) {
#if defined(_WIN32)
  while (n > 0) {
    const ULONG chunk = n > 0x10000000u ? 0x10000000u : static_cast<ULONG>(n);
    const auto status = BCryptGenRandom(nullptr, out, chunk, BCRYPT_USE_SYSTEM_PREFERRED_RNG);
    if (status < 0) std::abort();
    out += chunk;
    n -= chunk;
  }
#elif defined(__wasi__)
  while (n > 0) {
    const size_t chunk = n > 256 ? 256 : n;  // getentropy's per-call limit
    if (getentropy(out, chunk) != 0) std::abort();
    out += chunk;
    n -= chunk;
  }
#elif defined(__linux__)
  while (n > 0) {
    const ssize_t r = getrandom(out, n, 0);
    if (r < 0) {
      if (errno == EINTR) continue;
      std::abort();
    }
    out += r;
    n -= static_cast<size_t>(r);
  }
#else
  arc4random_buf(out, n);
#endif
}

}  // namespace dosely::crypto
