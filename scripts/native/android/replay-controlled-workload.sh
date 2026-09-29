#!/usr/bin/env bash
# Shared by the owned runner and disposable controlled-service laboratory hosts.
set -euo pipefail
runtime_dir="$RUNNER_TEMP/tpnil-runtime"
evidence_dir="$RUNNER_TEMP/tpnil-evidence"
mkdir -p "$runtime_dir" "$evidence_dir"
"$GITHUB_WORKSPACE/synthesis/node_modules/.bin/tsx" \
  "$GITHUB_WORKSPACE/synthesis/src/wallet-lab/android-runtime.ts" \
  "$RUNNER_TEMP/tpnil-source/ts-stack/infra/wab" \
  "$RUNNER_TEMP/tpnil-source/todo-webroot" \
  "$GITHUB_WORKSPACE/fixtures/teranode/wab-funding-v1.json" \
  "$runtime_dir" > "$evidence_dir/controller.log" 2>&1 &
runtime_pid=$!
for attempt in $(seq 1 180); do
  kill -0 "$runtime_pid" 2>/dev/null || {
    cat "$evidence_dir/controller.log" >&2
    exit 1
  }
  test -s "$runtime_dir/runtime.json" && test -s "$runtime_dir/.activation.json" && break
  sleep 1
done
test -s "$runtime_dir/runtime.json"
test -s "$runtime_dir/.activation.json"
jq 'del(.caCertificate, .phoneNumber)' "$runtime_dir/runtime.json" > "$evidence_dir/runtime.json"
scripts/native/android/create-avd.sh TPNIL_API_35 > "$RUNNER_TEMP/tpnil-evidence/avd.txt"
adb start-server
scripts/native/android/launch-emulator.sh TPNIL_API_35 5570 \
  > "$RUNNER_TEMP/tpnil-evidence/emulator.txt" 2>&1 &
launcher_pid=$!
cleanup() {
  if test -n "${webview_console_pid:-}"; then
    kill -TERM "$webview_console_pid" >/dev/null 2>&1 || true
    wait "$webview_console_pid" >/dev/null 2>&1 || true
  fi
  if test "$(adb -s emulator-5570 get-state 2>/dev/null || true)" = device; then
    adb -s emulator-5570 logcat -d -s chromium:V ReactNativeJS:V WebViewConsole:V \
      | python3 scripts/native/android/filter-app-console.py \
        > "$evidence_dir/app-console.txt" || true
    adb -s emulator-5570 exec-out screencap -p > "$evidence_dir/last-screen.png" || true
    adb -s emulator-5570 shell uiautomator dump /sdcard/tpnil-last-window.xml >/dev/null 2>&1 || true
    adb -s emulator-5570 shell cat /sdcard/tpnil-last-window.xml > "$evidence_dir/last-window.xml" 2>/dev/null || true
  fi
  adb -s emulator-5570 emu kill >/dev/null 2>&1 || true
  for attempt in $(seq 1 30); do
    kill -0 "$launcher_pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$launcher_pid" 2>/dev/null; then
    kill "$launcher_pid" >/dev/null 2>&1 || true
  fi
  wait "$launcher_pid" >/dev/null 2>&1 || true
  kill -TERM "$runtime_pid" >/dev/null 2>&1 || true
  wait "$runtime_pid" >/dev/null 2>&1 || true
  rm -f "$runtime_dir/.activation.json" "$runtime_dir/wab.log"
  if test -s "$runtime_dir/controlled-boundary.json"; then
    cp "$runtime_dir/controlled-boundary.json" "$evidence_dir/controlled-boundary.json"
    if test -n "${task_amount:-}"; then
      "$GITHUB_WORKSPACE/synthesis/node_modules/.bin/tsx" \
        "$GITHUB_WORKSPACE/synthesis/src/wallet-lab/verify-android-boundary.ts" \
        "$evidence_dir/controlled-boundary.json" \
        "$GITHUB_WORKSPACE/fixtures/teranode/wab-funding-v1.json" \
        "$task_amount" > "$evidence_dir/boundary-verification.json" \
        2> "$evidence_dir/boundary-verification-error.txt" || true
    fi
  fi
}
trap cleanup EXIT
for attempt in $(seq 1 180); do
  if ! kill -0 "$launcher_pid" 2>/dev/null; then
    wait "$launcher_pid" || true
    cat "$RUNNER_TEMP/tpnil-evidence/emulator.txt" >&2
    exit 1
  fi
  test "$(adb -s emulator-5570 get-state 2>/dev/null || true)" = device && \
    test "$(adb -s emulator-5570 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 && break
  sleep 1
done
test "$(adb -s emulator-5570 shell getprop sys.boot_completed | tr -d '\r')" = 1
bash -x scripts/native/android/install-controlled-ca.sh \
  emulator-5570 \
  "$(jq --raw-output .caCertificate "$runtime_dir/runtime.json")" \
  "$(jq --raw-output .proxyUrl "$runtime_dir/runtime.json")" \
  > "$evidence_dir/controlled-ca.txt" 2>&1
adb -s emulator-5570 install "$RUNNER_TEMP/tpnil-apk/universal.apk"
adb -s emulator-5570 shell pm clear app.metanet.explorer
adb -s emulator-5570 logcat -c
adb -s emulator-5570 shell input keyevent KEYCODE_HOME
sleep 10
kill -0 "$launcher_pid"
task_name="TPNIL-WAB-UMP-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
task_amount=7
todo_url="https://todo.itcve.test/"
todo_create_url="https%3A%2F%2Ftodo.itcve.test%2F%3Fp0Task%3D${task_name}%26p0Amount%3D${task_amount}%26p0OpenCreate%3D1%26p0ImmediateBroadcast%3D1"
todo_complete_url="https%3A%2F%2Ftodo.itcve.test%2F%3Fp0CompleteTask%3D${task_name}%26p0ImmediateBroadcast%3D1"
otp="$(jq --exit-status --raw-output .code "$runtime_dir/.activation.json")"
rm -f "$runtime_dir/.activation.json"
maestro_bin="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
test -x "$maestro_bin"
TPNIL_ANDROID_UI_VENV="${TPNIL_ANDROID_UI_VENV:-/runner-cache/tpnil/tools/android-ui-venv}" \
  scripts/native/android/prepare-ui-driver.sh > "$evidence_dir/ui-driver-install.txt"
ui_python="$(tail -n 1 "$evidence_dir/ui-driver-install.txt")"
test -x "$ui_python"
"$ui_python" -m pip freeze > "$evidence_dir/ui-driver-packages.txt"
"$maestro_bin" test \
  --format junit \
  --output "$evidence_dir/config-open.xml" \
  scripts/native/android/metanet-wallet-config-open.yaml
"$ui_python" scripts/native/android/ui.py --serial emulator-5570 set-text \
  --text 'https://wab.babbage.systems' \
  --value "$(jq --raw-output .wabUrl "$runtime_dir/runtime.json")" \
  > "$evidence_dir/config-wab.json"
"$maestro_bin" test \
  -e TPNIL_WAB_URL="$(jq --raw-output .wabUrl "$runtime_dir/runtime.json")" \
  --format junit \
  --output "$evidence_dir/config-storage.xml" \
  scripts/native/android/metanet-wallet-config-storage.yaml
"$ui_python" scripts/native/android/ui.py --serial emulator-5570 set-text \
  --text 'https://storage.babbage.systems' \
  --value "$(jq --raw-output .storageUrl "$runtime_dir/runtime.json")" \
  > "$evidence_dir/config-storage.json"
app_pid="$(adb -s emulator-5570 shell pidof app.metanet.explorer | tr -d '\r')"
test -n "$app_pid"
adb -s emulator-5570 forward --remove tcp:9223 >/dev/null 2>&1 || true
adb -s emulator-5570 forward tcp:9223 "localabstract:webview_devtools_remote_$app_pid"
node scripts/native/android/watch-webview-console.mjs \
  http://127.0.0.1:9223 https://todo.itcve.test/ \
  > "$evidence_dir/webview-console.jsonl" 2>&1 &
webview_console_pid=$!
"$maestro_bin" test \
  -e TPNIL_WAB_URL="$(jq --raw-output .wabUrl "$runtime_dir/runtime.json")" \
  -e TPNIL_STORAGE_URL="$(jq --raw-output .storageUrl "$runtime_dir/runtime.json")" \
  -e TPNIL_PHONE_NATIONAL=5550102030 \
  -e TPNIL_OTP="$otp" \
  -e TPNIL_WALLET_PASSWORD=TPNIL-Fixture-2026! \
  -e TPNIL_TODO_URL="$todo_url" \
  -e TPNIL_TODO_CREATE_URL="$todo_create_url" \
  -e TPNIL_TODO_COMPLETE_URL="$todo_complete_url" \
  -e TPNIL_TASK_NAME="$task_name" \
  -e TPNIL_TASK_AMOUNT="$task_amount" \
  --format junit \
  --output "$evidence_dir/maestro.xml" \
  --debug-output "$evidence_dir/maestro-debug" \
  scripts/native/android/metanet-controlled-wab.yaml
scripts/native/android/capture-runtime.sh emulator-5570 app.metanet.explorer "$evidence_dir/final"
cleanup
trap - EXIT
test -s "$evidence_dir/controlled-boundary.json"
jq --exit-status '.verified == true and .taskOutputSatoshis == 7' \
  "$evidence_dir/boundary-verification.json" >/dev/null
jq --exit-status '.umpRecords | length >= 1' "$evidence_dir/controlled-boundary.json" >/dev/null
jq --exit-status '[.submissions[] | select(.verdict == "ACCEPTED_BY_NETWORK")] | length >= 3' \
  "$evidence_dir/controlled-boundary.json" >/dev/null
jq --exit-status '[.routes[] | select(.host == "wab.itcve.test")] | length >= 4' \
  "$evidence_dir/controlled-boundary.json" >/dev/null
jq --exit-status '[.routes[] | select(.host == "todo.itcve.test")] | length >= 1' \
  "$evidence_dir/controlled-boundary.json" >/dev/null
