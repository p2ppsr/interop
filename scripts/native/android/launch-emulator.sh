#!/usr/bin/env bash
set -euo pipefail

avd_name="${1:-TPNIL_API_36}"
port="${2:-5570}"
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
emulator="$sdk_root/emulator/emulator"
adb_bin="${ADB:-adb}"
serial="emulator-$port"

test -x "$emulator"
"$adb_bin" start-server
"$emulator" -avd "$avd_name" -port "$port" -no-window -no-snapshot -wipe-data \
  -writable-system -no-boot-anim -gpu swiftshader_indirect -no-audio -no-metrics &
emulator_pid=$!
trap 'kill -TERM "$emulator_pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 180); do
  if ! kill -0 "$emulator_pid" 2>/dev/null; then
    wait "$emulator_pid" || true
    printf 'Android emulator exited before completing boot\n' >&2
    exit 1
  fi
  if test "$("$adb_bin" -s "$serial" get-state 2>/dev/null || true)" = "device" && \
    test "$("$adb_bin" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1"; then
    "$adb_bin" -s "$serial" shell settings put global window_animation_scale 0
    "$adb_bin" -s "$serial" shell settings put global transition_animation_scale 0
    "$adb_bin" -s "$serial" shell settings put global animator_duration_scale 0
    printf 'serial=%s\npid=%s\n' "$serial" "$emulator_pid"
    trap - EXIT
    wait "$emulator_pid"
    exit $?
  fi
  sleep 1
done
printf 'Android emulator did not complete boot\n' >&2
exit 1
