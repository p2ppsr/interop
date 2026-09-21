#!/usr/bin/env bash
set -euo pipefail

if test "$#" -ne 2; then
  printf 'usage: %s INPUT.aab OUTPUT-DIRECTORY\n' "$0" >&2
  exit 2
fi
aab="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
output="$(mkdir -p "$2" && cd "$2" && pwd)"
root="$(cd "$(dirname "$0")/../../.." && pwd)"
tool_dir="${TPNIL_TOOL_CACHE:-$root/out/tools}/bundletool-1.18.3"
jar="$tool_dir/bundletool-all-1.18.3.jar"
jar_sha="a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29"
key="$root/fixtures/keys/android-lab-fixture.p12"
key_sha="a40e716aee3db6468b482f00fd531fa33a61dafb47d213056b07da67c34d4884"
apks="$output/universal.apks"
apk="$output/universal.apk"

mkdir -p "$tool_dir"
if ! test -f "$jar"; then
  curl --fail --location --retry 4 --retry-all-errors \
    --output "$jar" \
    https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar
fi
test "$(shasum -a 256 "$jar" | awk '{print $1}')" = "$jar_sha"
test "$(shasum -a 256 "$key" | awk '{print $1}')" = "$key_sha"

java -jar "$jar" build-apks \
  --bundle="$aab" \
  --output="$apks" \
  --mode=universal \
  --overwrite \
  --ks="$key" \
  --ks-pass=pass:tpnil-fixture \
  --ks-key-alias=tpnil-lab-fixture \
  --key-pass=pass:tpnil-fixture
unzip -p "$apks" universal.apk > "$apk"
shasum -a 256 "$aab" "$jar" "$key" "$apks" "$apk"
