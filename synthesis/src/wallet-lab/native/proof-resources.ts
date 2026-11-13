// SPDX-License-Identifier: Apache-2.0
import { AsyncLocalStorage } from 'node:async_hooks'
import assert from 'node:assert/strict'

const legacy = Object.freeze({ maximumProofDepth: 32, maximumRetainedTransactions: 2048 })
const expanded = Object.freeze({ maximumProofDepth: 128, maximumRetainedTransactions: 2048 })
const resources = new AsyncLocalStorage<typeof legacy | typeof expanded>()

/** Resource admission belongs to the frozen parent profile. It never grants a
 * new proof root or exempts an ancestor body, signature, cycle or spent output.
 * Async context keeps simultaneous old/new profile verifiers isolated. */
export function nativeProofResources() { return resources.getStore() ?? legacy }

export function withNativeProofResources<T>(profile: string | undefined, action: () => T): T {
  return resources.run(profile === 'ITCVE-1@4.8.0' ? expanded : legacy, action)
}

/** Standalone oracle4 self-tests use the same explicitly versioned limits;
 * parent admission additionally binds that oracle to the 4.8 manifest. */
export function withTransactionProofResources<T>(revision: 1 | 2 | 3 | 4, action: () => T): T {
  assert.ok([1, 2, 3, 4].includes(revision), 'Unknown transaction proof resource revision')
  return resources.run(revision === 4 ? expanded : nativeProofResources(), action)
}
