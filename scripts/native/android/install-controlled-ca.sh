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

wait_for_boot() {
  timeout 60 "$adb_bin" -s "$serial" wait-for-device
  for _ in $(seq 1 180); do
    test "$("$adb_bin" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 && return
    sleep 1
  done
  return 1
}

wait_for_stable_adb() {
  local consecutive=0
  for _ in $(seq 1 30); do
    if timeout 5 "$adb_bin" -s "$serial" shell id -u >/dev/null 2>&1; then
      consecutive=$((consecutive + 1))
      test "$consecutive" -ge 3 && return
    else
      consecutive=0
    fi
    sleep 2
  done
  return 1
}

become_root() {
  for attempt in $(seq 1 12); do
    if ! timeout 20 "$adb_bin" -s "$serial" wait-for-device >/dev/null 2>&1; then
      printf 'adb root attempt %s: device unavailable\n' "$attempt" >&2
      if test "$((attempt % 3))" -eq 0; then
        printf 'restarting dedicated runner ADB transport\n' >&2
        "$adb_bin" kill-server >/dev/null 2>&1 || true
        "$adb_bin" start-server >/dev/null 2>&1 || true
      fi
      sleep 2
      continue
    fi
    root_response=''
    if root_response="$(timeout 25 "$adb_bin" -s "$serial" root 2>&1)"; then
      timeout 30 "$adb_bin" -s "$serial" wait-for-device >/dev/null 2>&1 || true
      if test "$("$adb_bin" -s "$serial" shell id -u 2>/dev/null | tr -d '\r')" = 0; then
        printf 'adb root established on attempt %s\n' "$attempt" >&2
        return
      fi
    fi
    printf 'adb root attempt %s: %s\n' "$attempt" "$root_response" >&2
    if test "$((attempt % 3))" -eq 0; then
      printf 'restarting dedicated runner ADB transport\n' >&2
      "$adb_bin" kill-server >/dev/null 2>&1 || true
      "$adb_bin" start-server >/dev/null 2>&1 || true
    fi
    sleep 2
  done
  return 1
}

remount_log="$(mktemp)"
trap 'rm -f "$remount_log"' EXIT
wait_for_boot
wait_for_stable_adb
become_root
remount_code=0
"$adb_bin" -s "$serial" remount >"$remount_log" 2>&1 || remount_code=$?
if test "$remount_code" -ne 0 || grep -qi 'reboot your device' "$remount_log"; then
  if test "$remount_code" -ne 0; then
    "$adb_bin" -s "$serial" disable-verity >/dev/null 2>&1 || true
  fi
  "$adb_bin" -s "$serial" reboot
  wait_for_boot
  wait_for_stable_adb
  become_root
  "$adb_bin" -s "$serial" remount >"$remount_log" 2>&1
fi
test "$("$adb_bin" -s "$serial" shell id -u | tr -d '\r')" = 0
"$adb_bin" -s "$serial" push "$ca" "/data/local/tmp/${certificate_hash}.0" >/dev/null
"$adb_bin" -s "$serial" shell cp "/data/local/tmp/${certificate_hash}.0" "/system/etc/security/cacerts/${certificate_hash}.0"
"$adb_bin" -s "$serial" shell chown root:root "/system/etc/security/cacerts/${certificate_hash}.0"
"$adb_bin" -s "$serial" shell chmod 0644 "/system/etc/security/cacerts/${certificate_hash}.0"
"$adb_bin" -s "$serial" reboot
wait_for_boot
wait_for_stable_adb
sdk="$("$adb_bin" -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r')"
if test "$sdk" -ge 34; then
  become_root
  zygote_pids="$("$adb_bin" -s "$serial" shell pidof zygote64 zygote | tr -d '\r')"
  test -n "$zygote_pids"
  for zygote_pid in $zygote_pids; do
    "$adb_bin" -s "$serial" shell nsenter -t "$zygote_pid" -m -- \
      mount -o bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts
    "$adb_bin" -s "$serial" shell test -f \
      "/proc/${zygote_pid}/root/apex/com.android.conscrypt/cacerts/${certificate_hash}.0"
  done
fi
"$adb_bin" -s "$serial" shell settings put global http_proxy "$proxy_host"
test "$("$adb_bin" -s "$serial" shell settings get global http_proxy | tr -d '\r')" = "$proxy_host"
"$adb_bin" -s "$serial" shell test -f "/system/etc/security/cacerts/${certificate_hash}.0"
printf 'serial=%s\ncertificate_hash=%s\nproxy=%s\n' "$serial" "$certificate_hash" "$proxy_host"
