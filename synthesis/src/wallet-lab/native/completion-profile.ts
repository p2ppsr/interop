// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'

const profiles = {
  'ITCVE-1@4.5.0': { program: 'ISI-4@5.5.0', extensionRevision: 2, basketRevision: 1, transactionRevision: 3 },
  'ITCVE-1@4.6.0': { program: 'ISI-4@5.6.0', extensionRevision: 3, basketRevision: 1, transactionRevision: 3 },
  'ITCVE-1@4.7.0': { program: 'ISI-4@5.7.0', extensionRevision: 4, basketRevision: 2, transactionRevision: 3 },
  'ITCVE-1@4.8.0': { program: 'ISI-4@5.8.0', extensionRevision: 4, basketRevision: 3, transactionRevision: 4 }
} as const
export type NativeCompletionProfile = keyof typeof profiles

/** Capture and independent verification select the same published criteria from
 * the parent's profile, never from a child's asserted oracle or revision. */
export function nativeCompletionProfile(profile: string) {
  assert.ok(Object.hasOwn(profiles, profile), 'Unknown native completion profile')
  const selected = profiles[profile as NativeCompletionProfile]
  return { profile: profile as NativeCompletionProfile, ...selected,
    manifest: `itcves/ITCVE-1/${profile.split('@')[1]}/profile.json`,
    extensionDirectory: `native-coverage-extension-${selected.extensionRevision}.0.0` }
}

/** Completion owns the complete nine-context chain. The older permission
 * anchor owns its initial five-context prefix, of which it verifies the first
 * three. Keep the exact complete count before projecting that declared prefix;
 * the completion parents independently join all remaining restart receipts. */
export function permissionCoverageEvidenceForCompletion(read: (name: string) => Buffer, profile?: NativeCompletionProfile) {
  if (!profile) return read
  nativeCompletionProfile(profile)
  if (profile !== 'ITCVE-1@4.8.0') return read
  return (name: string): Buffer => {
    if (name !== 'native-browser-contexts.json') return read(name)
    const value = JSON.parse(read(name).toString())
    assert.equal(value.schema, 'tpnil-native-browser-contexts@1')
    assert.equal(value.contexts.length, 9, 'Completion requires the complete nine-context chain')
    assert.deepEqual(value.contexts.map((context: { sequence: number }) => context.sequence), [0, 1, 2, 3, 4, 5, 6, 7, 8])
    return Buffer.from(JSON.stringify({ ...value, contexts: value.contexts.slice(0, 5) }))
  }
}
