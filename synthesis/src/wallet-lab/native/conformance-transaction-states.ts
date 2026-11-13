import { Beef, Transaction } from '@bsv/sdk'
import type { BoundaryWallet } from '../boundary-corpus.js'
import type { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { captureClauseError } from './conformance-clauses.js'
import { stateConfig as c, fanoutArgs, getTransactionStatePolicy, type StateReport } from './conformance-transaction-states-model.js'
import { deriveTransactionStateOutcomes } from './verify-transaction-states.js'

export async function runNativeTransactionStates({ wallet, services, evidence, boundaryReport, oracleRevision = 1 }: { wallet: BoundaryWallet; services: ControlledWalletServices; evidence: EvidenceBundle; boundaryReport: any; oracleRevision?: 1 | 2 }): Promise<StateReport> {
  const { policy, policySha256 } = getTransactionStatePolicy(oracleRevision)
  const identity = boundaryReport.trace.find((r: any) => r.method === 'getPublicKey' && r.args?.identityKey === true)?.result?.publicKey
  if (!identity) throw Error('Transaction states require the observed native identity')
  const report: StateReport = { schema: 'tpnil-native-transaction-states@1.0.0', oracle: policy.oracle, claim: 'ENGINEERING_OBSERVATION_ONLY', policySha256, identity, trace: [], skipped: [], errors: [], submissionStart: services.submissions.length, submissionEnd: services.submissions.length, submissions: [], storageTransactions: [], assertions: [], result: 'BLOCKED', completeBRC100Conformance: false }
  const call = async (id: string, method: string, args: any) => {
    if (report.trace.length >= policy.bounds.maximumPublicCalls) throw Error('Transaction-state public call budget exceeded')
    const row: any = { id, method, args: structuredClone(args), submissionStart: services.submissions.length, submissionEnd: services.submissions.length }; report.trace.push(row)
    try { row.result = JSON.parse(JSON.stringify(await wallet[method]!(structuredClone(args)))) } catch (error) { row.error = captureClauseError(error) }
    row.submissionEnd = services.submissions.length; return row
  }
  const dependent = async (id: string, method: string, prior: any, make: (reference: string) => any) => {
    const ref = prior.result?.signableTransaction?.reference
    if (typeof ref !== 'string') { report.skipped.push({ id, dependency: prior.id }); return }
    return call(id, method, make(ref))
  }
  const cleanup = async (prior: any) => { if (typeof prior.result?.signableTransaction?.reference === 'string') await call(`${prior.id}-cleanup`, 'abortAction', { reference: prior.result.signableTransaction.reference }) }
  try {
    const fanout = await call('fanout', 'createAction', fanoutArgs())
    let source: Transaction | undefined
    try { source = Transaction.fromAtomicBEEF(fanout.result?.tx); if (source.id('hex') !== fanout.result?.txid) source = undefined } catch { /* Preserved failed setup. */ }
    if (source) {
      const input = (index: number, pending = false) => ({ outpoint: `${source!.id('hex')}.${index}`, inputDescription: `TPNIL state input ${index}`, ...(pending ? { unlockingScriptLength: 1 } : { unlockingScript: '51' }) })
      const outputs = [{ satoshis: 2, lockingScript: '51', outputDescription: 'TPNIL state result first', basket: c.resultBasket }, { satoshis: 3, lockingScript: '51', outputDescription: 'TPNIL state result second', basket: c.resultBasket }]
      const create = (id: string, inputs: any[], options: any = {}, extras: any = {}) => ({ description: `TPNIL state ${id}`, inputBEEF: fanout.result.tx, inputs, outputs, labels: [c.label], options: { acceptDelayedBroadcast: false, ...options }, ...extras })
      const prepared = (id: string, index: number) => call(id, 'createAction', create(id, [input(index, true)], { signAndProcess: false, randomizeOutputs: false }))
      await call('source-before', 'listOutputs', { basket: c.basket, include: 'locking scripts', includeTags: true, limit: 100 })
      await call('direct-default', 'createAction', create('direct-default', [input(0)]))
      await call('direct-explicit', 'createAction', create('direct-explicit', [{ ...input(1), sequenceNumber: 4294967294 }], { signAndProcess: true, noSend: false, returnTXIDOnly: false, randomizeOutputs: true }, { version: 2, lockTime: 0 }))
      const mixed = await call('mixed-prepare', 'createAction', create('mixed-prepare', [input(2), input(3, true)], { randomizeOutputs: false }))
      await dependent('mixed-sign', 'signAction', mixed, reference => ({ reference, spends: { 1: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } }))
      const abort = await prepared('abort-prepare', 4)
      await dependent('abort', 'abortAction', abort, reference => ({ reference }))
      await dependent('abort-sign', 'signAction', abort, reference => ({ reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } }))
      const control = await prepared('conflict-control', 5)
      await dependent('conflict-control-abort', 'abortAction', control, reference => ({ reference }))
      const absent = new Beef()
      const negatives: Array<[string, any]> = [
        ['input-absent-from-beef', create('input-absent-from-beef', [input(5)], {}, { inputBEEF: absent.toBinary() })],
        ['input-index-out-of-range', create('input-index-out-of-range', [input(source.outputs.length)])],
        ['already-spent-input', create('already-spent-input', [input(0)])],
        ['script-and-length-conflict', create('script-and-length-conflict', [{ ...input(7), unlockingScriptLength: 2 }])],
        ['missing-script-and-length', create('missing-script-and-length', [{ outpoint: input(8).outpoint, inputDescription: input(8).inputDescription }])]
      ]
      for (const [id, args] of negatives) await cleanup(await call(id, 'createAction', args))
      for (const [id, index, spends] of [['spend-index-not-in-reference', 9, { 999999: { unlockingScript: '51' } }], ['script-length-mismatch', 10, { 0: { unlockingScript: '5151' } }]] as const) {
        const prepare = await prepared(`${id}-prepare`, index)
        await dependent(id, 'signAction', prepare, reference => ({ reference, spends, options: { acceptDelayedBroadcast: false } }))
        await dependent(`${id}-abort`, 'abortAction', prepare, reference => ({ reference }))
      }
      await call('txid-only-create', 'createAction', create('txid-only-create', [input(11)], { returnTXIDOnly: true, randomizeOutputs: false }))
      const txidOnly = await prepared('txid-only-prepare', 12)
      await dependent('txid-only-sign', 'signAction', txidOnly, reference => ({ reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false, returnTXIDOnly: true } }))
      await cleanup(await call('truncated-proof', 'createAction', create('truncated-proof', [input(13)], {}, { inputBEEF: fanout.result.tx.slice(0, 7) })))
      const unknown = new Beef(); unknown.mergeTxidOnly('a7'.repeat(32))
      await cleanup(await call('unknown-without-trust', 'createAction', create('unknown-without-trust', [{ ...input(14), outpoint: `${'a7'.repeat(32)}.0` }], {}, { inputBEEF: unknown.toBinary() })))
      await call('source-after', 'listOutputs', { basket: c.basket, include: 'locking scripts', includeTags: true, limit: 100 })
      await call('actions-after', 'listActions', { labels: [c.label], includeInputs: true, includeInputUnlockingScripts: true, includeOutputs: true, includeOutputLockingScripts: true, limit: 100 })
    }
  } finally {
    report.submissionEnd = services.submissions.length
    report.submissions = services.submissions.slice(report.submissionStart, report.submissionEnd).map((r, i) => ({ index: report.submissionStart + i, txid: r.txid, serializedHex: Buffer.from(r.bytes).toString('hex'), verdict: r.verdict }))
    report.storageTransactions = await services.nativeTransactions()
    report.assertions = await deriveTransactionStateOutcomes(report)
    report.result = report.assertions.some(r => r.result === 'FAIL') ? 'FAIL' : report.assertions.some(r => r.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
    evidence.addJson('conformance/transaction-states.json', report)
  }
  return report
}
