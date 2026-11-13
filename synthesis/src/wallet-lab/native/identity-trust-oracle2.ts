import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const identityTrustOracle2Id = 'tpnil-native-identity-trust-oracle@2.0.0' as const
export interface IdentityTrustOracleOptions { oracle?: typeof identityTrustOracle2Id }

/** Read only when explicitly selected, so legacy images need no new policy. */
export function getIdentityTrustOracle2Policy(oracle: string = identityTrustOracle2Id) {
  assert.equal(oracle, identityTrustOracle2Id, 'Unsupported native trust oracle')
  const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../../../infra/native/integrated/identity-trust-oracle-2.0.0.json'))
  const policy = JSON.parse(bytes.toString())
  assert.equal(policy.id, identityTrustOracle2Id); assert.equal(policy.schema, identityTrustOracle2Id)
  assert.equal(policy.source.responseField, 'publiclyRevealedKeyring')
  assert.equal(policy.binding.verifier, '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
  assert.deepEqual(policy.binding.fieldsToReveal, ['name'])
  assert.deepEqual(policy.binding.expectedPlaintext, { name: 'TPNIL boundary identity' })
  return { policy, policySha256: createHash('sha256').update(bytes).digest('hex') }
}
