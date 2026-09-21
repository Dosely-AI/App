#pragma once
// Secret material that cleans up after itself.
//
// Secret<N>    fixed-size key material; move-only, wiped on destruction and
//              when moved-from, so keys never linger in freed memory.
// SecureBytes  variable-size plaintext buffer with the same guarantees.
//
// Copies must be explicit (`clone()`), which keeps accidental key duplication
// out of the codebase.

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>

#include "core/bytes.hpp"
#include "monocypher.h"

namespace dosely::crypto {

void randomBytes(uint8_t* out, size_t n);

template <size_t N>
class Secret {
 public:
  Secret() { bytes_.fill(0); }
  ~Secret() { crypto_wipe(bytes_.data(), N); }

  Secret(const Secret&) = delete;
  Secret& operator=(const Secret&) = delete;
  Secret(Secret&& other) noexcept : bytes_(other.bytes_) { crypto_wipe(other.bytes_.data(), N); }
  Secret& operator=(Secret&& other) noexcept {
    if (this != &other) {
      bytes_ = other.bytes_;
      crypto_wipe(other.bytes_.data(), N);
    }
    return *this;
  }

  static Secret random() {
    Secret s;
    randomBytes(s.bytes_.data(), N);
    return s;
  }

  /** Construct from exactly N bytes; returns false on size mismatch. */
  static bool from(ByteView v, Secret& out) {
    if (v.size() != N) return false;
    for (size_t i = 0; i < N; ++i) out.bytes_[i] = v[i];
    return true;
  }

  Secret clone() const {
    Secret s;
    s.bytes_ = bytes_;
    return s;
  }

  uint8_t* data() { return bytes_.data(); }
  const uint8_t* data() const { return bytes_.data(); }
  static constexpr size_t size() { return N; }
  ByteView view() const { return {bytes_.data(), N}; }

 private:
  std::array<uint8_t, N> bytes_;
};

using Key32 = Secret<32>;

class SecureBytes {
 public:
  SecureBytes() = default;
  explicit SecureBytes(Bytes b) : b_(std::move(b)) {}
  ~SecureBytes() { wipe(); }

  SecureBytes(const SecureBytes&) = delete;
  SecureBytes& operator=(const SecureBytes&) = delete;
  SecureBytes(SecureBytes&& o) noexcept : b_(std::move(o.b_)) { o.b_.clear(); }
  SecureBytes& operator=(SecureBytes&& o) noexcept {
    if (this != &o) {
      wipe();
      b_ = std::move(o.b_);
      o.b_.clear();
    }
    return *this;
  }

  Bytes& raw() { return b_; }
  ByteView view() const { return dosely::view(b_); }
  size_t size() const { return b_.size(); }

 private:
  void wipe() {
    if (!b_.empty()) crypto_wipe(b_.data(), b_.size());
    b_.clear();
  }
  Bytes b_;
};

}  // namespace dosely::crypto
