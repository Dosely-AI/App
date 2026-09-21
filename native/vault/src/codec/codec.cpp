#include "codec/codec.hpp"

#include "monocypher.h"

namespace dosely::codec {

namespace {

namespace limits = proto::Codec;

bool isKnownType(uint8_t t) { return t >= 1 && t <= 6; }

/** Validate [begin, end) as a message; collect top-level fields into `out` when non-null. */
Status scan(const uint8_t* base, uint32_t begin, uint32_t end, uint32_t depth, uint32_t& budget,
            std::vector<Field>* out) {
  if (depth > limits::MAX_DEPTH) return fail(Err::LIMIT, "message nested too deeply");
  uint32_t pos = begin;
  uint16_t prevTag = 0;
  while (pos < end) {
    if (end - pos < kFieldHeaderSize) return fail(Err::BAD_REQUEST, "truncated field header");
    const auto tag = static_cast<uint16_t>(readBe(base + pos, 2));
    const uint8_t rawType = base[pos + 2];
    const auto length = static_cast<uint32_t>(readBe(base + pos + 3, 4));
    pos += kFieldHeaderSize;

    if (tag == 0) return fail(Err::BAD_REQUEST, "field tag 0 is reserved");
    if (tag < prevTag) return fail(Err::BAD_REQUEST, "fields out of canonical order");
    if (budget == 0) return fail(Err::LIMIT, "too many fields");
    --budget;
    if (length > end - pos) return fail(Err::BAD_REQUEST, "truncated field value");
    if (!isKnownType(rawType)) return fail(Err::BAD_REQUEST, "unknown field type");

    const auto type = static_cast<FieldType>(rawType);
    const uint8_t* value = base + pos;
    switch (type) {
      case FieldType::U64:
      case FieldType::I64:
        if (length != 8) return fail(Err::BAD_REQUEST, "integer must be 8 bytes");
        break;
      case FieldType::BOOL:
        if (length != 1 || value[0] > 1) return fail(Err::BAD_REQUEST, "bool must be a single 0/1 byte");
        break;
      case FieldType::BYTES:
        if (length > limits::MAX_BYTES) return fail(Err::LIMIT, "bytes field too long");
        break;
      case FieldType::STR:
        if (length > limits::MAX_STRING) return fail(Err::LIMIT, "string field too long");
        if (!isValidText({reinterpret_cast<const char*>(value), length})) {
          return fail(Err::BAD_REQUEST, "string is not valid UTF-8 text");
        }
        break;
      case FieldType::MSG:
        DV_TRY(scan(base, pos, pos + length, depth + 1, budget, nullptr));
        break;
    }
    if (out) out->push_back({tag, type, pos, length});
    pos += length;
    prevTag = tag;
  }
  return Status::ok();
}

/** Wipes the buffer before freeing: parsed messages often hold decrypted PHI. */
std::shared_ptr<const Bytes> makeShared(ByteView data) {
  return std::shared_ptr<const Bytes>(new Bytes(data.begin(), data.end()), [](const Bytes* b) {
    if (!b->empty()) crypto_wipe(const_cast<uint8_t*>(b->data()), b->size());
    delete b;
  });
}

const char* typeName(FieldType t) {
  switch (t) {
    case FieldType::U64: return "u64";
    case FieldType::I64: return "i64";
    case FieldType::BOOL: return "bool";
    case FieldType::BYTES: return "bytes";
    case FieldType::STR: return "string";
    case FieldType::MSG: return "message";
  }
  return "?";
}

}  // namespace

bool isValidText(std::string_view s) {
  const auto* p = reinterpret_cast<const uint8_t*>(s.data());
  const size_t n = s.size();
  size_t i = 0;
  while (i < n) {
    const uint8_t c = p[i];
    if (c == 0) return false;
    if (c < 0x80) {
      ++i;
      continue;
    }
    size_t len;
    uint32_t cp;
    if (c >= 0xC2 && c <= 0xDF) {
      len = 2;
      cp = c & 0x1Fu;
    } else if (c >= 0xE0 && c <= 0xEF) {
      len = 3;
      cp = c & 0x0Fu;
    } else if (c >= 0xF0 && c <= 0xF4) {
      len = 4;
      cp = c & 0x07u;
    } else {
      return false;  // continuation byte, overlong lead (C0/C1) or > F4
    }
    if (n - i < len) return false;
    for (size_t k = 1; k < len; ++k) {
      const uint8_t cc = p[i + k];
      if ((cc & 0xC0) != 0x80) return false;
      cp = (cp << 6) | (cc & 0x3Fu);
    }
    if ((len == 3 && cp < 0x800) || (len == 4 && cp < 0x10000)) return false;  // overlong
    if (cp >= 0xD800 && cp <= 0xDFFF) return false;                            // surrogate
    if (cp > 0x10FFFF) return false;
    i += len;
  }
  return true;
}

// --- Message -------------------------------------------------------------------

Result<Message> Message::parse(ByteView data) {
  if (data.size() > proto::Frame::MAX_PAYLOAD) return fail(Err::LIMIT, "message too large");
  auto buf = makeShared(data);
  const auto end = static_cast<uint32_t>(buf->size());
  uint32_t budget = limits::MAX_FIELDS;
  std::vector<Field> fields;
  DV_TRY(scan(buf->data(), 0, end, 0, budget, &fields));
  return Message(std::move(buf), 0, end, std::move(fields));
}

bool Message::has(uint16_t tag) const {
  for (const auto& f : fields_) {
    if (f.tag == tag) return true;
  }
  return false;
}

ByteView Message::raw() const {
  if (!buf_) return {};
  return {buf_->data() + begin_, end_ - begin_};
}

Status Message::expectOnly(std::initializer_list<uint16_t> allowed) const {
  for (const auto& f : fields_) {
    bool known = false;
    for (uint16_t t : allowed) known = known || t == f.tag;
    if (!known) return fail(Err::BAD_REQUEST, "unexpected field " + std::to_string(f.tag));
  }
  return Status::ok();
}

Result<const Field*> Message::find(uint16_t tag, FieldType type) const {
  const Field* found = nullptr;
  for (const auto& f : fields_) {
    if (f.tag != tag) continue;
    if (found) return fail(Err::BAD_REQUEST, "duplicate field " + std::to_string(tag));
    if (f.type != type) {
      return fail(Err::BAD_REQUEST, "field " + std::to_string(tag) + " must be " + typeName(type));
    }
    found = &f;
  }
  return found;
}

Result<Message> Message::sub(const Field& f) const {
  // Already validated as part of the parent tree; this only indexes its fields.
  uint32_t budget = limits::MAX_FIELDS;
  std::vector<Field> fields;
  DV_TRY(scan(buf_->data(), f.offset, f.offset + f.length, 0, budget, &fields));
  return Message(buf_, f.offset, f.offset + f.length, std::move(fields));
}

namespace {
Status missing(uint16_t tag) { return fail(Err::BAD_REQUEST, "missing field " + std::to_string(tag)); }
}  // namespace

Result<uint64_t> Message::u64Or(uint16_t tag, uint64_t fallback) const {
  DV_ASSIGN(const Field* f, find(tag, FieldType::U64));
  return f ? readBe(at(*f), 8) : fallback;
}

Result<uint64_t> Message::u64(uint16_t tag) const {
  if (!has(tag)) return missing(tag);
  return u64Or(tag, 0);
}

Result<int64_t> Message::i64Or(uint16_t tag, int64_t fallback) const {
  DV_ASSIGN(const Field* f, find(tag, FieldType::I64));
  return f ? static_cast<int64_t>(readBe(at(*f), 8)) : fallback;
}

Result<int64_t> Message::i64(uint16_t tag) const {
  if (!has(tag)) return missing(tag);
  return i64Or(tag, 0);
}

Result<bool> Message::booleanOr(uint16_t tag, bool fallback) const {
  DV_ASSIGN(const Field* f, find(tag, FieldType::BOOL));
  return f ? at(*f)[0] == 1 : fallback;
}

Result<bool> Message::boolean(uint16_t tag) const {
  if (!has(tag)) return missing(tag);
  return booleanOr(tag, false);
}

Result<std::string> Message::strOr(uint16_t tag, std::string_view fallback) const {
  DV_ASSIGN(const Field* f, find(tag, FieldType::STR));
  if (!f) return std::string(fallback);
  return std::string(reinterpret_cast<const char*>(at(*f)), f->length);
}

Result<std::string> Message::str(uint16_t tag) const {
  if (!has(tag)) return missing(tag);
  return strOr(tag, "");
}

Result<Bytes> Message::bytes(uint16_t tag) const {
  DV_ASSIGN(const Field* f, find(tag, FieldType::BYTES));
  if (!f) return missing(tag);
  return Bytes(at(*f), at(*f) + f->length);
}

Result<Message> Message::msg(uint16_t tag) const {
  DV_ASSIGN(const Field* f, find(tag, FieldType::MSG));
  if (!f) return missing(tag);
  return sub(*f);
}

Result<std::vector<Message>> Message::msgs(uint16_t tag) const {
  std::vector<Message> out;
  for (const auto& f : fields_) {
    if (f.tag != tag) continue;
    if (f.type != FieldType::MSG) return fail(Err::BAD_REQUEST, "field " + std::to_string(tag) + " must be message");
    DV_ASSIGN(auto m, sub(f));
    out.push_back(std::move(m));
  }
  return out;
}

// --- Writer ----------------------------------------------------------------------

Writer::~Writer() {
  if (!out_.empty()) crypto_wipe(out_.data(), out_.size());
}

Writer::Writer(Writer&& other) noexcept
    : out_(std::move(other.out_)), lastTag_(other.lastTag_), status_(std::move(other.status_)) {
  other.out_.clear();
}

Writer& Writer::operator=(Writer&& other) noexcept {
  if (this != &other) {
    if (!out_.empty()) crypto_wipe(out_.data(), out_.size());
    out_ = std::move(other.out_);
    lastTag_ = other.lastTag_;
    status_ = std::move(other.status_);
    other.out_.clear();
  }
  return *this;
}

void Writer::failWith(Err code, std::string message) {
  if (status_.isOk()) status_ = fail(code, std::move(message));
}

bool Writer::header(uint16_t tag, FieldType type, size_t length) {
  if (!status_.isOk()) return false;
  if (tag == 0 || tag < lastTag_) {
    failWith(Err::INTERNAL, "writer: tag " + std::to_string(tag) + " out of canonical order");
    return false;
  }
  if (length > proto::Frame::MAX_PAYLOAD) {
    failWith(Err::LIMIT, "writer: value too large");
    return false;
  }
  appendBe(out_, tag, 2);
  out_.push_back(static_cast<uint8_t>(type));
  appendBe(out_, length, 4);
  lastTag_ = tag;
  return true;
}

Writer& Writer::u64(uint16_t tag, uint64_t v) {
  if (header(tag, FieldType::U64, 8)) appendBe(out_, v, 8);
  return *this;
}

Writer& Writer::i64(uint16_t tag, int64_t v) {
  if (header(tag, FieldType::I64, 8)) appendBe(out_, static_cast<uint64_t>(v), 8);
  return *this;
}

Writer& Writer::boolean(uint16_t tag, bool v) {
  if (header(tag, FieldType::BOOL, 1)) out_.push_back(v ? 1 : 0);
  return *this;
}

Writer& Writer::str(uint16_t tag, std::string_view v) {
  if (v.size() > limits::MAX_STRING) {
    failWith(Err::LIMIT, "writer: string too long");
  } else if (!isValidText(v)) {
    failWith(Err::BAD_REQUEST, "writer: invalid UTF-8 text");
  } else if (header(tag, FieldType::STR, v.size())) {
    append(out_, view(v));
  }
  return *this;
}

Writer& Writer::bytes(uint16_t tag, ByteView v) {
  if (v.size() > limits::MAX_BYTES) {
    failWith(Err::LIMIT, "writer: bytes too long");
  } else if (header(tag, FieldType::BYTES, v.size())) {
    append(out_, v);
  }
  return *this;
}

Writer& Writer::msg(uint16_t tag, const Writer& child) {
  if (!child.status_.isOk()) {
    failWith(child.status_.code(), child.status_.message());
  } else if (header(tag, FieldType::MSG, child.out_.size())) {
    append(out_, view(child.out_));
  }
  return *this;
}

Writer& Writer::msg(uint16_t tag, const Message& child) {
  const ByteView raw = child.raw();
  if (header(tag, FieldType::MSG, raw.size())) append(out_, raw);
  return *this;
}

Result<Bytes> Writer::finish() const {
  if (!status_.isOk()) return status_;
  if (out_.size() > proto::Frame::MAX_PAYLOAD) return fail(Err::LIMIT, "message too large");
  return out_;
}

}  // namespace dosely::codec
