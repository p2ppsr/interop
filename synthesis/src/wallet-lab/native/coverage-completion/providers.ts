// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { PrivateKey } from '@bsv/sdk'

/** These are the existing controlled-services and portability fixture roles.
 * Derive the inventory from the source-owned roles, never from a child's list.
 * Component identities must already pass the complete native parent admission. */
export function nativeCompletionProviders(read: (name: string) => Buffer) {
  const json = (name: string) => JSON.parse(read(name).toString())
  const counterparts = json('conformance/service-counterparts.json')
  assert.deepEqual(Object.keys(counterparts), ['replacement-wallet.itcve.test'])
  return [
    { id: 'source', identityKey: PrivateKey.fromHex('11'.repeat(32)).toPublicKey().toString(), componentIdentity: json('service-components.json') },
    { id: 'source/replacement-wallet.itcve.test', identityKey: PrivateKey.fromHex('12'.repeat(32)).toPublicKey().toString(), componentIdentity: counterparts['replacement-wallet.itcve.test'] }
  ]
}
