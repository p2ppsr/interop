import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { EvidenceBundle, verifyEvidenceBundle } from '../src/wallet-lab/evidence.js'
import { matchesYoursCandidate, yoursPr368Coverage1Artifact } from '../src/wallet-lab/model.js'
import { validateComponentIdentity } from '../src/wallet-lab/go-services.js'
import { runYoursWallet } from '../src/wallet-lab/yours-driver.js'

const root = path.resolve(import.meta.dirname, '../..')
const retained = 'journals/integrated-native-attempts/2026-11-12/43195585984/original/repetition-1/evidence/service-components.json'
const bytes = fs.readFileSync(path.join(root, retained))
const components = JSON.parse(bytes.toString())
// LAB_SELF_TEST_ONLY: exercise complete evidence-bundle admission with an actual
// retained all-Go identity. Synthetic vectors/metadata are not a native replay.
function fixture(directory: string, change: (record: any) => void = () => {}) {
  const evidence = new EvidenceBundle(directory)
  evidence.addBytes('service-components.json', bytes)
  const record: any = {
    schema: 'tpnil-isi4-wallet-run@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY',
    profile: 'candidate-wallet-native-engineering', itcve: 'ITCVE-1@4.4.0', program: 'ISI-4@5.4.0',
    walletCandidate: { officialRelease: false }, artifacts: { wallet: yoursPr368Coverage1Artifact },
    configuration: { serviceComponents: structuredClone(components) },
    vectors: Array.from({ length: 8 }, (_, index) => ({ id: `SELFTEST-${index}`, outcome: 'BLOCKED' })),
    outcome: 'INCONCLUSIVE', scope: 'LAB_SELF_TEST_ONLY_ADMISSION_NOT_NATIVE_QUALIFICATION'
  }
  change(record)
  return evidence.write(record)
}
it('accepts exact4.4/5.4 evidence framing with the retained all-Go source identity', () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('db5c0ab28f3b6ac3ca1af4790c14f6376fb2c62d6ce5981da87c19ee431f4088')
  expect(components.components).toEqual({ overlay: 'go', chaintracks: 'go', storage: 'go' })
  expect(() => validateComponentIdentity(components, 'ITCVE-1@4.4.0')).not.toThrow()
  expect(matchesYoursCandidate(yoursPr368Coverage1Artifact, 'ITCVE-1@4.4.0')).toBe(true)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-coverage2-bundle-'))
  try {
    fixture(directory)
    expect(verifyEvidenceBundle(directory).itcve).toBe('ITCVE-1@4.4.0')
    const mutations = [
      (r: any) => { r.program = 'ISI-4@5.3.0' },
      (r: any) => { r.itcve = 'ITCVE-1@4.3.0' },
      (r: any) => { r.itcve = 'ITCVE-1@4.2.0'; r.program = 'ISI-4@5.2.0' },
      (r: any) => { r.walletCandidate.officialRelease = true },
      (r: any) => { r.claim = 'EXPERIMENTAL_CONFORMANCE_RESULT' },
      (r: any) => { r.artifacts.wallet = { ...r.artifacts.wallet, sha256: '00'.repeat(32) } },
      (r: any) => { r.configuration.serviceComponents.go.compatibilityPatch.schema = 'tpnil-storage-native-contracts-go-build@1.0.0' },
      (r: any) => { r.configuration.serviceComponents.go.compatibilityPatch.patchLockSha256 = '00'.repeat(32) },
      (r: any) => { delete r.configuration.serviceComponents.go.compatibilityPatch.inputs['synthesis/go/cmd/itcve-services/main.go'] },
      (r: any) => { r.configuration.serviceComponents.components.storage = 'typescript' }
    ]
    for (const mutate of mutations) { fixture(directory, mutate); expect(() => verifyEvidenceBundle(directory)).toThrow() }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
it('rejects artifact/program cross-profile substitutions before creating a browser', async () => {
  for (const walletArtifact of [{ ...yoursPr368Coverage1Artifact, version: '5.1.1' }, { ...yoursPr368Coverage1Artifact, sha256: '00'.repeat(32) }]) {
    await expect(runYoursWallet({ integratedProfile: 'ITCVE-1@4.4.0', walletCandidate: { officialRelease: false }, walletArtifact } as any)).rejects.toThrow('explicit artifact')
  }
})
