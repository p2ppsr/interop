import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { identifiesYoursCandidate, matchesYoursCandidate, yoursCandidateArtifactsByProfile, yoursPr368Artifact, type ArtifactIdentity } from '../src/wallet-lab/model.js'
import { verifyEvidenceBundle } from '../src/wallet-lab/evidence.js'
import { runYoursWallet } from '../src/wallet-lab/yours-driver.js'
import { runNativeConformance } from '../src/wallet-lab/native/conformance.js'

// No browser is launched. These cases exercise the artifact admission boundary
// before any service, wallet or native session can be created.
it('keeps executed profile4.1 bound to the exact acquired7e39006 artifact', () => {
  expect(yoursPr368Artifact).toEqual({ id: 'yours-wallet-chromium-extension', version: '5.1.1-pr368.7e39006', sha256: 'b80e5a7572bdf11e568ecf41cbf439a0062605a5a2f196b53948b18e1b7fe10e', size: 13238310 })
  expect(matchesYoursCandidate({ ...yoursPr368Artifact })).toBe(true)
  expect(matchesYoursCandidate({ ...yoursPr368Artifact }, 'ITCVE-1@4.1.0')).toBe(true)
  expect(matchesYoursCandidate({ ...yoursPr368Artifact }, 'ITCVE-1@4.2.0')).toBe(false)
})
for (const profile of ['ITCVE-1@4.1.0', 'ITCVE-1@4.2.0'] as const) describe(profile, () => {
  it('accepts only its independently pinned artifact, if one has been acquired', () => {
    const artifact = yoursCandidateArtifactsByProfile[profile]
    if (!artifact) {
      expect(matchesYoursCandidate(yoursPr368Artifact, profile)).toBe(false)
      return
    }
    expect(matchesYoursCandidate({ ...artifact }, profile)).toBe(true)
    for (const [key, value] of [['id', 'other-wallet'], ['version', '5.1.1'], ['sha256', 'ee'.repeat(32)], ['size', artifact.size + 1]] as const) {
      expect(matchesYoursCandidate({ ...artifact, [key]: value }, profile)).toBe(false)
    }
    expect(identifiesYoursCandidate({ ...artifact, version: '5.1.1' })).toBe(true)
  })
  it('rejects artifact substitution in the executable driver before browser startup', async () => {
    await expect(runYoursWallet({ integratedProfile: profile, walletCandidate: { officialRelease: false }, walletArtifact: { ...yoursPr368Artifact, sha256: 'ee'.repeat(32) } } as any)).rejects.toThrow('explicit artifact')
  })
})
it('does not relabel the old candidate as observer3 or admit a candidate as a release', async () => {
  await expect(runYoursWallet({ integratedProfile: 'ITCVE-1@4.2.0', walletCandidate: { officialRelease: false }, walletArtifact: yoursPr368Artifact } as any)).rejects.toThrow('explicit artifact')
  await expect(runYoursWallet({ integratedProfile: 'ITCVE-1@4.0.0', walletArtifact: { ...yoursPr368Artifact, version: '5.1.1' } } as any)).rejects.toThrow('official release')
})
it('checks the same profile/artifact/program boundary when reading evidence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-profile-boundary-'))
  try {
    const base = { schema: 'tpnil-isi4-wallet-run@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', profile: 'candidate-wallet-native-engineering', itcve: 'ITCVE-1@4.2.0', program: 'ISI-4@5.2.0', walletCandidate: { officialRelease: false }, artifacts: { wallet: yoursPr368Artifact } }
    fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify(base))
    expect(() => verifyEvidenceBundle(directory)).toThrow('explicit engineering boundary')
    fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify({ ...base, program: 'ISI-4@5.1.0' }))
    expect(() => verifyEvidenceBundle(directory)).toThrow('program boundary')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
it.each([
  [1, 'tpnil-native-controlled-header@1.0.0', 'tpnil-native-identity-trust-oracle@2.0.0'],
  [2, undefined, 'tpnil-native-identity-trust-oracle@2.0.0'],
  [2, 'tpnil-native-controlled-header@1.0.0', undefined]
] as const)('requires all prospective observer3 fixtures before executing native calls (%s, %s, %s)', async (revision, header, trust) => {
  await expect(runNativeConformance({} as any, true, true, 'pr368-observer3', revision, header, trust)).rejects.toThrow('prospective fixtures')
})
