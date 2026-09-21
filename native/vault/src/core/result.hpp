#pragma once
// Status / Result<T>: explicit, typed error handling. Expected failures (bad
// input, forbidden access, tampered data) are values, not exceptions, so every
// failure path is visible at the call site and can't unwind past cleanup.

#include <string>
#include <utility>
#include <variant>

#include "core/protocol.gen.hpp"

namespace dosely {

using proto::Err;

class Status {
 public:
  Status() = default;  // OK
  Status(Err code, std::string message) : code_(code), message_(std::move(message)) {}

  static Status ok() { return {}; }
  bool isOk() const { return code_ == Err::OK; }
  explicit operator bool() const { return isOk(); }
  Err code() const { return code_; }
  const std::string& message() const { return message_; }

 private:
  Err code_ = Err::OK;
  std::string message_;
};

inline Status fail(Err code, std::string message) { return {code, std::move(message)}; }

template <class T>
class Result {
 public:
  Result(T value) : v_(std::move(value)) {}  // NOLINT(implicit)
  Result(Status status) : v_(std::move(status)) {}  // NOLINT(implicit) — must be an error

  bool isOk() const { return std::holds_alternative<T>(v_); }
  explicit operator bool() const { return isOk(); }

  T& value() & { return std::get<T>(v_); }
  const T& value() const& { return std::get<T>(v_); }
  T&& value() && { return std::get<T>(std::move(v_)); }
  T* operator->() { return &std::get<T>(v_); }
  const T* operator->() const { return &std::get<T>(v_); }
  T& operator*() & { return std::get<T>(v_); }
  const T& operator*() const& { return std::get<T>(v_); }

  Status status() const { return isOk() ? Status::ok() : std::get<Status>(v_); }

 private:
  std::variant<T, Status> v_;
};

#define DV_CONCAT_INNER(a, b) a##b
#define DV_CONCAT(a, b) DV_CONCAT_INNER(a, b)

/** Propagate a failed Status. */
#define DV_TRY(expr)                                   \
  do {                                                 \
    ::dosely::Status dv_status_ = (expr);              \
    if (!dv_status_.isOk()) return dv_status_;         \
  } while (0)

/** Unwrap a Result into `lhs`, or propagate its error. */
#define DV_ASSIGN(lhs, expr)                                                   \
  auto DV_CONCAT(dv_result_, __LINE__) = (expr);                              \
  if (!DV_CONCAT(dv_result_, __LINE__)) return DV_CONCAT(dv_result_, __LINE__).status(); \
  lhs = std::move(DV_CONCAT(dv_result_, __LINE__)).value()

}  // namespace dosely
