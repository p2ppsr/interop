import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const controlledHeaderFixture = 'tpnil-native-controlled-header@1.0.0'
export type ControlledHeaderFixture = typeof controlledHeaderFixture
export const controlledHeaderAssertion = 'getHeaderForHeight.controlled-mined'
export const controlledHeaderPolicyPath = 'programs/ISI-4/profiles/brc100-boundary-1.0.0/controlled-header-1.0.0.json'

/** Load only for the separately selected observer. Legacy images need neither
 * this policy nor its positive-header fixture to execute their old probe. */
export function getControlledHeaderFixture(id: ControlledHeaderFixture) {
  assert.equal(id, controlledHeaderFixture, 'Unsupported controlled header fixture')
  const root = path.resolve(import.meta.dirname, '../../../..')
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const bytes = fs.readFileSync(path.join(root, controlledHeaderPolicyPath)), policy = JSON.parse(bytes.toString())
  assert.equal(policy.schema, 'tpnil-native-header-fixture-policy@1.0.0')
  assert.equal(policy.id, controlledHeaderFixture); assert.equal(policy.assertionId, controlledHeaderAssertion)
  assert.equal(policy.fixture.path, 'fixtures/teranode/wab-funding-v1.json')
  const fixtureBytes = fs.readFileSync(path.join(root, policy.fixture.path)), fixture = JSON.parse(fixtureBytes.toString())
  assert.equal(hash(fixtureBytes), policy.fixture.sha256, 'Controlled header funding fixture bytes changed')
  assert.equal(policy.height, 1); assert.equal(fixture.fundingHeight, policy.height)
  assert.match(policy.blockHeaderHex, /^[0-9a-f]{160}$/); assert.equal(fixture.blockHeaderHex, policy.blockHeaderHex)
  return { id: controlledHeaderFixture, assertionId: controlledHeaderAssertion, policySha256: hash(bytes), fixtureSha256: hash(fixtureBytes), height: policy.height as number, header: policy.blockHeaderHex as string }
}
