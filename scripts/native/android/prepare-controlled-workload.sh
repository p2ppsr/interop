#!/usr/bin/env bash
# Shared by the owned runner and disposable controlled-service laboratory hosts.
set -euo pipefail
mkdir -p "$RUNNER_TEMP/tpnil-source"
git -c advice.detachedHead=false clone --filter=blob:none --no-checkout \
  https://github.com/bsv-blockchain/ts-stack.git "$RUNNER_TEMP/tpnil-source/ts-stack"
git -C "$RUNNER_TEMP/tpnil-source/ts-stack" fetch --depth=1 origin \
  6e53b215c43af5ea2e50bcdb7f136e23ee7da080
git -C "$RUNNER_TEMP/tpnil-source/ts-stack" checkout --detach \
  6e53b215c43af5ea2e50bcdb7f136e23ee7da080
test "$(git -C "$RUNNER_TEMP/tpnil-source/ts-stack" rev-parse HEAD)" = \
  6e53b215c43af5ea2e50bcdb7f136e23ee7da080
npm ci --prefix synthesis
npm ci --prefix "$RUNNER_TEMP/tpnil-source/ts-stack/infra/wab"
npm run build --prefix "$RUNNER_TEMP/tpnil-source/ts-stack/infra/wab"
test "$(sha256sum fixtures/artifacts/todo-ts-236733c-webroot.tgz | awk '{print $1}')" = \
  b3c41dc60ba99b497231008a15033a60110cc7cd60b2d4fffd405e33f4979ddc
test "$(stat -c '%s' fixtures/artifacts/todo-ts-236733c-webroot.tgz)" = 502803
test "$(sha256sum fixtures/teranode/wab-funding-v1.json | awk '{print $1}')" = \
  7c4fd4d2c98f8c80b4ac41614b09c9baed91c087b1a418e0f15edc6b8e55560a
mkdir -p "$RUNNER_TEMP/tpnil-source/todo-webroot"
tar --extract --gzip --file fixtures/artifacts/todo-ts-236733c-webroot.tgz \
  --directory "$RUNNER_TEMP/tpnil-source/todo-webroot"
test -f "$RUNNER_TEMP/tpnil-source/todo-webroot/index.html"
