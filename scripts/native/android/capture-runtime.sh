#!/usr/bin/env bash
set -euo pipefail

if test "$#" -ne 3; then
  printf 'usage: %s SERIAL PACKAGE OUTPUT-DIRECTORY\n' "$0" >&2
  exit 2
fi
serial="$1"
package="$2"
output="$(mkdir -p "$3" && cd "$3" && pwd)"
adb_bin="${ADB:-adb}"
pid="$("$adb_bin" -s "$serial" shell pidof "$package" | tr -d '\r')"
test -n "$pid"

"$adb_bin" -s "$serial" shell dumpsys package "$package" > "$output/package.txt"
"$adb_bin" -s "$serial" shell dumpsys activity activities > "$output/activities.txt"
"$adb_bin" -s "$serial" shell getprop > "$output/device-properties.txt"
"$adb_bin" -s "$serial" shell pm path "$package" > "$output/installed-path.txt"
"$adb_bin" -s "$serial" logcat -d --pid="$pid" -v threadtime > "$output/runtime.log"
"$adb_bin" -s "$serial" exec-out screencap -p > "$output/screen.png"
"$adb_bin" -s "$serial" shell uiautomator dump /sdcard/tpnil-window.xml >/dev/null
"$adb_bin" -s "$serial" shell cat /sdcard/tpnil-window.xml > "$output/window.xml"
(
  cd "$output"
  shasum -a 256 activities.txt device-properties.txt installed-path.txt package.txt runtime.log screen.png window.xml \
    | sort > SHA256SUMS
)
