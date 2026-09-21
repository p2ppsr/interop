#!/usr/bin/env bash
set -euo pipefail

avd_name="${1:-TPNIL_API_36}"
api="${TPNIL_ANDROID_API:-36}"
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
case "$(uname -m)" in
  arm64|aarch64) abi="arm64-v8a" ;;
  *) abi="x86_64" ;;
esac
image="system-images;android-${api};google_apis;${abi}"
sdkmanager="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
avdmanager="$sdk_root/cmdline-tools/latest/bin/avdmanager"

test -x "$sdkmanager"
test -x "$avdmanager"
"$sdkmanager" "platform-tools" "emulator" "$image"

if ! "$sdk_root/emulator/emulator" -list-avds | grep -Fxq "$avd_name"; then
  printf 'no\n' | "$avdmanager" create avd --force --name "$avd_name" --package "$image" --device medium_phone
fi

config="$HOME/.android/avd/${avd_name}.avd/config.ini"
test -f "$config"
python3 - "$config" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
values = {}
for line in path.read_text().splitlines():
    if '=' in line:
        key, value = line.split('=', 1)
        values[key] = value
values.update({
    'PlayStore.enabled': 'false',
    'disk.dataPartition.size': '8G',
    'fastboot.forceColdBoot': 'yes',
    'fastboot.forceFastBoot': 'no',
    'hw.gpu.enabled': 'yes',
    'hw.gpu.mode': 'auto',
    'hw.keyboard': 'yes',
    'showDeviceFrame': 'no',
})
path.write_text(''.join(f'{key}={values[key]}\n' for key in sorted(values)))
PY

printf 'avd=%s\nimage=%s\nconfig=%s\n' "$avd_name" "$image" "$config"
