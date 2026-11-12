import type { BoundaryWallet } from '../boundary-corpus.js'
import type { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { captureClauseError } from './conformance-clauses.js'
import { coverageExtensionPolicy as policy, coverageExtensionPolicySha256, selectedCoverageExtensionPolicy, coverageExtensionOracle2, extensionConfig as c, type CoverageExtensionReport } from './coverage-extension-model.js'
import { coverageExtensionRequests, extensionCryptoEnvironment } from './coverage-extension-requests.js'
import { deriveCoverageExtensionOutcomes } from './coverage-extension-verifier.js'

/** Standalone prospective extension. Caller supplies an already funded external
 * fixture wallet; no admission, funding, UI or existing profile is changed. */
export async function runNativeCoverageExtension({ wallet, funder, services, evidence, boundaryReport, clauseReport, trustReport, observationRevision = 2 }: {
  wallet: BoundaryWallet; funder: BoundaryWallet; services: ControlledWalletServices; evidence: Pick<EvidenceBundle, 'addJson'>; boundaryReport: any; clauseReport: any; trustReport?: any; observationRevision?: 1 | 2
}): Promise<CoverageExtensionReport> {
  const selected = selectedCoverageExtensionPolicy(observationRevision === 2 ? coverageExtensionOracle2 : policy.oracle), activePolicy = selected.policy
  const identity = boundaryReport.trace.find((r: any) => r.method === 'getPublicKey' && r.args?.identityKey === true)?.result?.publicKey ?? ''
  const snapshot = () => services.submissions.map(value => ({ txid: value.txid, beefHex: Buffer.from(value.bytes).toString('hex'), verdict: value.verdict }))
  const report: CoverageExtensionReport = { schema: 'tpnil-native-coverage-extension@1.0.0', oracle: activePolicy.oracle, policySha256: selected.sha256,
    claim: 'ENGINEERING_OBSERVATION_ONLY', completeBRC100Conformance: false, identity,
    anchors: JSON.parse(JSON.stringify({ boundary: boundaryReport, clauses: clauseReport, ...(trustReport === undefined ? {} : { trust: trustReport }) })),
    peerSignature: [], trace: [], ...(observationRevision === 2 ? { outputSnapshots: [], outputSnapshotWindow: { startIndex: services.nativeOutputSnapshotObservations.length, endIndex: services.nativeOutputSnapshotObservations.length } } : {}), errors: [], submissionStart: services.submissions.length, submissionEnd: services.submissions.length,
    submissionPrefix: snapshot(), submissions: [], storageTransactions: [], assertions: [], result: 'BLOCKED', finalLedgerRequired: true }
  try {
    const e = extensionCryptoEnvironment(identity)
    report.peerSignature = (await e.peer.createSignature({ protocolID: c.protocolID, keyID: c.keyID, counterparty: identity, data: c.data })).signature
    for (let index = 0; ; index++) {
      const request = coverageExtensionRequests(report)[index]; if (!request) break
      if (index >= activePolicy.bounds.maximumPublicCalls) throw Error('Coverage extension call bound exceeded')
      const row = { ...request, args: structuredClone(request.args), submissionStart: services.submissions.length, submissionEnd: services.submissions.length } as CoverageExtensionReport['trace'][number]
      report.trace.push(row)
      const captureOutputs = async (phase: 'before' | 'after') => {
        const sequence = services.nativeOutputSnapshotObservations.length
        try { await services.nativeOutputSnapshots(identity) } catch { /* Missing controls remain explicit observer errors, never invented snapshots. */ }
        const observation = services.nativeOutputSnapshotObservations[sequence]; if (!observation) throw new Error('Owned snapshot observation ledger omitted its call')
        report.outputSnapshots!.push({ callId: row.id, phase, observation })
      }
      if (observationRevision === 2 && row.method === 'internalizeAction') await captureOutputs('before')
      if (observationRevision === 2) row.startedAt = new Date().toISOString()
      try { row.result = structuredClone(await (request.actor === 'wallet' ? wallet : funder)[request.method]!(structuredClone(request.args))) } catch (error) { row.error = captureClauseError(error) }
      if (observationRevision === 2) row.endedAt = new Date().toISOString()
      row.submissionEnd = services.submissions.length
      if (observationRevision === 2 && row.method === 'internalizeAction') await captureOutputs('after')
    }
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) }
  if (report.outputSnapshotWindow) report.outputSnapshotWindow.endIndex = services.nativeOutputSnapshotObservations.length
  report.submissionEnd = services.submissions.length; report.submissions = snapshot().slice(report.submissionStart, report.submissionEnd)
  report.storageTransactions = await services.nativeTransactions()
  evidence.addJson('conformance/coverage-extension.json', report) // Preserve raw capture even if independent structural validation rejects it.
  report.assertions = await deriveCoverageExtensionOutcomes(report)
  report.result = report.assertions.some(row => row.result === 'FAIL') ? 'FAIL' : report.assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
  evidence.addJson('conformance/coverage-extension.json', report)
  return report
}
