#!/bin/sh
set -eu

expected_version=2.37.0
base_name=tpnil-macos-tahoe-base-202609
source_image=ghcr.io/cirruslabs/macos-tahoe-base@sha256:1b093499716409d29e8b5336844528e1cae375db97d2ad8e5aeff78cf0da201e
concurrency="${TPNIL_TART_PULL_CONCURRENCY:-4}"

command -v tart >/dev/null 2>&1 || { echo 'Tart is not installed' >&2; exit 2; }
test "$(tart --version)" = "$expected_version" || { echo "Tart $expected_version is required" >&2; exit 2; }
if tart list --source local --quiet | grep -Fx "$base_name" >/dev/null 2>&1; then
  tart get "$base_name" --format json
  exit 0
fi
TART_NO_AUTO_PRUNE=1 tart clone "$source_image" "$base_name" --concurrency "$concurrency"
tart get "$base_name" --format json
