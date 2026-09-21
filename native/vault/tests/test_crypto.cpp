// Crypto: known-answer tests against published vectors (so we know Monocypher
// is wired correctly), plus misuse/tamper behavior of our wrappers.

#include "crypto/crypto.hpp"
#include "harness.hpp"
#include "monocypher.h"

using namespace dosely;
using dosely::test::hex;

TEST(ed25519_rfc8032_vectors) {
  struct Vector {
    const char *seed, *pub, *msg, *sig;
  };
  const Vector vectors[] = {
      {"9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
       "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
       "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"},
      {"4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
       "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
       "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"},
  };
  for (const auto& v : vectors) {
    auto key = crypto::SigningKey::fromSeed(view(hex(v.seed)));
    REQUIRE(key.isOk());
    const Bytes pub(key->publicKey().begin(), key->publicKey().end());
    CHECK_EQ(pub, hex(v.pub));
    const Bytes msg = hex(v.msg);
    const auto sig = key->sign(view(msg));
    CHECK_EQ(Bytes(sig.begin(), sig.end()), hex(v.sig));
    CHECK(crypto::verify(view(pub), view(msg), {sig.data(), sig.size()}));
  }
}

TEST(ed25519_rejects_tampering_and_malformed_input) {
  auto key = crypto::SigningKey::generate();
  const Bytes msg = {'r', 'x'};
  auto sig = key.sign(view(msg));
  const auto& pk = key.publicKey();
  CHECK(crypto::verify({pk.data(), pk.size()}, view(msg), {sig.data(), sig.size()}));
  sig[10] ^= 1;
  CHECK(!crypto::verify({pk.data(), pk.size()}, view(msg), {sig.data(), sig.size()}));
  sig[10] ^= 1;
  const Bytes other = {'r', 'y'};
  CHECK(!crypto::verify({pk.data(), pk.size()}, view(other), {sig.data(), sig.size()}));
  CHECK(!crypto::verify({pk.data(), 31}, view(msg), {sig.data(), sig.size()}));
  CHECK(!crypto::verify({pk.data(), pk.size()}, view(msg), {sig.data(), 63}));
  CHECK_ERR(crypto::SigningKey::fromSeed(view(Bytes(31))), Err::BAD_REQUEST);
}

TEST(hmac_sha512_rfc4231_case2) {
  const auto mac = crypto::hmacSha512(view(std::string_view("Jefe")), view(std::string_view("what do ya want for nothing?")));
  CHECK_EQ(Bytes(mac.begin(), mac.end()),
           hex("164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737"));
  const auto short32 = crypto::mac32(view(std::string_view("Jefe")), view(std::string_view("what do ya want for nothing?")));
  CHECK_EQ(Bytes(short32.begin(), short32.end()), Bytes(mac.begin(), mac.begin() + 32));
}

TEST(xchacha20_poly1305_draft_vector) {
  // draft-irtf-cfrg-xchacha-03, appendix A.3.1
  const std::string_view text =
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
  const Bytes key = hex("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
  const Bytes nonce = hex("404142434445464748494a4b4c4d4e4f5051525354555657");
  const Bytes ad = hex("50515253c0c1c2c3c4c5c6c7");
  Bytes cipher(text.size());
  uint8_t tag[16];
  crypto_aead_lock(cipher.data(), tag, key.data(), nonce.data(), ad.data(), ad.size(),
                   reinterpret_cast<const uint8_t*>(text.data()), text.size());
  CHECK_EQ(Bytes(tag, tag + 16), hex("c0875924c1c7987947deafd8780acf49"));
  CHECK_EQ(Bytes(cipher.begin(), cipher.begin() + 16), hex("bd6d179d3e83d43b9576579493c0e939"));
}

TEST(seal_roundtrip_and_tamper_detection) {
  auto key = crypto::Key32::random();
  const Bytes ad = {'r', 'e', 'c', '1'};
  const std::string_view secret = "atorvastatin 20 mg";
  const Bytes sealed = crypto::seal(key, view(ad), view(secret));
  CHECK_EQ(sealed.size(), secret.size() + crypto::kSealOverhead);

  auto opened = crypto::open(key, view(ad), view(sealed));
  REQUIRE(opened.isOk());
  CHECK_EQ(std::string(asString(opened->view())), std::string(secret));

  // Every single-bit flip anywhere (nonce, tag, ciphertext) must be rejected.
  for (size_t i = 0; i < sealed.size(); ++i) {
    Bytes bad = sealed;
    bad[i] ^= 0x01;
    CHECK_ERR(crypto::open(key, view(ad), view(bad)), Err::INTEGRITY);
  }
  const Bytes otherAd = {'r', 'e', 'c', '2'};
  CHECK_ERR(crypto::open(key, view(otherAd), view(sealed)), Err::INTEGRITY);
  auto otherKey = crypto::Key32::random();
  CHECK_ERR(crypto::open(otherKey, view(ad), view(sealed)), Err::INTEGRITY);
  CHECK_ERR(crypto::open(key, view(ad), {sealed.data(), crypto::kSealOverhead - 1}), Err::INTEGRITY);

  // Random nonces: sealing twice never repeats ciphertext.
  CHECK(crypto::seal(key, view(ad), view(secret)) != sealed);
}

TEST(argon2id_rfc9106_vector) {
  // RFC 9106 section 5.3 (Argon2id, 4 lanes, with secret and associated data).
  const Bytes pass(32, 0x01), salt(16, 0x02), secret(8, 0x03), ad(12, 0x04);
  crypto_argon2_config config{};
  config.algorithm = CRYPTO_ARGON2_ID;
  config.nb_blocks = 32;
  config.nb_passes = 3;
  config.nb_lanes = 4;
  crypto_argon2_inputs inputs{};
  inputs.pass = pass.data();
  inputs.pass_size = static_cast<uint32_t>(pass.size());
  inputs.salt = salt.data();
  inputs.salt_size = static_cast<uint32_t>(salt.size());
  crypto_argon2_extras extras{};
  extras.key = secret.data();
  extras.key_size = static_cast<uint32_t>(secret.size());
  extras.ad = ad.data();
  extras.ad_size = static_cast<uint32_t>(ad.size());
  std::vector<uint8_t> work(32 * 1024);
  uint8_t tag[32];
  crypto_argon2(tag, 32, work.data(), config, inputs, extras);
  CHECK_EQ(Bytes(tag, tag + 32), hex("0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659"));
}

TEST(passphrase_derivation_is_deterministic_and_salted) {
  const crypto::Argon2Params fast{64, 1};
  const Bytes salt1(16, 0xA1), salt2(16, 0xA2);
  auto a = crypto::deriveFromPassphrase("correct horse battery", view(salt1), fast);
  auto b = crypto::deriveFromPassphrase("correct horse battery", view(salt1), fast);
  auto c = crypto::deriveFromPassphrase("correct horse battery", view(salt2), fast);
  REQUIRE(a.isOk() && b.isOk() && c.isOk());
  CHECK(crypto::equalConstantTime(a->view(), b->view()));
  CHECK(!crypto::equalConstantTime(a->view(), c->view()));
  CHECK_ERR(crypto::deriveFromPassphrase("short", view(salt1), fast), Err::BAD_REQUEST);
  CHECK_ERR(crypto::deriveFromPassphrase("correct horse battery", view(Bytes(8)), fast), Err::BAD_REQUEST);
}

TEST(hkdf_domain_separation) {
  auto ikm = crypto::Key32::random();
  auto a = crypto::hkdf(ikm.view(), "dosely/a");
  auto a2 = crypto::hkdf(ikm.view(), "dosely/a");
  auto b = crypto::hkdf(ikm.view(), "dosely/b");
  CHECK(crypto::equalConstantTime(a.view(), a2.view()));
  CHECK(!crypto::equalConstantTime(a.view(), b.view()));
}

TEST(secrets_are_wiped_when_moved_from) {
  auto key = crypto::Key32::random();
  auto moved = std::move(key);
  CHECK(crypto::equalConstantTime(key.view(), view(Bytes(32, 0))));  // NOLINT(use-after-move) — intentional
  CHECK(!crypto::equalConstantTime(moved.view(), view(Bytes(32, 0))));
}
