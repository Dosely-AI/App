#pragma once
// A deliberately tiny test harness: no dependencies, readable failures.
//
//   TEST(name) { CHECK(x); CHECK_EQ(a, b); REQUIRE(ptr != nullptr); }
//
// CHECK records a failure and continues; REQUIRE stops the current test.

#include <cstdio>
#include <cstdlib>
#include <type_traits>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "core/bytes.hpp"

namespace dosely::test {

struct Case {
  const char* name;
  std::function<void()> fn;
};

inline std::vector<Case>& cases() {
  static std::vector<Case> all;
  return all;
}

struct Registrar {
  Registrar(const char* name, std::function<void()> fn) { cases().push_back({name, std::move(fn)}); }
};

inline int& failures() {
  static int n = 0;
  return n;
}

struct Abort {};

/** Abandon the current test: unwinds where exceptions exist, else ends the run. */
[[noreturn]] inline void stopTest() {
#if defined(__cpp_exceptions)
  throw Abort{};
#else
  std::fprintf(stderr, "    (stopping: built without exceptions)\n");
  std::exit(1);
#endif
}

inline void report(const char* file, int line, const std::string& what) {
  ++failures();
  std::fprintf(stderr, "    FAIL %s:%d: %s\n", file, line, what.c_str());
}

template <class T>
std::string show(const T& v) {
  if constexpr (std::is_same_v<T, Bytes>) {
    return toHex(view(v));
  } else if constexpr (std::is_enum_v<T>) {
    return std::to_string(static_cast<long long>(v));
  } else {
    std::ostringstream s;
    s << v;
    return s.str();
  }
}

inline Bytes hex(std::string_view h) {
  Bytes out;
  if (!fromHex(h, out)) std::abort();
  return out;
}

}  // namespace dosely::test

#define DV_TEST_CAT2(a, b) a##b
#define DV_TEST_CAT(a, b) DV_TEST_CAT2(a, b)

#define TEST(name)                                                                        \
  static void name();                                                                     \
  static ::dosely::test::Registrar DV_TEST_CAT(name, _registrar)(#name, name);            \
  static void name()

#define CHECK(cond)                                                          \
  do {                                                                       \
    if (!(cond)) ::dosely::test::report(__FILE__, __LINE__, "CHECK(" #cond ")"); \
  } while (0)

#define CHECK_EQ(a, b)                                                                              \
  do {                                                                                              \
    /* copies, not references: operands are often views into temporaries */                       \
    const auto dv_a = (a);                                                                          \
    const auto dv_b = (b);                                                                          \
    if (!(dv_a == dv_b)) {                                                                          \
      ::dosely::test::report(__FILE__, __LINE__,                                                    \
                             std::string(#a " == " #b "  [") + ::dosely::test::show(dv_a) + " vs " + \
                                 ::dosely::test::show(dv_b) + "]");                                 \
    }                                                                                               \
  } while (0)

#define REQUIRE(cond)                                                          \
  do {                                                                         \
    if (!(cond)) {                                                             \
      ::dosely::test::report(__FILE__, __LINE__, "REQUIRE(" #cond ")");        \
      ::dosely::test::stopTest();                                              \
    }                                                                          \
  } while (0)

/** Assert a Result/Status failed with a specific error code. */
#define CHECK_ERR(expr, expected_code)                                                                     \
  do {                                                                                            \
    const auto dv_s = ::dosely::test::statusOf(expr);                                             \
    if (dv_s.isOk() || dv_s.code() != (expected_code)) {                                                   \
      ::dosely::test::report(__FILE__, __LINE__,                                                  \
                             std::string(#expr " -> expected " #expected_code ", got ") +                  \
                                 ::dosely::test::show(dv_s.code()) + " " + dv_s.message());       \
    }                                                                                             \
  } while (0)

#include "core/result.hpp"

namespace dosely::test {
inline Status statusOf(const Status& s) { return s; }
template <class T>
Status statusOf(const Result<T>& r) {
  return r.status();
}
}  // namespace dosely::test
