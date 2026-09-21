#include "store/append_file.hpp"

#include <system_error>

#if defined(_WIN32)
#include <io.h>
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace dosely::store {

namespace {

/** Open for writing with owner-only permissions on POSIX. `append` selects "ab" vs "wb". */
std::FILE* openForWrite(const std::filesystem::path& path, bool append) {
#if defined(_WIN32)
  return _wfopen(path.c_str(), append ? L"ab" : L"wb");
#else
  const int flags = O_WRONLY | O_CREAT | O_CLOEXEC | (append ? O_APPEND : O_TRUNC);
  const int fd = ::open(path.c_str(), flags, 0600);
  if (fd < 0) return nullptr;
  std::FILE* fp = fdopen(fd, append ? "ab" : "wb");
  if (!fp) ::close(fd);
  return fp;
#endif
}

bool syncFile(std::FILE* fp) {
  if (std::fflush(fp) != 0) return false;
#if defined(_WIN32)
  return _commit(_fileno(fp)) == 0;
#else
  return fsync(fileno(fp)) == 0;
#endif
}

bool writeAll(std::FILE* fp, ByteView data) {
  return data.empty() || std::fwrite(data.data(), 1, data.size(), fp) == data.size();
}

Result<Bytes> readWhole(const std::filesystem::path& path) {
#if defined(_WIN32)
  std::FILE* fp = _wfopen(path.c_str(), L"rb");
#else
  std::FILE* fp = std::fopen(path.c_str(), "rb");
#endif
  if (!fp) return fail(Err::INTERNAL, "cannot open " + path.filename().string());
  Bytes data;
  uint8_t chunk[65536];
  size_t n;
  while ((n = std::fread(chunk, 1, sizeof chunk, fp)) > 0) data.insert(data.end(), chunk, chunk + n);
  const bool error = std::ferror(fp) != 0;
  std::fclose(fp);
  if (error) return fail(Err::INTERNAL, "read error on " + path.filename().string());
  return data;
}

/** Replace `to` with `from` atomically, durably where the platform allows. */
bool atomicRename(const std::filesystem::path& from, const std::filesystem::path& to) {
#if defined(_WIN32)
  return MoveFileExW(from.c_str(), to.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
#else
  if (std::rename(from.c_str(), to.c_str()) != 0) return false;
  const int dir = ::open(to.parent_path().empty() ? "." : to.parent_path().c_str(), O_RDONLY | O_CLOEXEC);
  if (dir >= 0) {
    fsync(dir);
    ::close(dir);
  }
  return true;
#endif
}

Status writeFileAtomically(const std::filesystem::path& path, ByteView header, const std::vector<Bytes>& records) {
  auto tmp = path;
  tmp += ".tmp";
  std::FILE* fp = openForWrite(tmp, false);
  if (!fp) return fail(Err::INTERNAL, "cannot create " + tmp.filename().string());
  bool ok = writeAll(fp, header);
  for (const auto& r : records) {
    Bytes len;
    appendBe(len, r.size(), 4);
    ok = ok && writeAll(fp, view(len)) && writeAll(fp, view(r));
  }
  ok = syncFile(fp) && ok;
  ok = std::fclose(fp) == 0 && ok;
  if (!ok || !atomicRename(tmp, path)) {
    std::error_code ec;
    std::filesystem::remove(tmp, ec);
    return fail(Err::INTERNAL, "failed to write " + path.filename().string());
  }
  return Status::ok();
}

}  // namespace

AppendFile::~AppendFile() {
  if (fp_) std::fclose(fp_);
}

Result<std::vector<Bytes>> AppendFile::parse(const Bytes& data, std::string_view magic, size_t& goodLength) {
  if (data.size() < kFileHeaderSize) return fail(Err::INTEGRITY, "file header is truncated");
  if (asString({data.data(), magic.size()}) != magic) return fail(Err::INTEGRITY, "wrong file type (bad magic)");
  std::vector<Bytes> records;
  size_t pos = kFileHeaderSize;
  while (pos < data.size()) {
    if (data.size() - pos < 4) break;  // torn length
    const size_t len = readBe(data.data() + pos, 4);
    if (len == 0 || len > proto::Frame::MAX_PAYLOAD) return fail(Err::INTEGRITY, "corrupt record length");
    if (data.size() - pos - 4 < len) break;  // torn body
    records.emplace_back(data.begin() + static_cast<std::ptrdiff_t>(pos + 4),
                         data.begin() + static_cast<std::ptrdiff_t>(pos + 4 + len));
    pos += 4 + len;
  }
  goodLength = pos;
  return records;
}

Result<std::unique_ptr<AppendFile>> AppendFile::open(const std::filesystem::path& path, std::string_view magic,
                                                     ByteView freshHeader) {
  std::unique_ptr<AppendFile> f(new AppendFile());
  f->path_ = path;
  f->magic_ = std::string(magic);

  std::error_code ec;
  if (!std::filesystem::exists(path, ec)) {
    if (freshHeader.size() != kFileHeaderSize || asString(freshHeader.first(magic.size())) != magic) {
      return fail(Err::INTERNAL, "invalid fresh header");
    }
    DV_TRY(writeFileAtomically(path, freshHeader, {}));
    f->created_ = true;
  }

  DV_ASSIGN(Bytes data, readWhole(path));
  size_t goodLength = 0;
  DV_ASSIGN(f->records_, parse(data, magic, goodLength));
  f->header_.assign(data.begin(), data.begin() + kFileHeaderSize);

  if (goodLength < data.size()) {
    // A crash interrupted the last append: drop the partial record.
    std::filesystem::resize_file(path, goodLength, ec);
    if (ec) return fail(Err::INTERNAL, "cannot truncate torn tail: " + ec.message());
    f->truncatedTail_ = true;
  }

  f->fp_ = openForWrite(path, true);
  if (!f->fp_) return fail(Err::INTERNAL, "cannot open " + path.filename().string() + " for append");
  return f;
}

Status AppendFile::append(ByteView record) {
  if (record.empty() || record.size() > proto::Frame::MAX_PAYLOAD) return fail(Err::LIMIT, "record size out of range");
  Bytes framed;
  framed.reserve(4 + record.size());
  appendBe(framed, record.size(), 4);
  dosely::append(framed, record);
  if (!writeAll(fp_, view(framed)) || !syncFile(fp_)) return fail(Err::INTERNAL, "durable append failed");
  return Status::ok();
}

Status AppendFile::replace(ByteView header, const std::vector<Bytes>& records) {
  if (fp_) {
    std::fclose(fp_);
    fp_ = nullptr;
  }
  const Status written = writeFileAtomically(path_, header, records);
  fp_ = openForWrite(path_, true);
  if (!written.isOk()) return written;
  if (!fp_) return fail(Err::INTERNAL, "cannot reopen after replace");
  header_.assign(header.begin(), header.end());
  return Status::ok();
}

Result<std::vector<Bytes>> AppendFile::reread() const {
  DV_ASSIGN(Bytes data, readWhole(path_));
  size_t goodLength = 0;
  return parse(data, magic_, goodLength);
}

}  // namespace dosely::store
