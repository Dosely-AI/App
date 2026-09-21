#include "net/frame.hpp"

#include "crypto/crypto.hpp"

namespace dosely::net {

ChannelKeys ChannelKeys::derive(const crypto::Key32& sessionKey) {
  return {crypto::hkdf(sessionKey.view(), "dosely-vault/v1/c2s"), crypto::hkdf(sessionKey.view(), "dosely-vault/v1/s2c")};
}

Bytes encodeHeader(const FrameHeader& h) {
  Bytes out;
  out.reserve(kHeaderSize);
  out.insert(out.end(), kMagic.begin(), kMagic.end());
  out.push_back(static_cast<uint8_t>(proto::Frame::VERSION));
  out.push_back(static_cast<uint8_t>(h.kind));
  appendBe(out, 0, 2);  // flags: reserved, must be zero
  appendBe(out, h.seq, 8);
  appendBe(out, static_cast<uint64_t>(h.timestampMs), 8);
  appendBe(out, h.length, 4);
  return out;
}

Result<FrameHeader> decodeHeader(ByteView header) {
  if (header.size() != kHeaderSize) return fail(Err::BAD_REQUEST, "frame header has wrong size");
  for (size_t i = 0; i < kMagic.size(); ++i) {
    if (header[i] != kMagic[i]) return fail(Err::BAD_REQUEST, "bad frame magic");
  }
  if (header[4] != proto::Frame::VERSION) return fail(Err::UNSUPPORTED, "unsupported frame version");
  const uint8_t kind = header[5];
  if (kind != proto::Frame::KIND_REQUEST && kind != proto::Frame::KIND_RESPONSE) {
    return fail(Err::BAD_REQUEST, "bad frame kind");
  }
  if (readBe(header.data() + 6, 2) != 0) return fail(Err::BAD_REQUEST, "reserved frame flags set");
  FrameHeader h;
  h.kind = static_cast<Kind>(kind);
  h.seq = readBe(header.data() + 8, 8);
  h.timestampMs = static_cast<int64_t>(readBe(header.data() + 16, 8));
  h.length = static_cast<uint32_t>(readBe(header.data() + 24, 4));
  if (h.length > proto::Frame::MAX_PAYLOAD) return fail(Err::LIMIT, "frame payload too large");
  return h;
}

namespace {
std::array<uint8_t, 32> frameMac(const crypto::Key32& key, ByteView header, ByteView payload) {
  Bytes msg(header.begin(), header.end());
  append(msg, payload);
  auto mac = crypto::mac32(key.view(), view(msg));
  crypto_wipe(msg.data(), msg.size());
  return mac;
}
}  // namespace

Bytes sealFrame(const crypto::Key32& key, const FrameHeader& h, ByteView payload) {
  Bytes frame = encodeHeader(h);
  const auto mac = frameMac(key, view(frame), payload);
  append(frame, payload);
  frame.insert(frame.end(), mac.begin(), mac.end());
  return frame;
}

// --- Channel -----------------------------------------------------------------------

Channel::Channel(ByteSource& in, ByteSink& out, crypto::Key32 rxKey, crypto::Key32 txKey, Kind rxKind, Kind txKind,
                 const Clock& clock)
    : in_(in),
      out_(out),
      rxKey_(std::move(rxKey)),
      txKey_(std::move(txKey)),
      rxKind_(rxKind),
      txKind_(txKind),
      clock_(clock) {}

Channel Channel::server(ByteSource& in, ByteSink& out, const ChannelKeys& keys, const Clock& clock) {
  return {in, out, keys.clientToServer.clone(), keys.serverToClient.clone(), Kind::Request, Kind::Response, clock};
}

Channel Channel::client(ByteSource& in, ByteSink& out, const ChannelKeys& keys, const Clock& clock) {
  return {in, out, keys.serverToClient.clone(), keys.clientToServer.clone(), Kind::Response, Kind::Request, clock};
}

int Channel::readExact(uint8_t* dst, size_t n) {
  size_t got = 0;
  while (got < n) {
    const size_t r = in_.read(dst + got, n - got);
    if (r == 0) return got == 0 ? 0 : -1;
    got += r;
  }
  return 1;
}

Status Channel::poison(Err code, std::string message) {
  poisoned_ = true;
  return fail(code, std::move(message));
}

Result<std::optional<crypto::SecureBytes>> Channel::receive() {
  if (poisoned_) return fail(Err::INTEGRITY, "channel is poisoned");

  Bytes header(kHeaderSize);
  const int state = readExact(header.data(), header.size());
  if (state == 0) return std::optional<crypto::SecureBytes>{};  // clean close
  if (state < 0) return poison(Err::BAD_REQUEST, "truncated frame header");

  auto decoded = decodeHeader(view(header));
  if (!decoded) return poison(decoded.status().code(), decoded.status().message());
  const FrameHeader h = *decoded;

  crypto::SecureBytes payload{Bytes(h.length)};
  std::array<uint8_t, kMacSize> mac{};
  if (readExact(payload.raw().data(), h.length) != 1 || readExact(mac.data(), mac.size()) != 1) {
    return poison(Err::BAD_REQUEST, "truncated frame");
  }

  // Authenticate before trusting anything else in the frame.
  const auto expected = frameMac(rxKey_, view(header), payload.view());
  if (!crypto::equalConstantTime({mac.data(), mac.size()}, {expected.data(), expected.size()})) {
    return poison(Err::INTEGRITY, "frame authentication failed");
  }
  if (h.kind != rxKind_) return poison(Err::BAD_REQUEST, "unexpected frame kind");
  if (h.seq != rxSeq_) return poison(Err::INTEGRITY, "frame out of sequence (replay or loss)");
  const int64_t skew = h.timestampMs - clock_.nowMs();
  if (skew > static_cast<int64_t>(proto::Frame::MAX_CLOCK_SKEW_MS) ||
      -skew > static_cast<int64_t>(proto::Frame::MAX_CLOCK_SKEW_MS)) {
    return poison(Err::EXPIRED, "frame timestamp outside the allowed window");
  }
  ++rxSeq_;
  return std::optional<crypto::SecureBytes>{std::move(payload)};
}

Status Channel::send(ByteView payload) {
  if (poisoned_) return fail(Err::INTEGRITY, "channel is poisoned");
  if (payload.size() > proto::Frame::MAX_PAYLOAD) return fail(Err::LIMIT, "payload too large");
  FrameHeader h;
  h.kind = txKind_;
  h.seq = txSeq_;
  h.timestampMs = clock_.nowMs();
  h.length = static_cast<uint32_t>(payload.size());
  Bytes frame = sealFrame(txKey_, h, payload);
  const bool ok = out_.write(view(frame));
  crypto_wipe(frame.data(), frame.size());
  if (!ok) return poison(Err::INTERNAL, "write failed");
  ++txSeq_;
  return Status::ok();
}

}  // namespace dosely::net
