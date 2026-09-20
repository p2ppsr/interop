#!/bin/sh
set -eu

test "$#" -eq 1 || { echo 'usage: tart-delete-run.sh tpnil-run-<identifier>' >&2; exit 2; }
run_name="$1"
printf '%s\n' "$run_name" | grep -Eq '^tpnil-run-[a-z0-9][a-z0-9-]*$' || { echo 'only TPNIL disposable run VMs may be deleted' >&2; exit 2; }
tart stop "$run_name" --timeout 10 >/dev/null 2>&1 || true
tart delete "$run_name"
