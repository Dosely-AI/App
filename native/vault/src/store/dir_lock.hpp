#pragma once
// Exclusive, process-lifetime lock on the data directory.
//
// Two vault processes appending to the same files would interleave records
// and corrupt version ordering, so a second instance must refuse to start.
// The OS releases the lock automatically if the process dies. Under WebAssembly
// (WASI has no file locks) the host, wasi-host.mjs, holds the lock instead.

#include <filesystem>
#include <memory>

#include "core/result.hpp"

namespace dosely::store {

class DirLock {
 public:
  ~DirLock();
  DirLock(const DirLock&) = delete;
  DirLock& operator=(const DirLock&) = delete;

  /** CONFLICT when another process holds the lock. */
  static Result<std::unique_ptr<DirLock>> acquire(const std::filesystem::path& dir);

 private:
  DirLock() = default;
#if defined(_WIN32)
  void* handle_ = nullptr;
#elif defined(__wasi__)
  std::filesystem::path held_;  // registered in-process; the host holds the OS lock
#else
  int fd_ = -1;
#endif
};

}  // namespace dosely::store
