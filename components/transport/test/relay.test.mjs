import test from 'node:test'
import assert from 'node:assert/strict'
import { qualifyRelay } from '../relay.mjs'
test('published relay and pairing clients enforce the complete protocol boundary', {timeout:45000}, async () => {
  const result = await qualifyRelay()
  assert.equal(result.assertions.length, 8)
  assert.deepEqual(result.assertions.filter(a => a.result !== 'PASS'), [])
  assert.equal(result.cleanup.httpClosed, true)
})
