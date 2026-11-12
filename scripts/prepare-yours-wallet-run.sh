#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
if test "$#" -gt 1; then echo 'Unknown wallet preparation profile' >&2; exit 2; fi
case "${1:-}" in
  '') wallet_version=5.1.0; wallet_sha=d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52; wallet_size=13513123; wallet_asset=568839867 ;;
  --conformance-5.1.1) wallet_version=5.1.1; wallet_sha=454c8581b8d6ab120c9b2f2f74167f536b08e720bc12e75f3e9437d14a985878; wallet_size=13644482; wallet_asset=613231622 ;;
  *) echo 'Unknown wallet preparation profile' >&2; exit 2 ;;
esac
wallet_root="$root/out/sut-artifacts/yours-wallet-v$wallet_version"
wallet_archive="$wallet_root/pw-v$wallet_version.zip"
app_archive="$root/fixtures/artifacts/todo-ts-236733c-webroot.tgz"
app_sha="b3c41dc60ba99b497231008a15033a60110cc7cd60b2d4fffd405e33f4979ddc"
app_root="$root/out/sut-artifacts/todo-ts-236733c/webroot"

mkdir -p "$wallet_root" "$app_root"
if ! test -f "$wallet_archive" || test "$(shasum -a 256 "$wallet_archive" | awk '{print $1}')" != "$wallet_sha"; then
  wallet_partial="$(mktemp "$wallet_root/pw-v$wallet_version.XXXXXX")"
  trap 'rm -f "$wallet_partial"' EXIT
  if ! curl --fail --location --retry 4 --retry-all-errors --max-time 60 \
    --output "$wallet_partial" \
    "https://github.com/yours-org/yours-wallet/releases/download/v$wallet_version/pw-v$wallet_version.zip"; then
    curl --fail --location --retry 2 --retry-all-errors --max-time 60 \
      --header 'Accept: application/octet-stream' --output "$wallet_partial" \
      "https://api.github.com/repos/yours-org/yours-wallet/releases/assets/$wallet_asset"
  fi
  test "$(shasum -a 256 "$wallet_partial" | awk '{print $1}')" = "$wallet_sha"
  mv "$wallet_partial" "$wallet_archive"
  trap - EXIT
fi
test "$(shasum -a 256 "$wallet_archive" | awk '{print $1}')" = "$wallet_sha"
test "$(wc -c < "$wallet_archive" | tr -d '[:space:]')" = "$wallet_size"
# Docker copies this public, digest-verified artifact as root; the admitted
# browser worker reads it as an unprivileged user.
chmod 0644 "$wallet_archive"
test "$(shasum -a 256 "$app_archive" | awk '{print $1}')" = "$app_sha"
rm -rf "$wallet_root/unpacked" "$app_root"
mkdir -p "$wallet_root/unpacked" "$app_root"
unzip -q "$wallet_archive" -d "$wallet_root/unpacked"
tar -xzf "$app_archive" -C "$app_root"
test -f "$wallet_root/unpacked/build/manifest.json"
test -f "$app_root/index.html"
printf 'wallet=%s\napplication=%s\n' "$wallet_archive" "$app_root"
