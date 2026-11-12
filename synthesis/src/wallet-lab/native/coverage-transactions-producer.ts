import type { BoundaryWallet } from '../boundary-corpus.js'
import type { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { captureClauseError } from './conformance-clauses.js'
import { getTransactionCoveragePolicy, type TransactionCoverageRevision, type TransactionCoverageReport, type TransactionCoverageSubmission } from './coverage-transactions-model.js'
import { transactionCoverageProgram } from './coverage-transactions-program.js'
import { deriveTransactionCoverageOutcomes } from './coverage-transactions-verifier.js'
export async function runNativeTransactionCoverage({ wallet, funder, identity, services, evidence }: { wallet: BoundaryWallet; funder: BoundaryWallet; identity: string; services: ControlledWalletServices; evidence: EvidenceBundle }, revision: TransactionCoverageRevision = 1): Promise<TransactionCoverageReport> {
  const { policy, policySha256 } = getTransactionCoveragePolicy(revision)
  const ledger = (): TransactionCoverageSubmission[] => services.submissions.map(row => ({ txid: row.txid, beefHex: Buffer.from(row.bytes).toString('hex'), verdict: row.verdict }))
  const report: TransactionCoverageReport = { schema: `tpnil-native-coverage-transactions@${revision}.0.0`, oracle: policy.oracle, policySha256, claim: 'ENGINEERING_OBSERVATION_ONLY', completeBRC100Conformance: false, identity, trace: [], skipped: [], submissionStart: services.submissions.length, submissionEnd: services.submissions.length, submissionPrefix: ledger(), submissions: [], storageTransactions: [], assertions: [], result: 'BLOCKED', finalLedgerRequired: true }
  try {
    const execution = await transactionCoverageProgram(async (id, actor, method, args) => {
      if (report.trace.length >= policy.bounds.maximumPublicCalls) throw Error('Transaction coverage public call budget exceeded')
      const row: any = { id, actor, method, args: structuredClone(args), submissionStart: services.submissions.length, submissionEnd: services.submissions.length }; report.trace.push(row)
      try { row.result = JSON.parse(JSON.stringify(await (actor === 'wallet' ? wallet : funder)[method]!(structuredClone(args)))) } catch (error) { row.error = captureClauseError(error) }
      row.submissionEnd = services.submissions.length; return row
    }, identity)
    report.skipped = execution.skipped
  } finally {
    report.submissionEnd = services.submissions.length; report.submissions = ledger().slice(report.submissionStart); report.storageTransactions = await services.nativeTransactions()
    evidence.addJson('conformance/coverage-transactions-observed.json', report); evidence.flush()
    report.assertions = await deriveTransactionCoverageOutcomes(report)
    report.result = report.assertions.some(r => r.result === 'FAIL') ? 'FAIL' : report.assertions.some(r => r.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
    evidence.addJson('conformance/coverage-transactions.json', report)
  }
  return report
}
