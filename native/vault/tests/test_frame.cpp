// Frames: a client and server channel over an in-memory pipe; every tampering,
// replay, reflection and staleness attempt must be refused and poison the stream.

#include <deque>

#include "harness.hpp"
#include "net/frame.hpp"

using namespace dosely;

namespace {

struct Pipe final : net::ByteSource, net::ByteSink {
  std::deque<uint8_t> buf;
  size_t read(uint8_t* dst, size_t n) override {
    size_t k = 0;
    while (k < n && !buf.empty()) {
      dst[k++] = buf.front();
      buf.pop_front();
    }
    return k;
  }
  bool write(ByteView data) override {
    buf.insert(buf.end(), data.begin(), data.end());
    return true;
  }
  Bytes drain() {
    Bytes out(buf.begin(), buf.end());
    buf.clear();
    return out;
  }
  void load(const Bytes& b) { buf.assign(b.begin(), b.end()); }
};

struct Rig {
  FixedClock clock{1'760'000'000'000};
  Pipe toServer, toClient;
  crypto::Key32 session = crypto::Key32::random();
  net::ChannelKeys keys = net::ChannelKeys::derive(session);
  net::Channel client = net::Channel::client(toClient, toServer, keys, clock);
  net::Channel server = net::Channel::server(toServer, toClient, keys, clock);
};

Bytes payloadOf(Result<std::optional<crypto::SecureBytes>>& r) {
  if (!r || !r->has_value()) std::abort();
  const auto v = (*r)->view();
  return Bytes(v.begin(), v.end());
}

}  // namespace

TEST(frame_roundtrip_both_directions) {
  Rig rig;
  const Bytes req = {1, 2, 3};
  REQUIRE(rig.client.send(view(req)).isOk());
  REQUIRE(rig.client.send(view(Bytes{})).isOk());
  auto r1 = rig.server.receive();
  CHECK_EQ(payloadOf(r1), req);
  auto r2 = rig.server.receive();
  CHECK_EQ(payloadOf(r2), Bytes{});
  REQUIRE(rig.server.send(view(req)).isOk());
  auto r3 = rig.client.receive();
  CHECK_EQ(payloadOf(r3), req);
  // Clean EOF between frames is not an error.
  auto eof = rig.server.receive();
  REQUIRE(eof.isOk());
  CHECK(!eof->has_value());
}

TEST(frame_any_bit_flip_is_rejected) {
  Rig rig;
  REQUIRE(rig.client.send(view(Bytes{9, 9, 9, 9})).isOk());
  const Bytes frame = rig.toServer.drain();
  for (size_t i = 0; i < frame.size(); ++i) {
    Rig fresh;
    // Re-seal with this rig's keys, then flip one bit.
    net::FrameHeader h{net::Kind::Request, 1, fresh.clock.nowMs(), 4};
    Bytes bad = net::sealFrame(fresh.keys.clientToServer, h, view(Bytes{9, 9, 9, 9}));
    bad[i] ^= 0x01;
    fresh.toServer.load(bad);
    auto r = fresh.server.receive();
    CHECK(!r.isOk());
    CHECK(fresh.server.poisoned());
  }
}

TEST(frame_replay_and_reordering_are_rejected) {
  Rig rig;
  REQUIRE(rig.client.send(view(Bytes{1})).isOk());
  const Bytes first = rig.toServer.drain();
  rig.toServer.load(first);
  REQUIRE(rig.server.receive().isOk());
  rig.toServer.load(first);  // replay the same frame
  CHECK_ERR(rig.server.receive(), Err::INTEGRITY);
  CHECK(rig.server.poisoned());
  // A poisoned channel refuses everything afterwards, even valid frames.
  REQUIRE(rig.client.send(view(Bytes{2})).isOk());
  CHECK_ERR(rig.server.receive(), Err::INTEGRITY);
}

TEST(frame_reflection_and_wrong_session_are_rejected) {
  Rig rig;
  // A request reflected back at the client fails (different direction key).
  REQUIRE(rig.client.send(view(Bytes{7})).isOk());
  rig.toClient.load(rig.toServer.drain());
  CHECK_ERR(rig.client.receive(), Err::INTEGRITY);

  // A frame from another session (different session key) fails.
  Rig a, b;
  REQUIRE(a.client.send(view(Bytes{7})).isOk());
  b.toServer.load(a.toServer.drain());
  CHECK_ERR(b.server.receive(), Err::INTEGRITY);
}

TEST(frame_stale_or_future_timestamps_are_rejected) {
  Rig rig;
  REQUIRE(rig.client.send(view(Bytes{1})).isOk());
  rig.clock.advance(proto::Frame::MAX_CLOCK_SKEW_MS + 1);
  CHECK_ERR(rig.server.receive(), Err::EXPIRED);

  Rig ahead;
  ahead.clock.advance(proto::Frame::MAX_CLOCK_SKEW_MS + 1);
  REQUIRE(ahead.client.send(view(Bytes{1})).isOk());
  ahead.clock.advance(-2 * static_cast<int64_t>(proto::Frame::MAX_CLOCK_SKEW_MS) - 2);
  CHECK_ERR(ahead.server.receive(), Err::EXPIRED);
}

TEST(frame_oversize_and_malformed_headers_fail_before_allocation) {
  Rig rig;
  net::FrameHeader h{net::Kind::Request, 1, rig.clock.nowMs(), proto::Frame::MAX_PAYLOAD + 1};
  rig.toServer.load(net::encodeHeader(h));  // claims > 1 MiB; body never sent
  CHECK_ERR(rig.server.receive(), Err::LIMIT);

  Rig flags;
  Bytes hdr = net::encodeHeader({net::Kind::Request, 1, flags.clock.nowMs(), 0});
  hdr[7] = 1;
  flags.toServer.load(hdr);
  CHECK_ERR(flags.server.receive(), Err::BAD_REQUEST);

  Rig truncated;
  truncated.toServer.load(Bytes{'D', 'S', 'V'});
  CHECK_ERR(truncated.server.receive(), Err::BAD_REQUEST);
}
