#include "store/dir_lock.hpp"

#if defined(_WIN32)
#include <windows.h>
#elif defined(__wasi__)
#include <set>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

namespace dosely::store {

#if defined(__wasi__)
namespace {
// WASI has no file locks. Across processes the host (wasi-host.mjs) holds
// <dir>/vault.lock; within this process (single-threaded), this registry
// refuses a second open.
std::set<std::filesystem::path> gHeld;
}  // namespace
#endif

DirLock::~DirLock() {
#if defined(_WIN32)
  if (handle_) CloseHandle(static_cast<HANDLE>(handle_));
#elif defined(__wasi__)
  if (!held_.empty()) gHeld.erase(held_);
#else
  if (fd_ >= 0) close(fd_);  // releases the flock
#endif
}

Result<std::unique_ptr<DirLock>> DirLock::acquire(const std::filesystem::path& dir) {
  const auto path = dir / "vault.lock";
  std::unique_ptr<DirLock> lock(new DirLock());
#if defined(_WIN32)
  // Share mode 0: no other process can open the file while we hold it.
  HANDLE h = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_ALWAYS,
                         FILE_ATTRIBUTE_NORMAL | FILE_FLAG_DELETE_ON_CLOSE, nullptr);
  if (h == INVALID_HANDLE_VALUE) {
    if (GetLastError() == ERROR_SHARING_VIOLATION) return fail(Err::CONFLICT, "vault data is in use by another process");
    return fail(Err::INTERNAL, "cannot create lock file");
  }
  lock->handle_ = h;
#elif defined(__wasi__)
  (void)path;
  const auto key = std::filesystem::absolute(dir).lexically_normal();
  if (!gHeld.insert(key).second) return fail(Err::CONFLICT, "vault data is in use by another process");
  lock->held_ = key;
#else
  const int fd = ::open(path.c_str(), O_RDWR | O_CREAT | O_CLOEXEC, 0600);
  if (fd < 0) return fail(Err::INTERNAL, "cannot create lock file");
  if (flock(fd, LOCK_EX | LOCK_NB) != 0) {
    ::close(fd);
    return fail(Err::CONFLICT, "vault data is in use by another process");
  }
  lock->fd_ = fd;
#endif
  return lock;
}

}  // namespace dosely::store
