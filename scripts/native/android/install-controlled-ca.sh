#!/usr/bin/env bash
set -euo pipefail

serial="${1:?Android serial is required}"
ca="${2:?PEM CA certificate is required}"
proxy_url="${3:?Proxy URL is required}"
adb_bin="${ADB:-adb}"

test -s "$ca"
proxy_host="$(python3 - "$proxy_url" <<'PY'
from urllib.parse import urlparse
import sys
url = urlparse(sys.argv[1])
if not url.hostname or not url.port:
    raise SystemExit('proxy URL must contain host and port')
print(f'{url.hostname}:{url.port}')
PY
)"
certificate_hash="$(openssl x509 -inform PEM -subject_hash_old -in "$ca" -noout | head -n 1)"
test -n "$certificate_hash"

"$adb_bin" -s "$serial" root >/dev/null
"$adb_bin" -s "$serial" wait-for-device
if ! "$adb_bin" -s "$serial" remount >/tmp/tpnil-adb-remount.txt 2>&1; then
  "$adb_bin" -s "$serial" disable-verity >/dev/null 2>&1 || true
  "$adb_bin" -s "$serial" reboot
  "$adb_bin" -s "$serial" wait-for-device
  "$adb_bin" -s "$serial" root >/dev/null
  "$adb_bin" -s "$serial" wait-for-device
  "$adb_bin" -s "$serial" remount
fi
"$adb_bin" -s "$serial" push "$ca" "/data/local/tmp/${certificate_hash}.0" >/dev/null
"$adb_bin" -s "$serial" shell cp "/data/local/tmp/${certificate_hash}.0" "/system/etc/security/cacerts/${certificate_hash}.0"
"$adb_bin" -s "$serial" shell chown root:root "/system/etc/security/cacerts/${certificate_hash}.0"
"$adb_bin" -s "$serial" shell chmod 0644 "/system/etc/security/cacerts/${certificate_hash}.0"
"$adb_bin" -s "$serial" reboot
"$adb_bin" -s "$serial" wait-for-device
for _ in $(seq 1 180); do
  test "$("$adb_bin" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 && break
  sleep 1
done
test "$("$adb_bin" -s "$serial" shell getprop sys.boot_completed | tr -d '\r')" = 1
"$adb_bin" -s "$serial" shell settings put global http_proxy "$proxy_host"
test "$("$adb_bin" -s "$serial" shell settings get global http_proxy | tr -d '\r')" = "$proxy_host"
"$adb_bin" -s "$serial" shell test -f "/system/etc/security/cacerts/${certificate_hash}.0"
printf 'serial=%s\ncertificate_hash=%s\nproxy=%s\n' "$serial" "$certificate_hash" "$proxy_host"
