#pragma once
// Canonical TLV codec — the vault's only serializer, used on the wire and on
// disk alike.
//
//   field := tag:u16be  type:u8  length:u32be  value[length]
//
// Serialization safety comes from being strict rather than clever:
//   * canonical   integers are fixed-width, BOOL is exactly 0/1 and tags are in
//                 non-decreasing order, so every value has exactly one encoding
//                 and a MAC/signature over the bytes covers the meaning;
//   * bounded     depth, field count, string/bytes length and total size are
//                 checked before anything is allocated;
//   * typed       STR must be valid UTF-8 with no NUL, a nested MSG must itself
//                 be a valid message, and getters reject wrong types, duplicates
//                 and (via expectOnly) unknown fields;
//   * copy-safe   a parsed Message owns its buffer (wiped when released) and
//                 addresses fields by offset — no views into caller memory.

#include <cstdint>
#include <initializer_list>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "core/bytes.hpp"
#include "core/result.hpp"

namespace dosely::codec {

using proto::FieldType;

inline constexpr size_t kFieldHeaderSize = 7;

struct Field {
  uint16_t tag;
  FieldType type;
  uint32_t offset;  // value offset within the shared buffer
  uint32_t length;
};

/** True for well-formed UTF-8 (no overlongs, surrogates or > U+10FFFF) without NUL. */
bool isValidText(std::string_view s);

class Message {
 public:
  Message() = default;

  /** Validate an encoded message (the whole tree) and take a private copy. */
  static Result<Message> parse(ByteView data);

  const std::vector<Field>& fields() const { return fields_; }
  bool empty() const { return fields_.empty(); }
  bool has(uint16_t tag) const;
  /** The encoded bytes of this message. */
  ByteView raw() const;

  /** Reject any field whose tag is not listed (forward-compat is opt-in). */
  Status expectOnly(std::initializer_list<uint16_t> allowed) const;

  // Required single-valued getters: missing, duplicated or mistyped -> BAD_REQUEST.
  Result<uint64_t> u64(uint16_t tag) const;
  Result<int64_t> i64(uint16_t tag) const;
  Result<bool> boolean(uint16_t tag) const;
  Result<std::string> str(uint16_t tag) const;
  Result<Bytes> bytes(uint16_t tag) const;
  Result<Message> msg(uint16_t tag) const;

  // Optional getters: absent -> fallback; duplicated or mistyped -> BAD_REQUEST.
  Result<uint64_t> u64Or(uint16_t tag, uint64_t fallback) const;
  Result<int64_t> i64Or(uint16_t tag, int64_t fallback) const;
  Result<bool> booleanOr(uint16_t tag, bool fallback) const;
  Result<std::string> strOr(uint16_t tag, std::string_view fallback) const;

  /** Every occurrence of a repeated MSG field, in order. */
  Result<std::vector<Message>> msgs(uint16_t tag) const;

 private:
  Message(std::shared_ptr<const Bytes> buf, uint32_t begin, uint32_t end, std::vector<Field> fields)
      : buf_(std::move(buf)), begin_(begin), end_(end), fields_(std::move(fields)) {}

  /** The single field with `tag`: nullptr when absent, error when duplicated or mistyped. */
  Result<const Field*> find(uint16_t tag, FieldType type) const;
  Result<Message> sub(const Field& f) const;
  const uint8_t* at(const Field& f) const { return buf_->data() + f.offset; }

  std::shared_ptr<const Bytes> buf_;
  uint32_t begin_ = 0;
  uint32_t end_ = 0;
  std::vector<Field> fields_;
};

/** Builds a canonical message. Misuse (out-of-order tags, invalid text,
 * oversized values) is recorded and reported by `finish()`, never emitted. */
class Writer {
 public:
  Writer() = default;
  ~Writer();
  Writer(const Writer&) = delete;
  Writer& operator=(const Writer&) = delete;
  Writer(Writer&& other) noexcept;
  Writer& operator=(Writer&& other) noexcept;

  Writer& u64(uint16_t tag, uint64_t v);
  Writer& i64(uint16_t tag, int64_t v);
  Writer& boolean(uint16_t tag, bool v);
  Writer& str(uint16_t tag, std::string_view v);
  Writer& bytes(uint16_t tag, ByteView v);
  Writer& msg(uint16_t tag, const Writer& child);
  /** Embed an already-validated message. */
  Writer& msg(uint16_t tag, const Message& child);

  const Status& status() const { return status_; }
  bool empty() const { return out_.empty(); }
  /** The encoding, or the first recorded error. */
  Result<Bytes> finish() const;

 private:
  bool header(uint16_t tag, FieldType type, size_t length);
  void failWith(Err code, std::string message);

  Bytes out_;
  uint16_t lastTag_ = 0;
  Status status_;
};

}  // namespace dosely::codec
