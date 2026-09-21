#pragma once
// Durable append-only file:  header(64)  { length:u32be  record[length] }*
//
// Appends are flushed and fsync'd before returning, so an acknowledged write
// survives a crash. A torn tail (crash mid-append) is truncated back to the
// last complete record on open; any other malformation is reported so the
// owner can fail closed. New files are created atomically (temp + rename) and,
// on POSIX, with owner-only permissions.

#include <cstdio>
#include <filesystem>
#include <memory>
#include <string_view>
#include <vector>

#include "core/bytes.hpp"
#include "core/result.hpp"

namespace dosely::store {

inline constexpr size_t kFileHeaderSize = 64;

class AppendFile {
 public:
  ~AppendFile();
  AppendFile(const AppendFile&) = delete;
  AppendFile& operator=(const AppendFile&) = delete;

  /** Open `path`, creating it with `freshHeader` (64 bytes) when absent.
   * The first four header bytes must equal `magic`. */
  static Result<std::unique_ptr<AppendFile>> open(const std::filesystem::path& path, std::string_view magic,
                                                  ByteView freshHeader);

  bool created() const { return created_; }
  bool truncatedTail() const { return truncatedTail_; }
  const Bytes& header() const { return header_; }
  /** The complete records found at open (moved out; call once). */
  std::vector<Bytes> takeRecords() { return std::move(records_); }

  Status append(ByteView record);
  /** Atomically replace the whole file (write temp, fsync, rename). */
  Status replace(ByteView header, const std::vector<Bytes>& records);
  /** Re-read the records currently on disk (for integrity re-verification). */
  Result<std::vector<Bytes>> reread() const;

 private:
  AppendFile() = default;
  static Result<std::vector<Bytes>> parse(const Bytes& data, std::string_view magic, size_t& goodLength);

  std::filesystem::path path_;
  std::string magic_;
  std::FILE* fp_ = nullptr;
  Bytes header_;
  std::vector<Bytes> records_;
  bool created_ = false;
  bool truncatedTail_ = false;
};

}  // namespace dosely::store
