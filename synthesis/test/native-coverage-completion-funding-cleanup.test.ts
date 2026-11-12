import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, it, expect, vi } from 'vitest'
const state = vi.hoisted(() => ({ destroy: vi.fn(), getPublicKey: vi.fn() }))
vi.mock('../src/storage-sync/fixture-wallet.js', () => ({ createFixtureWallet: async () => ({ destroy: state.destroy, getPublicKey: state.getPublicKey }) }))
import { runNativeCompletionFunding, completionFundingPolicy } from '../src/wallet-lab/native/coverage-completion/funding.js'
import { coverageObservationEncoding, decodeCoverageObservation } from '../src/wallet-lab/native/coverage-observation.js'

function context() {
  const evidence = new Map<string, unknown>(), primary = Error('Owned snapshot observer failed')
  return { primary, evidence, context: {
    services: { submissions: [], nativeOutputSnapshotObservations: [], nativeOutputSnapshots: async () => { throw primary } },
    application: { evaluate: async () => ({ ok: true, result: { publicKey: '02' + '11'.repeat(32) } }) },
    evidence: { addJson: (name: string, value: unknown) => evidence.set(name, value) }
  } as any }
}
describe('Completion funding retains actual failure and cleanup evidence', () => {
  it('snapshots the public request before a wallet mutates its argument object', async () => {
    const retained = JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/native-completion-funding/reference.json.gz', import.meta.url))).toString())
    const evidence = new Map<string, unknown>(), failure = Error('Funder stopped after argument mutation')
    state.destroy.mockReset().mockResolvedValue(undefined)
    state.getPublicKey.mockReset().mockImplementation(async args => { args.identityKey = false; throw failure })
    const observations: any[] = []
    const c: any = { services: { submissions: [], nativeOutputSnapshotObservations: observations,
      nativeOutputProviderRegistry: retained.evidence['native-output-provider-registry.json'],
      nativeOutputSnapshots: async () => { const snapshot = structuredClone(retained.report.snapshots[0]); observations.push(snapshot); return snapshot.snapshots } },
      application: { evaluate: async () => ({ ok: true, result: { publicKey: retained.report.identity } }) },
      evidence: { addJson: (name: string, value: unknown) => evidence.set(name, value) } }
    await expect(runNativeCompletionFunding(c)).rejects.toBe(failure)
    const report = decodeCoverageObservation<any>(evidence.get('conformance/completion-funding.json'), coverageObservationEncoding)
    expect(report.trace[1].id).toBe('funder-identity'); expect(report.trace[1].args).toEqual({ identityKey: true })
    expect(state.getPublicKey.mock.calls[0]![0]).toEqual({ identityKey: false })
  })

  it('retains the primary failure and a successful cleanup without qualifying funding', async () => {
    state.destroy.mockReset().mockResolvedValue(undefined)
    const c = context(); await expect(runNativeCompletionFunding(c.context)).rejects.toBe(c.primary)
    const report = decodeCoverageObservation<any>(c.evidence.get('conformance/completion-funding.json'), coverageObservationEncoding)
    expect(report.cleanup.funderClosed).toBe(true); expect(report.errors).toEqual([String(c.primary)])
    expect(report.policy.stage).toBe('after-original-535-before-completion'); expect(report.policy.amount).toBe(50000)
    expect(state.destroy).toHaveBeenCalledOnce()
  })
  it('retains cleanup failure alongside the original observer error and preserves its cause', async () => {
    const cleanup = Error('Funder destroy RPC failed'); state.destroy.mockReset().mockRejectedValue(cleanup)
    const c = context(); let failure: any
    try { await runNativeCompletionFunding(c.context) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(AggregateError); expect(failure.cause).toBe(c.primary); expect(failure.errors).toEqual([c.primary, cleanup])
    const report = decodeCoverageObservation<any>(c.evidence.get('conformance/completion-funding.json'), coverageObservationEncoding)
    expect(report.cleanup.funderClosed).toBe(false); expect(report.errors).toEqual([String(c.primary), `Funder cleanup: ${String(cleanup)}`])
    expect(report.policy).toEqual(completionFundingPolicy); expect(report.endedAt).toMatch(/Z$/)
  })
})
