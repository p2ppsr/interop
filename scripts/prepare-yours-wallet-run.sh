#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
if test "$#" -gt 1; then echo 'Unknown wallet preparation profile' >&2; exit 2; fi
wallet_candidate=false
wallet_candidate_directory=
case "${1:-}" in
  --conformance-pr368-coverage-4|--conformance-pr368-coverage-5|--conformance-pr368-coverage-6) wallet_version=5.1.1; wallet_sha=553b6df9a43714c5b4c708fac2a00eed2c77e4c26047edcd70456df5eaeaf0da; wallet_size=13246448; wallet_candidate=true; wallet_candidate_directory=yours-wallet-pr368-e360e67 ;;
  --conformance-pr368-coverage-3) wallet_version=5.1.1; wallet_sha=9da87d79ac7ac70e3c5dee50451b2f0456b51f5e480b1be0925cd24a7707e184; wallet_size=13245082; wallet_candidate=true; wallet_candidate_directory=yours-wallet-pr368-3e8a97f ;;
  --conformance-pr368-coverage-1|--conformance-pr368-coverage-2) wallet_version=5.1.1; wallet_sha=cd12b686c5295061bd4b727b32e17c3686e210fcdfa6aa2193790590458d9105; wallet_size=13244753; wallet_candidate=true; wallet_candidate_directory=yours-wallet-pr368-4a954ac ;;
  '') wallet_version=5.1.0; wallet_sha=d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52; wallet_size=13513123; wallet_asset=568839867 ;;
  --conformance-5.1.1) wallet_version=5.1.1; wallet_sha=454c8581b8d6ab120c9b2f2f74167f536b08e720bc12e75f3e9437d14a985878; wallet_size=13644482; wallet_asset=613231622 ;;
  --conformance-pr368-7e39006) wallet_version=5.1.1; wallet_sha=b80e5a7572bdf11e568ecf41cbf439a0062605a5a2f196b53948b18e1b7fe10e; wallet_size=13238310; wallet_candidate=true; wallet_candidate_directory=yours-wallet-pr368-7e39006 ;;
  --conformance-pr368-cb3c2f2) wallet_version=5.1.1; wallet_sha=0fff8b6ff51a0c54032e340bdc1878abf751f577ad94d6ee06146e336fd87cc3; wallet_size=13243164; wallet_candidate=true; wallet_candidate_directory=yours-wallet-pr368-cb3c2f2 ;;
  *) echo 'Unknown wallet preparation profile' >&2; exit 2 ;;
esac
wallet_root="$root/out/sut-artifacts/yours-wallet-v$wallet_version"
if $wallet_candidate; then wallet_root="$root/out/sut-artifacts/$wallet_candidate_directory"; fi
wallet_archive="$wallet_root/pw-v$wallet_version.zip"
app_archive="$root/fixtures/artifacts/todo-ts-236733c-webroot.tgz"
app_sha="b3c41dc60ba99b497231008a15033a60110cc7cd60b2d4fffd405e33f4979ddc"
app_root="$root/out/sut-artifacts/todo-ts-236733c/webroot"

mkdir -p "$wallet_root" "$app_root"
if ! test -f "$wallet_archive" || test "$(shasum -a 256 "$wallet_archive" | awk '{print $1}')" != "$wallet_sha"; then
  wallet_partial="$(mktemp "$wallet_root/pw-v$wallet_version.XXXXXX")"
  trap 'rm -f "$wallet_partial"' EXIT
  if $wallet_candidate; then
    cp "$root/fixtures/artifacts/$wallet_candidate_directory/pw-v5.1.1.zip" "$wallet_partial"
  elif ! curl --fail --location --retry 4 --retry-all-errors --max-time 60 \
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
