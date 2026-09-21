#pragma once
// Time is injected (never read ad hoc) so expiry, replay windows and refill
// math are deterministic under test.

#include <chrono>
#include <cstdint>

namespace dosely {

inline constexpr int64_t kMsPerMinute = 60'000;
inline constexpr int64_t kMsPerDay = 86'400'000;

class Clock {
 public:
  virtual ~Clock() = default;
  virtual int64_t nowMs() const = 0;
  /** Days since the Unix epoch (UTC). */
  int64_t today() const { return floorDiv(nowMs(), kMsPerDay); }

  static int64_t floorDiv(int64_t a, int64_t b) { return a >= 0 ? a / b : -((-a + b - 1) / b); }
};

class SystemClock final : public Clock {
 public:
  int64_t nowMs() const override {
    using namespace std::chrono;
    return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
  }
};

class FixedClock final : public Clock {
 public:
  explicit FixedClock(int64_t ms) : ms_(ms) {}
  int64_t nowMs() const override { return ms_; }
  void set(int64_t ms) { ms_ = ms; }
  void advance(int64_t ms) { ms_ += ms; }

 private:
  int64_t ms_;
};

}  // namespace dosely
