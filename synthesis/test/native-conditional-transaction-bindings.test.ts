import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Beef, Transaction, UnlockingScript } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { conditionalConfig as config, conditionalPolicy, conditionalPolicySha256, type ConditionalReport } from '../src/wallet-lab/native/conformance-conditional-model.js'
import { deriveConditionalOutcomes } from '../src/wallet-lab/native/verify-conformance-conditional.js'
import { verifyConditionalTransactionBindings, verifyObservedNativeTransactionBindings } from '../src/wallet-lab/native/verify-conditional-transaction-bindings.js'

const root = path.resolve(import.meta.dirname, '../..')
const archive = path.join(root, 'journals/integrated-native-attempts/2026-11-09/42680240116/native-integrated.zip')
expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe('264ba858b5618574c3aea189425d22c5cbb47c91a1ae361b618609cc17d38e49')
const bytes = (name: string) => execFileSync('unzip', ['-p', archive, `repetition-1/evidence/${name}`], { maxBuffer: 16 * 1024 * 1024 })
const read = (name: string) => JSON.parse(bytes(name).toString())
const portability = read('conformance/portability.json'), reserves = read('conformance/funding-reserves.json')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const funding = Transaction.fromAtomicBEEF([...bytes('funding.atomicbeef')])
const native = { txid: portability.task.txid, tx: [...Buffer.from(portability.task.beefHex, 'hex')] }
const storageTransactions = new Map<string, Transaction>(read('native-transactions.json').map((row: any) => [row.txid, Transaction.fromHex(row.rawTxHex)]))
const binding = { storageTransactions, fixture, declaredNativePayments: [`${funding.id('hex')}.0`, ...reserves.payments.map((row: any) => row.outpoint)] }

// A deliberately incomplete conditional corpus is not a native qualification.
// Real archived transaction bytes isolate the parent proof/FAIL distinction.
async function observation(results: any[]): Promise<ConditionalReport> {
  const trace = results.map((result, index) => ({ id: `population-${index}`, method: 'createAction', args: {
    description: `TPNIL conditional action ${index}`, outputs: [{ satoshis: config.satoshis, lockingScript: config.lockingScript, outputDescription: `TPNIL conditional output ${index}`, basket: config.basket, tags: ['shared', index % 2 ? 'odd' : 'even', `row${index}`], customInstructions: `conditional:${index}` }], labels: [config.label, index % 2 ? 'tpnil conditional odd' : 'tpnil conditional even'], ...(index ? { options: { randomizeOutputs: false, acceptDelayedBroadcast: false } } : {})
  }, result, submissionStart: 0, submissionEnd: 0 }))
  const seen = new Set(), transactions: any[] = []
  for (const row of trace) if (row.result?.txid && Array.isArray(row.result.tx) && !seen.has(row.result.txid)) { seen.add(row.result.txid); transactions.push({ role: `conditional/${row.id}`, txid: row.result.txid, atomicBeef: row.result.tx }) }
  const report: ConditionalReport = { schema: 'tpnil-native-conditional@1.0.0', oracle: 'tpnil-native-conditional-oracle@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', policySha256: conditionalPolicySha256, identity: portability.identity, trace, certificates: [], issuer: {}, errors: [], transactions, submissions: [], assertions: [], remainingCoverage: structuredClone(conditionalPolicy.remainingCoverage), completeBRC100Conformance: false, result: 'FAIL' }
  report.assertions = await deriveConditionalOutcomes(report)
  return report
}

describe('prospective malformed native response admission', () => {
  it('admits independently bound real bytes while retaining an unrelated incomplete-corpus FAIL', async () => {
    const result = await verifyConditionalTransactionBindings(await observation([native]), binding)
    expect(result.transactions).toEqual([{ role: 'conditional/population-0', txid: native.txid }])
    expect(result.invalidNativeResponses).toEqual([])
    expect(result.allReturnedTransactionsProven).toBe(true)
  })
  it('retains malformed bytes only as a mapped native FAIL and rejects fabricated PASS outcomes', async () => {
    for (const returned of [{ txid: native.txid, tx: [1, 2, 3] }, { txid: native.txid }, { txid: 3, tx: native.tx }, { txid: native.txid, tx: [...native.tx, 0] }]) {
      const report = await observation([returned]), result = await verifyConditionalTransactionBindings(report, binding)
      expect(result.transactions).toEqual([]); expect(result.allReturnedTransactionsProven).toBe(false)
      expect(result.invalidNativeResponses[0]).toMatchObject({ callId: 'population-0', predicateId: 'fixture.population', kind: 'MALFORMED_RETURN' })
      report.assertions.find(row => row.id === 'fixture.population')!.result = 'PASS'
      await expect(verifyConditionalTransactionBindings(report, binding)).rejects.toThrow()
    }
  })
  it('does not reinterpret additional query response fields as a create/sign transaction contract', async () => {
    const report = await observation([])
    report.trace.push({ id: 'outputs-default', method: 'listOutputs', args: { basket: config.basket }, result: { outputs: [], totalOutputs: 0, txid: 'additional metadata', tx: [1, 2, 3] }, submissionStart: 0, submissionEnd: 0 })
    report.assertions = await deriveConditionalOutcomes(report)
    const result = await verifyConditionalTransactionBindings(report, binding)
    expect(result.scope).toBe('createAction/signAction top-level transaction responses')
    expect(result.transactions).toEqual([]); expect(result.invalidNativeResponses).toEqual([])
  })
  it('does not let another failed child waive storage or declared-funding provenance', async () => {
    const report = await observation([native])
    await expect(verifyConditionalTransactionBindings(report, { ...binding, storageTransactions: new Map() })).rejects.toThrow('storage bytes absent')
    await expect(verifyConditionalTransactionBindings(report, { ...binding, storageTransactions: new Map([[native.txid, funding]]) })).rejects.toThrow()
    await expect(verifyConditionalTransactionBindings(report, { ...binding, declaredNativePayments: [] })).rejects.toThrow('outside independently declared')
    await expect(verifyConditionalTransactionBindings(await observation([{ txid: funding.id('hex'), tx: funding.toAtomicBEEF() }]), binding)).rejects.toThrow('outside independently declared')
  })
  it('does not let malformed metadata or trailing bytes hide a recoverable unbound transaction', async () => {
    const counterexamples = [
      { name: 'wrong claimed txid with absent storage', returned: { ...native, txid: '00'.repeat(32) }, binding: { ...binding, storageTransactions: new Map() } },
      { name: 'non-string claimed txid with absent storage', returned: { ...native, txid: 3 }, binding: { ...binding, storageTransactions: new Map() } },
      { name: 'trailing bytes with absent storage', returned: { ...native, tx: [...native.tx, 0] }, binding: { ...binding, storageTransactions: new Map() } },
      { name: 'invalid trailing byte with absent storage', returned: { ...native, tx: [...native.tx, 256] }, binding: { ...binding, storageTransactions: new Map() } },
      { name: 'wrong claimed txid with missing funding roots', returned: { ...native, txid: '00'.repeat(32) }, binding: { ...binding, declaredNativePayments: [] } },
      { name: 'foreign faucet transaction with native claimed txid', returned: { txid: native.txid, tx: funding.toAtomicBEEF() }, binding }
    ]
    const admitted: string[] = []
    for (const example of counterexamples) {
      try { await verifyConditionalTransactionBindings(await observation([example.returned]), example.binding); admitted.push(example.name) } catch { /* Each recoverable transaction must still satisfy independent provenance. */ }
    }
    expect(admitted).toEqual([])
  })
  it('records invalid signatures and duplicate create responses without claiming a second valid proof', async () => {
    const tx = Transaction.fromAtomicBEEF(native.tx)
    const changed = new Transaction(tx.version, tx.inputs.map((input, index) => ({ ...input, ...(index === 0 ? { unlockingScript: UnlockingScript.fromHex('00') } : {}) })), tx.outputs, tx.lockTime)
    const mutated = { txid: changed.id('hex'), tx: changed.toAtomicBEEF() }, storage = new Map(storageTransactions)
    storage.set(mutated.txid, Transaction.fromHex(changed.toHex()))
    const invalid = await verifyConditionalTransactionBindings(await observation([mutated]), { ...binding, storageTransactions: storage })
    expect(invalid.invalidNativeResponses[0]?.kind).toBe('INVALID_SIGNATURE'); expect(invalid.transactions).toEqual([])
    const duplicate = await verifyConditionalTransactionBindings(await observation([native, native]), binding)
    expect(duplicate.transactions).toHaveLength(1)
    expect(duplicate.invalidNativeResponses[0]).toMatchObject({ callId: 'population-1', kind: 'DUPLICATE_CREATE_RESPONSE' })
  })
})


describe('shared native TXID-only admission', () => {
  const call = () => ({ id: 'txid-only-sign', method: 'signAction', args: { options: { returnTXIDOnly: true } }, result: { txid: native.txid } })
  const assertions = [{ id: 'returnTXIDOnly', result: 'PASS' }]
  const options = () => ({ rolePrefix: 'transaction-states', predicateFor: () => 'returnTXIDOnly', isTxidOnly: (row: any) => row.id === 'txid-only-sign', resolvedTransactions: new Map([[native.txid, Transaction.fromAtomicBEEF(native.tx)]]) })
  it('proves an explicitly requested TXID-only result from independent native storage and mined ancestry', async () => {
    const result = await verifyObservedNativeTransactionBindings([call()], assertions, binding, options())
    expect(result.transactions).toEqual([{ role: 'transaction-states/txid-only-sign', txid: native.txid }])
    expect(result.allReturnedTransactionsProven).toBe(true)
  })
  it('rejects missing, foreign, and mismatched independent graph or storage evidence even with a child FAIL', async () => {
    const failed = [{ id: 'returnTXIDOnly', result: 'FAIL' }]
    await expect(verifyObservedNativeTransactionBindings([call()], failed, binding, { ...options(), resolvedTransactions: new Map() })).rejects.toThrow('no independent native ancestry graph')
    await expect(verifyObservedNativeTransactionBindings([call()], failed, binding, { ...options(), resolvedTransactions: new Map([[native.txid, funding]]) })).rejects.toThrow()
    await expect(verifyObservedNativeTransactionBindings([call()], failed, { ...binding, storageTransactions: new Map() }, options())).rejects.toThrow('storage bytes absent')
    await expect(verifyObservedNativeTransactionBindings([call()], failed, { ...binding, declaredNativePayments: [] }, options())).rejects.toThrow('outside independently declared')
  })
  it('requires a mapped FAIL for unexpected omission after independently binding its transaction', async () => {
    const altered = call(); altered.args.options.returnTXIDOnly = false
    await expect(verifyObservedNativeTransactionBindings([altered], assertions, binding, options())).rejects.toThrow('lacks its independently recomputed')
    const result = await verifyObservedNativeTransactionBindings([altered], [{ id: 'returnTXIDOnly', result: 'FAIL' }], binding, options())
    expect(result.invalidNativeResponses[0]?.kind).toBe('MALFORMED_RETURN')
    await expect(verifyObservedNativeTransactionBindings([altered], [{ id: 'returnTXIDOnly', result: 'FAIL' }], { ...binding, storageTransactions: new Map() }, options())).rejects.toThrow('storage bytes absent')
  })
})

describe('prospective independent ownership of incomplete public proof', () => {
  const incomplete = new Beef()
  const target = Transaction.fromAtomicBEEF(native.tx)
  for (const input of target.inputs) incomplete.mergeTxidOnly(input.sourceTXID!)
  incomplete.mergeRawTx(target.toBinary())
  const call = { id: 'incomplete-proof', method: 'createAction', args: {}, result: { txid: native.txid, tx: incomplete.toBinaryAtomic(native.txid) } }
  const options = { rolePrefix: 'transaction-states', predicateFor: () => 'input-absent-from-beef', ownershipFromIndependentGraph: true, resolvedTransactions: new Map([[native.txid, target]]) }
  const failed = [{ id: 'input-absent-from-beef', result: 'FAIL' }]
  it('binds the exact body to independent owned ancestry while retaining invalid public proof', async () => {
    const observed = await verifyObservedNativeTransactionBindings([call], failed, binding, options)
    expect(observed.transactions).toEqual([])
    expect(observed.invalidNativeResponses).toMatchObject([{ predicateId: 'input-absent-from-beef', kind: 'INVALID_PROOF' }])
    expect(observed.allReturnedTransactionsProven).toBe(false)
    await expect(verifyObservedNativeTransactionBindings([call], failed, binding, { ...options, ownershipFromIndependentGraph: false })).rejects.toThrow('outside independently declared')
  })
  it('requires exact independent storage, rooted graph and ownership even for a failed response', async () => {
    await expect(verifyObservedNativeTransactionBindings([call], failed, binding, { ...options, resolvedTransactions: new Map() })).rejects.toThrow('independent ownership ancestry')
    await expect(verifyObservedNativeTransactionBindings([call], failed, binding, { ...options, resolvedTransactions: new Map([[native.txid, funding]]) })).rejects.toThrow()
    await expect(verifyObservedNativeTransactionBindings([call], failed, binding, { ...options, resolvedTransactions: new Map([[native.txid, Transaction.fromHex(target.toHex())]]) })).rejects.toThrow()
    await expect(verifyObservedNativeTransactionBindings([call], failed, { ...binding, storageTransactions: new Map() }, options)).rejects.toThrow('storage bytes absent')
    await expect(verifyObservedNativeTransactionBindings([call], failed, { ...binding, declaredNativePayments: [] }, options)).rejects.toThrow('outside independently declared')
    await expect(verifyObservedNativeTransactionBindings([call], [{ id: 'input-absent-from-beef', result: 'PASS' }], binding, options)).rejects.toThrow('lacks its independently recomputed')
  })
})
