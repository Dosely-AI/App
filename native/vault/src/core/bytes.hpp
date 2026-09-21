#pragma once
// Byte buffers and big-endian helpers. Everything on the wire and on disk is
// big-endian with explicit widths — never memcpy'd structs — so layout never
// depends on the compiler or CPU.

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace dosely {

using Bytes = std::vector<uint8_t>;
using ByteView = std::span<const uint8_t>;

inline ByteView view(const Bytes& b) { return {b.data(), b.size()}; }
inline ByteView view(std::string_view s) { return {reinterpret_cast<const uint8_t*>(s.data()), s.size()}; }
inline std::string_view asString(ByteView b) { return {reinterpret_cast<const char*>(b.data()), b.size()}; }

inline void append(Bytes& out, ByteView v) { out.insert(out.end(), v.begin(), v.end()); }

/** Append `width` bytes of `v`, most significant first. */
inline void appendBe(Bytes& out, uint64_t v, int width) {
  for (int i = width - 1; i >= 0; --i) out.push_back(static_cast<uint8_t>(v >> (8 * i)));
}

/** Read `width` big-endian bytes. Caller guarantees `p` has `width` bytes. */
inline uint64_t readBe(const uint8_t* p, int width) {
  uint64_t v = 0;
  for (int i = 0; i < width; ++i) v = (v << 8) | p[i];
  return v;
}

inline std::string toHex(ByteView b) {
  static constexpr char kDigits[] = "0123456789abcdef";
  std::string s;
  s.reserve(b.size() * 2);
  for (uint8_t c : b) {
    s.push_back(kDigits[c >> 4]);
    s.push_back(kDigits[c & 0xf]);
  }
  return s;
}

/** Strict hex decode (even length, [0-9a-fA-F] only). */
inline bool fromHex(std::string_view hex, Bytes& out) {
  auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  if (hex.size() % 2 != 0) return false;
  out.clear();
  out.reserve(hex.size() / 2);
  for (size_t i = 0; i < hex.size(); i += 2) {
    int hi = nibble(hex[i]);
    int lo = nibble(hex[i + 1]);
    if (hi < 0 || lo < 0) return false;
    out.push_back(static_cast<uint8_t>((hi << 4) | lo));
  }
  return true;
}

}  // namespace dosely
