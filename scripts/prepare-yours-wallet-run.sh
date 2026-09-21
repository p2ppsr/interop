#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
wallet_root="$root/out/sut-artifacts/yours-wallet-v5.1.0"
wallet_archive="$wallet_root/pw-v5.1.0.zip"
wallet_sha="d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52"
app_archive="$root/fixtures/artifacts/todo-ts-236733c-webroot.tgz"
app_sha="b3c41dc60ba99b497231008a15033a60110cc7cd60b2d4fffd405e33f4979ddc"
app_root="$root/out/sut-artifacts/todo-ts-236733c/webroot"

mkdir -p "$wallet_root" "$app_root"
if ! test -f "$wallet_archive"; then
  curl --fail --location --retry 4 --retry-all-errors \
    --output "$wallet_archive" \
    https://github.com/yours-org/yours-wallet/releases/download/v5.1.0/pw-v5.1.0.zip
fi
test "$(shasum -a 256 "$wallet_archive" | awk '{print $1}')" = "$wallet_sha"
test "$(shasum -a 256 "$app_archive" | awk '{print $1}')" = "$app_sha"
rm -rf "$wallet_root/unpacked" "$app_root"
mkdir -p "$wallet_root/unpacked" "$app_root"
unzip -q "$wallet_archive" -d "$wallet_root/unpacked"
tar -xzf "$app_archive" -C "$app_root"
test -f "$wallet_root/unpacked/build/manifest.json"
test -f "$app_root/index.html"
printf 'wallet=%s\napplication=%s\n' "$wallet_archive" "$app_root"
