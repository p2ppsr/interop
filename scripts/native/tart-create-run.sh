#!/bin/sh
set -eu

test "$#" -eq 1 || { echo 'usage: tart-create-run.sh tpnil-run-<identifier>' >&2; exit 2; }
run_name="$1"
base_name=tpnil-macos-tahoe-base-202609
printf '%s\n' "$run_name" | grep -Eq '^tpnil-run-[a-z0-9][a-z0-9-]*$' || { echo 'run name must match tpnil-run-[a-z0-9][a-z0-9-]*' >&2; exit 2; }
command -v tart >/dev/null 2>&1 || { echo 'Tart is not installed' >&2; exit 2; }
tart get "$base_name" --format json >/dev/null
if tart list --source local --quiet | grep -Fx "$run_name" >/dev/null 2>&1; then
  echo "run VM already exists: $run_name" >&2
  exit 2
fi
TART_NO_AUTO_PRUNE=1 tart clone "$base_name" "$run_name" --stacked
tart set "$run_name" --cpu 8 --memory 16384 --display 1440x900 --random-mac --random-serial
tart get "$run_name" --format json
