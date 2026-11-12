// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'

const profiles = {
  'ITCVE-1@4.5.0': { program: 'ISI-4@5.5.0', extensionRevision: 2, basketRevision: 1 },
  'ITCVE-1@4.6.0': { program: 'ISI-4@5.6.0', extensionRevision: 3, basketRevision: 1 },
  'ITCVE-1@4.7.0': { program: 'ISI-4@5.7.0', extensionRevision: 4, basketRevision: 2 }
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
