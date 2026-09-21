#pragma once
// Packet safety for the vault channel.
//
//   frame := header(28) payload(length) mac(32)
//   header := "DSV1" version:u8 kind:u8 flags:u16 seq:u64 timestampMs:u64 length:u32
//   mac    := HMAC-SHA-512(directionKey, header || payload)[0..32]
//
// Receive order is deliberate: the header is bounds-checked before any payload
// is allocated, the MAC is verified (constant time) before the payload is
// parsed, and only then are sequence (strictly +1, per direction) and clock
// skew checked. Direction keys are HKDF'd from a per-process session key, so a
// frame can't be reflected back at its sender or replayed into a new session.
// Any failure poisons the channel: once a stream is suspect we stop reading it.

#include <array>
#include <cstdint>
#include <optional>

#include "core/bytes.hpp"
#include "core/clock.hpp"
#include "core/result.hpp"
#include "crypto/secure.hpp"

namespace dosely::net {

inline constexpr std::array<uint8_t, 4> kMagic = {'D', 'S', 'V', '1'};
inline constexpr size_t kHeaderSize = proto::Frame::HEADER_SIZE;
inline constexpr size_t kMacSize = proto::Frame::MAC_SIZE;

enum class Kind : uint8_t { Request = proto::Frame::KIND_REQUEST, Response = proto::Frame::KIND_RESPONSE };

struct FrameHeader {
  Kind kind = Kind::Request;
  uint64_t seq = 0;
  int64_t timestampMs = 0;
  uint32_t length = 0;
};

/** Per-direction MAC keys derived from the session key. */
struct ChannelKeys {
  crypto::Key32 clientToServer;
  crypto::Key32 serverToClient;
  static ChannelKeys derive(const crypto::Key32& sessionKey);
};

Bytes encodeHeader(const FrameHeader& h);
/** Structural checks only (magic, version, kind, flags, length bound). */
Result<FrameHeader> decodeHeader(ByteView header);
/** header || payload || mac */
Bytes sealFrame(const crypto::Key32& key, const FrameHeader& h, ByteView payload);

class ByteSource {
 public:
  virtual ~ByteSource() = default;
  /** Read up to n bytes; 0 means end of stream. */
  virtual size_t read(uint8_t* dst, size_t n) = 0;
};

class ByteSink {
 public:
  virtual ~ByteSink() = default;
  virtual bool write(ByteView data) = 0;
};

/** One end of an authenticated, ordered frame stream. */
class Channel {
 public:
  Channel(ByteSource& in, ByteSink& out, crypto::Key32 rxKey, crypto::Key32 txKey, Kind rxKind, Kind txKind,
          const Clock& clock);

  static Channel server(ByteSource& in, ByteSink& out, const ChannelKeys& keys, const Clock& clock);
  static Channel client(ByteSource& in, ByteSink& out, const ChannelKeys& keys, const Clock& clock);

  /** Next verified payload; nullopt when the peer closed cleanly between frames. */
  Result<std::optional<crypto::SecureBytes>> receive();
  Status send(ByteView payload);
  bool poisoned() const { return poisoned_; }

 private:
  /** 1 = full read, 0 = clean EOF before any byte, -1 = truncated. */
  int readExact(uint8_t* dst, size_t n);
  Status poison(Err code, std::string message);

  ByteSource& in_;
  ByteSink& out_;
  crypto::Key32 rxKey_;
  crypto::Key32 txKey_;
  Kind rxKind_;
  Kind txKind_;
  const Clock& clock_;
  uint64_t rxSeq_ = 1;
  uint64_t txSeq_ = 1;
  bool poisoned_ = false;
};

}  // namespace dosely::net
