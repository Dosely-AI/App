#include "store/keyring.hpp"

#include <cctype>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <system_error>

#if !defined(_WIN32)
#include <fcntl.h>
#include <unistd.h>
#endif

namespace dosely::store {

namespace {

crypto::SigningKey deriveSigner(const crypto::Key32& kek) {
  auto seed = crypto::hkdf(kek.view(), "dosely/system-sign/v1");
  return crypto::SigningKey::fromSeed(seed.view()).value();
}

}  // namespace

MasterKey::~MasterKey() {
  if (!passphrase_.empty()) crypto_wipe(passphrase_.data(), passphrase_.size());
}

Result<MasterKey> MasterKey::fromKeyFile(const std::filesystem::path& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return fail(Err::BAD_REQUEST, "cannot read key file");
  std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  std::string hex;
  for (char c : text) {
    if (!std::isspace(static_cast<unsigned char>(c))) hex.push_back(c);
  }
  crypto_wipe(text.data(), text.size());
  Bytes raw;
  const bool decoded = fromHex(hex, raw) && raw.size() == 32;
  crypto_wipe(hex.data(), hex.size());
  MasterKey key;
  if (!decoded || !crypto::Key32::from(view(raw), key.secret_)) {
    if (!raw.empty()) crypto_wipe(raw.data(), raw.size());
    return fail(Err::BAD_REQUEST, "key file must contain exactly 64 hex characters");
  }
  crypto_wipe(raw.data(), raw.size());
  key.mode_ = KdfMode::KeyFile;
  return key;
}

Result<MasterKey> MasterKey::fromPassphrase(std::string passphrase, crypto::Argon2Params params) {
  if (passphrase.size() < 12) return fail(Err::BAD_REQUEST, "passphrase must be at least 12 characters");
  MasterKey key;
  key.mode_ = KdfMode::Passphrase;
  key.passphrase_ = std::move(passphrase);
  key.params_ = params;
  return key;
}

Status MasterKey::createKeyFile(const std::filesystem::path& path) {
  std::error_code ec;
  if (std::filesystem::exists(path, ec)) return fail(Err::CONFLICT, "key file already exists; refusing to overwrite");
  auto key = crypto::Key32::random();
  std::string text = toHex(key.view()) + "\n";
#if defined(_WIN32)
  std::FILE* fp = _wfopen(path.c_str(), L"wbx");
#else
  const int fd = ::open(path.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
  std::FILE* fp = fd >= 0 ? fdopen(fd, "wb") : nullptr;
#endif
  if (!fp) return fail(Err::INTERNAL, "cannot create key file");
  const bool ok = std::fwrite(text.data(), 1, text.size(), fp) == text.size();
  crypto_wipe(text.data(), text.size());
  if (std::fclose(fp) != 0 || !ok) return fail(Err::INTERNAL, "cannot write key file");
  return Status::ok();
}

Result<crypto::Key32> MasterKey::deriveKek(ByteView salt, const crypto::Argon2Params& params) const {
  if (mode_ == KdfMode::KeyFile) return crypto::hkdf(secret_.view(), "dosely/kek/v1", salt);
  return crypto::deriveFromPassphrase(passphrase_, salt, params);
}

KeyRing::KeyRing(const crypto::Key32& kek)
    : wrap_(crypto::hkdf(kek.view(), "dosely/kek-wrap/v1")),
      system_(crypto::hkdf(kek.view(), "dosely/system-data/v1")),
      auditSeal_(crypto::hkdf(kek.view(), "dosely/audit-seal/v1")),
      auditMac_(crypto::hkdf(kek.view(), "dosely/audit-mac/v1")),
      signer_(deriveSigner(kek)) {
  auto checkKey = crypto::hkdf(kek.view(), "dosely/key-check/v1");
  keyCheck_ = crypto::mac32(checkKey.view(), view(std::string_view("dosely key check v1")));
}

}  // namespace dosely::store
