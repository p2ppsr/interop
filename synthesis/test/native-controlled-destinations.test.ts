import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { nativeControlledDestinations } from '../src/wallet-lab/yours-driver.js'
import { config } from '../src/wallet-lab/native/coverage-completion/permissions-model.js'

const plan = (name: string) => JSON.parse(fs.readFileSync(new URL(`../../infra/native/conformance/${name}.json`, import.meta.url), 'utf8'))

test('completion admission declares exactly the destinations emitted by the native worker', () => {
  const actual = nativeControlledDestinations('ITCVE-1@4.6.0')
  const frozen = plan('plan-pr368-coverage-4')
  assert.equal(new Set(actual).size, actual.length)
  assert.deepEqual(frozen.controlledDestinations, actual)
  const sequence = Object.values(config.origins).map(origin => new URL(origin).host)
  assert.equal(sequence.length, 5)
  assert.deepEqual(actual.slice(0, 5), sequence)
  for (const host of sequence) assert.ok(frozen.controlledDestinations.includes(host))
})

test('the prior completion plan retains the independently observed five-host omission', () => {
  const prior = plan('plan-pr368-coverage-3-source-5').controlledDestinations
  const actual = nativeControlledDestinations('ITCVE-1@4.6.0')
  assert.deepEqual(actual.slice(5), prior)
  assert.throws(() => assert.deepEqual(actual, prior))
})

test('the retained recovery profile keeps its original destination contract', () => {
  assert.deepEqual(nativeControlledDestinations('ITCVE-1@4.4.0'), plan('plan-pr368-coverage-2').controlledDestinations)
})
