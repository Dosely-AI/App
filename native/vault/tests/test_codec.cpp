// Codec: round-trips, canonical-form enforcement, bounds, and a fuzz pass that
// throws garbage and truncations at the parser (it must fail cleanly, never crash).

#include <random>

#include "codec/codec.hpp"
#include "harness.hpp"

using namespace dosely;
using codec::Message;
using codec::Writer;

namespace {

Bytes encode(const Writer& w) {
  auto r = w.finish();
  if (!r) std::abort();
  return std::move(r).value();
}

/** Hand-build one raw field (bypassing the Writer's own checks). */
Bytes rawField(uint16_t tag, uint8_t type, ByteView value) {
  Bytes out;
  appendBe(out, tag, 2);
  out.push_back(type);
  appendBe(out, value.size(), 4);
  append(out, value);
  return out;
}

}  // namespace

TEST(codec_roundtrip_all_types) {
  Writer inner;
  inner.str(1, "metformin").u64(2, 500);
  Writer w;
  w.u64(1, 0xFFFFFFFFFFFFFFFFull)
      .i64(2, -42)
      .boolean(3, true)
      .bytes(4, view(Bytes{0, 1, 2}))
      .str(5, "héllo ✓")
      .msg(6, inner)
      .msg(6, inner);
  const Bytes enc = encode(w);

  auto m = Message::parse(view(enc));
  REQUIRE(m.isOk());
  CHECK_EQ(*m->u64(1), 0xFFFFFFFFFFFFFFFFull);
  CHECK_EQ(*m->i64(2), -42);
  CHECK_EQ(*m->boolean(3), true);
  CHECK_EQ(*m->bytes(4), (Bytes{0, 1, 2}));
  CHECK_EQ(*m->str(5), std::string("héllo ✓"));
  auto items = m->msgs(6);
  REQUIRE(items.isOk());
  CHECK_EQ(items->size(), size_t{2});
  CHECK_EQ(*(*items)[0].str(1), std::string("metformin"));
  CHECK_EQ(*(*items)[1].u64(2), uint64_t{500});

  // Canonical: re-encoding what we parsed reproduces the exact bytes.
  Writer again;
  again.u64(1, *m->u64(1)).i64(2, *m->i64(2)).boolean(3, *m->boolean(3)).bytes(4, view(*m->bytes(4)));
  again.str(5, *m->str(5)).msg(6, (*items)[0]).msg(6, (*items)[1]);
  CHECK_EQ(encode(again), enc);
}

TEST(codec_getters_reject_missing_duplicate_and_mistyped) {
  Writer w;
  w.u64(1, 1).u64(1, 2).str(2, "x");
  auto m = Message::parse(view(encode(w)));
  REQUIRE(m.isOk());
  CHECK_ERR(m->u64(1), Err::BAD_REQUEST);    // duplicate
  CHECK_ERR(m->u64(2), Err::BAD_REQUEST);    // wrong type
  CHECK_ERR(m->u64(3), Err::BAD_REQUEST);    // missing
  CHECK_EQ(*m->u64Or(3, 7), uint64_t{7});    // optional absent
  CHECK_ERR(m->expectOnly({1}), Err::BAD_REQUEST);
  CHECK(m->expectOnly({1, 2}).isOk());
}

TEST(codec_rejects_non_canonical_encodings) {
  const Bytes eight(8, 0), one = {1}, two = {2};
  // Out-of-order tags.
  Bytes outOfOrder = rawField(2, 1, view(eight));
  append(outOfOrder, view(rawField(1, 1, view(eight))));
  CHECK_ERR(Message::parse(view(outOfOrder)), Err::BAD_REQUEST);
  // Tag zero, short integer, bool that isn't 0/1, unknown type.
  CHECK_ERR(Message::parse(view(rawField(0, 1, view(eight)))), Err::BAD_REQUEST);
  CHECK_ERR(Message::parse(view(rawField(1, 1, view(Bytes(4, 0))))), Err::BAD_REQUEST);
  CHECK_ERR(Message::parse(view(rawField(1, 3, view(two)))), Err::BAD_REQUEST);
  CHECK(Message::parse(view(rawField(1, 3, view(one)))).isOk());
  CHECK_ERR(Message::parse(view(rawField(1, 7, view(one)))), Err::BAD_REQUEST);
}

TEST(codec_rejects_invalid_text) {
  const char* bad[] = {
      "\xC0\xAF",          // overlong '/'
      "\xE0\x80\xAF",      // overlong
      "\xED\xA0\x80",      // UTF-16 surrogate
      "\xF4\x90\x80\x80",  // > U+10FFFF
      "\x80",              // stray continuation
      "\xE2\x82",          // truncated sequence
  };
  for (const char* s : bad) {
    CHECK(!codec::isValidText(s));
    CHECK_ERR(Message::parse(view(rawField(1, 5, view(std::string_view(s))))), Err::BAD_REQUEST);
  }
  const Bytes withNul = {'a', 0, 'b'};
  CHECK_ERR(Message::parse(view(rawField(1, 5, view(withNul)))), Err::BAD_REQUEST);
  CHECK(codec::isValidText("Paracétamol · 500 mg 💊"));

  Writer w;
  w.str(1, std::string_view("\xC0\xAF", 2));
  CHECK_ERR(w.finish(), Err::BAD_REQUEST);
}

TEST(codec_enforces_limits) {
  // Depth: 9 nested messages exceeds MAX_DEPTH (8).
  Bytes nested;
  for (int i = 0; i < 10; ++i) nested = rawField(1, 6, view(nested));
  CHECK_ERR(Message::parse(view(nested)), Err::LIMIT);
  Bytes shallow;
  for (int i = 0; i < 8; ++i) shallow = rawField(1, 6, view(shallow));
  CHECK(Message::parse(view(shallow)).isOk());

  // Oversized string/bytes and oversized message.
  const std::string big(proto::Codec::MAX_STRING + 1, 'a');
  CHECK_ERR(Message::parse(view(rawField(1, 5, view(big)))), Err::LIMIT);
  CHECK_ERR(Message::parse(view(rawField(1, 4, view(big)))), Err::LIMIT);
  CHECK_ERR(Message::parse(view(Bytes(proto::Frame::MAX_PAYLOAD + 1))), Err::LIMIT);

  // A length that claims more than is present.
  Bytes lying = rawField(1, 4, view(Bytes(4)));
  lying[6] = 0xFF;
  CHECK_ERR(Message::parse(view(lying)), Err::BAD_REQUEST);

  // Writer refuses out-of-order tags instead of emitting them.
  Writer w;
  w.u64(2, 1).u64(1, 1);
  CHECK_ERR(w.finish(), Err::INTERNAL);
}

TEST(codec_truncation_at_every_byte_fails_cleanly) {
  Writer inner;
  inner.str(1, "lisinopril").u64(2, 10);
  Writer w;
  w.u64(1, 7).str(2, "abc").msg(3, inner).boolean(4, false);
  const Bytes enc = encode(w);
  for (size_t cut = 0; cut < enc.size(); ++cut) {
    auto m = Message::parse({enc.data(), cut});
    // A prefix is valid only if it ends exactly on a field boundary.
    if (m.isOk()) {
      CHECK(cut == 0 || cut == 15 || cut == 25 || cut == 25 + 7 + inner.finish()->size());
    }
  }
}

TEST(codec_fuzz_random_bytes_never_crash) {
  std::mt19937 rng(20260920);
  int accepted = 0;
  for (int iter = 0; iter < 20000; ++iter) {
    Bytes junk(rng() % 64);
    for (auto& b : junk) b = static_cast<uint8_t>(rng());
    // Bias toward plausible headers so the fuzzer reaches deeper paths.
    if (junk.size() >= 7 && iter % 2 == 0) {
      junk[0] = 0;
      junk[1] = static_cast<uint8_t>(1 + rng() % 4);
      junk[2] = static_cast<uint8_t>(1 + rng() % 6);
      junk[3] = junk[4] = junk[5] = 0;
      junk[6] = static_cast<uint8_t>(rng() % (junk.size() - 6));
    }
    auto m = Message::parse(view(junk));
    if (m.isOk()) {
      ++accepted;
      for (const auto& f : m->fields()) (void)f;
      (void)m->msgs(1);
      (void)m->str(2);
    }
  }
  CHECK(accepted > 0);  // the biased half should produce some valid messages
}
