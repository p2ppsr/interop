#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../../.." && pwd)"
venv="${TPNIL_ANDROID_UI_VENV:-$root/out/tools/android-ui-venv}"
python3 -m venv "$venv"
"$venv/bin/pip" install --disable-pip-version-check -r "$root/scripts/native/android/requirements-ui.txt"
printf '%s\n' "$venv/bin/python"
