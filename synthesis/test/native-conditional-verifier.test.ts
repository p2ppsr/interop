import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { LockingScript, PrivateKey, Transaction, UnlockingScript } from '@bsv/sdk'
import { conditionalPolicy, conditionalPolicySha256, conditionalPolicySelection, conditionalConfig, type ConditionalReport } from '../src/wallet-lab/native/conformance-conditional-model.js'
import { deriveConditionalOutcomes, verifyNativeConditionalConformance } from '../src/wallet-lab/native/verify-conformance-conditional.js'
import { runNativeConditionalConformance } from '../src/wallet-lab/native/conformance-conditional.js'
import { canonicalJson } from '../src/determinism.js'

function incomplete(): ConditionalReport {
  return { schema: 'tpnil-native-conditional@1.0.0', oracle: 'tpnil-native-conditional-oracle@1.0.0', claim: 'ENGINEERING_OBSERVATION_ONLY', policySha256: conditionalPolicySha256, identity: PrivateKey.fromHex('68'.repeat(32)).toPublicKey().toString(), trace: [], certificates: [], issuer: {}, errors: [], transactions: [], submissions: [], assertions: [], remainingCoverage: structuredClone(conditionalPolicy.remainingCoverage), completeBRC100Conformance: false, result: 'FAIL' }
}

describe('native conditional independent verifier', () => {
  it('records failed setup separately from blocked dependents and refuses omitted coverage or fabricated verdicts', async () => {
    const report = incomplete()
    report.assertions = await deriveConditionalOutcomes(report)
    const result = await verifyNativeConditionalConformance(report)
    expect(result.assertionCount).toBe(conditionalPolicy.assertionIds.length)
    expect(result.assertions.find(row => row.id === 'fixture.population')?.result).toBe('FAIL')
    expect(result.assertions.find(row => row.id === 'fixture.call-inventory')?.result).toBe('FAIL')
    expect(result.assertions.find(row => row.id === 'transaction.defaults')?.result).toBe('BLOCKED')
    expect(result.assertions.find(row => row.id === 'coverage.remaining-obligations')?.result).toBe('BLOCKED')
    const mutations: Array<(r: any) => void> = [
      r => { r.assertions = [] },
      r => { r.assertions[0].result = 'PASS' },
      r => { r.result = 'PASS' },
      r => { r.completeBRC100Conformance = true },
      r => { r.remainingCoverage = [] },
      r => { r.policySha256 = '00'.repeat(32) },
      r => { r.transactions.push({ role: 'fabricated', txid: '00'.repeat(32), atomicBeef: [1] }) }
    ]
    for (const mutate of mutations) { const forged = structuredClone(report); mutate(forged); await expect(verifyNativeConditionalConformance(forged)).rejects.toThrow() }
  })
  it('rejects duplicate calls and request substitution even when the empty response looks plausible', async () => {
    const report = incomplete()
    const call = { id: 'outputs-default', method: 'listOutputs', args: { basket: 'different basket' }, result: { outputs: [], totalOutputs: 0 }, submissionStart: 0, submissionEnd: 0 }
    report.trace = [call]
    const outcomes = await deriveConditionalOutcomes(report)
    expect(outcomes.find(row => row.id === 'fixture.call-inventory')?.result).toBe('FAIL')
    report.trace = [call, call]
    await expect(deriveConditionalOutcomes(report)).rejects.toThrow('Duplicate native conditional call')
  })
})

// Real TypeScript reference observations are retained unchanged. Every mutation
// below is LAB_SELF_TEST_ONLY and is never appended to qualification evidence.
const referenceDirectory = path.resolve(import.meta.dirname, '../../fixtures/native-conditional/reference-20261111')
const reference = (): ConditionalReport => JSON.parse(fs.readFileSync(path.join(referenceDirectory, 'report.json'), 'utf8'))
const call = (report: ConditionalReport, id: string) => { const row = report.trace.find(row => row.id === id); expect(row, id).toBeDefined(); return row! }
let referenceOutcomes: ConditionalReport['assertions']
beforeAll(async () => { referenceOutcomes = await deriveConditionalOutcomes(reference()) })

it('retains identical failure details across canonical evidence serialization', async () => {
  const report = reference(), row = report.trace.find(call => call.id === 'outputs-newest')!
  delete row.result
  row.error = { name: 'Error', message: 'retained native request failure', code: 'FIXTURE_ERROR' }
  const before = await deriveConditionalOutcomes(report)
  const restored = JSON.parse(canonicalJson(report))
  expect(await deriveConditionalOutcomes(restored)).toEqual(before)
})

describe('conditional verifier adversarial replay of retained public TS fixture', () => {
  it('pins every original fixture byte and preserves the original 69/14/1 source-stage report', async () => {
    const provenance = JSON.parse(fs.readFileSync(path.join(referenceDirectory, 'provenance.json'), 'utf8'))
    expect(provenance.claim).toBe('LAB_SELF_TEST_ONLY_REAL_TYPESCRIPT_REFERENCE_NOT_NATIVE_QUALIFICATION')
    for (const [name, expected] of Object.entries(provenance.files)) expect(createHash('sha256').update(fs.readFileSync(path.join(referenceDirectory, name))).digest('hex')).toBe(expected)
    expect(createHash('sha256').update(fs.readFileSync(path.join(referenceDirectory, 'report.json'))).digest('hex')).toBe('52da9f7ad24c7648b21cde0a585a98c8f2b80e0431defd5b13ad3522cb35a102')
    const original = reference()
    expect(Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(result => [result, original.assertions.filter(row => row.result === result).length]))).toEqual({ PASS: 69, FAIL: 14, BLOCKED: 1 })
    expect(referenceOutcomes.map(({ id, result }) => ({ id, result }))).toEqual(original.assertions.map(({ id, result }) => ({ id, result })))
    expect(original.trace).toHaveLength(123)
  })

  const mutations: Array<[string, string, (report: ConditionalReport) => void]> = [
    ['duplicate default output', 'query.outputs-default', r => { const outputs = call(r, 'outputs-default').result.outputs; outputs[1] = structuredClone(outputs[0]) }],
    ['duplicate default action', 'query.actions-default', r => { const actions = call(r, 'actions-default').result.actions; actions[1] = structuredClone(actions[0]) }],
    ['duplicate included output index', 'query.actions-includes', r => { const action = call(r, 'actions-includes').result.actions.find((a: any) => a.outputs.length > 1); expect(action).toBeDefined(); action.outputs[1] = structuredClone(action.outputs[0]) }],
    ['wrong filtered output total', 'query.outputs-filter', r => { call(r, 'outputs-any').result.totalOutputs = 12345 }],
    ['wrong filtered action total', 'query.actions-filter', r => { call(r, 'actions-any').result.totalActions = 12345 }],
    ['ciphertext unusable by intended verifier', 'certificate.verifier-separation', r => { call(r, 'certificate-proof').result.keyringForVerifier.name = 'AAAA' }],
    ['proof requested for wrong verifier', 'certificate.verifier-separation', r => { call(r, 'certificate-proof').args.verifier = r.identity }],
    ['held payment amount substituted', 'transaction.batch-release', r => { call(r, 'batch-held').args.outputs[0].satoshis = 999 }],
    ['held transaction identifier substituted', 'transaction.batch-release', r => { call(r, 'batch-held').result.txid = 'ab'.repeat(32) }],
    ['held transaction trailing bytes', 'transaction.batch-release', r => { call(r, 'batch-held').result.tx.push(0) }],
    ['abort prepared with wrong source', 'transaction.abort-release', r => { call(r, 'abort-prepare').args.inputs[0].outpoint = call(r, 'signable').args.inputs[0].outpoint }],
    ['abort reference substituted', 'transaction.abort-release', r => { call(r, 'aborted').args.reference = 'substituted' }],
    ['abort unsigned transaction malformed', 'transaction.abort-release', r => { call(r, 'abort-prepare').result.signableTransaction.tx = [1] }],
    ['empty accepted certificate control', 'certificate.bad-keyring', r => { call(r, 'certificate-negative-control').result = {} }],
    ['listed certificate signature corrupted', 'certificate.default-pagination', r => { call(r, 'certificates-page1').result.certificates[0].signature = '00' }],
    ['duplicate listed certificate', 'certificate.default-pagination', r => { const list = call(r, 'certificates-default').result.certificates; list[1] = structuredClone(list[0]) }],
    ['stored issued certificate corrupted', 'certificate.issuance', r => { call(r, 'issuance-inventory').result.certificates[0].signature = '00' }],
    ['issued positive response missing', 'certificate.issuance-bad-signature', r => { call(r, 'issuance-valid').result = {} }],
    ['duplicate funded population', 'fixture.population', r => { call(r, 'population-1').result = structuredClone(call(r, 'population-0').result) }],
    ['malformed funded population bytes', 'fixture.population', r => { call(r, 'population-1').result.tx = [1] }]
  ]
  for (const [name, target, mutate] of mutations) it(`rejects ${name} independently`, async () => {
    expect(referenceOutcomes.find(row => row.id === target)?.result, `${target} requires a valid original control`).toBe('PASS')
    const forged = reference(); mutate(forged)
    const outcome = (await deriveConditionalOutcomes(forged)).find(row => row.id === target)
    expect(outcome?.result, outcome?.detail).toBe('FAIL')
  })

  it('ignores transaction-shaped extra fields on methods without a transaction-return contract', async () => {
    const report = reference(), transaction = report.transactions[0]!
    Object.assign(call(report, 'outputs-default').result, { txid: 'ab'.repeat(32), tx: transaction.atomicBeef })
    report.assertions = await deriveConditionalOutcomes(report)
    const result = await verifyNativeConditionalConformance(report)
    expect(result.counts).toEqual({ PASS: 69, FAIL: 14, BLOCKED: 1 })
  })
})


// LAB_SELF_TEST_ONLY: retained reference bytes are never edited. These controls
// independently construct real script-valid spends of the third populated output.
function signingPair(report: ConditionalReport, index: number) {
  const funding = call(report, `population-${index}`).result, source = Transaction.fromAtomicBEEF(funding.tx)
  const sourceOutputIndex = source.outputs.findIndex(output => output.satoshis === conditionalConfig.satoshis && output.lockingScript.toHex() === conditionalConfig.lockingScript)
  expect(sourceOutputIndex).toBeGreaterThanOrEqual(0)
  const tx = new Transaction(); tx.addInput({ sourceTransaction: source, sourceOutputIndex, unlockingScript: UnlockingScript.fromHex('') }); tx.addOutput({ satoshis: 1, lockingScript: LockingScript.fromHex('51') })
  const prepared = tx.toAtomicBEEF(); tx.inputs[0]!.unlockingScript = UnlockingScript.fromHex('51')
  return { source, sourceOutputIndex, outpoint: `${funding.txid}.${sourceOutputIndex}`, prepared, signed: { txid: tx.id('hex'), tx: tx.toAtomicBEEF() } }
}
function prospectiveReference(): ConditionalReport {
  const report = reference(), selected = conditionalPolicySelection(2), pair = signingPair(report, 2)
  report.oracle = selected.oracle; report.policySha256 = selected.policySha256
  report.actionReferences = call(report, 'actions-includes').result.actions.map((action: any) => ({ txid: action.txid, reference: Buffer.from(action.labels.find((label: string) => label.startsWith('reference ')).slice(10), 'hex').toString('base64') })) // LAB_SELF_TEST_ONLY metadata: parent tests bind the real storage ledger separately.
  const prepared = call(report, 'signable'); delete prepared.error
  prepared.args.inputBEEF = call(report, 'population-2').result.tx; prepared.args.inputs[0].outpoint = pair.outpoint
  prepared.result = { signableTransaction: { reference: 'LAB_SELF_TEST_ONLY_independent_signing', tx: pair.prepared } }
  report.trace.splice(report.trace.indexOf(prepared) + 1, 0, { id: 'signed', method: 'signAction', args: { reference: prepared.result.signableTransaction.reference, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } }, result: pair.signed, submissionStart: prepared.submissionEnd, submissionEnd: prepared.submissionEnd })
  call(report, 'after-abort').result.outputs = call(report, 'after-abort').result.outputs.filter((output: any) => output.outpoint !== pair.outpoint)
  report.transactions = []; const seen = new Set<string>()
  for (const row of report.trace) if (['createAction', 'signAction'].includes(row.method) && row.result?.txid && Array.isArray(row.result.tx) && !seen.has(row.result.txid)) { seen.add(row.result.txid); report.transactions.push({ role: `conditional/${row.id}`, txid: row.result.txid, atomicBeef: row.result.tx }) }
  return report
}

describe('conditional policy2 independent signing fixtures and complete associated labels', () => {
  it('preserves policy1 bytes/default and keeps the exact84 assertion identities', () => {
    const legacy = conditionalPolicySelection(), next = conditionalPolicySelection(2)
    expect(legacy.policySha256).toBe('b04fb45c945824e21b57ebfb77ff39ae2d93a0047953d9a05942a24455c6c7aa')
    expect(legacy.policy).toEqual(conditionalPolicy); expect(next.policy.assertionIds).toEqual(legacy.policy.assertionIds)
    expect(() => conditionalPolicySelection(3 as any)).toThrow()
  })
  it('independently verifies the population2 signed spend despite the retained population0 known-proof error', async () => {
    const report = prospectiveReference(), outcomes = await deriveConditionalOutcomes(report)
    expect(call(report, 'known-proof-omission').error.message).toContain('sourceTransaction')
    for (const id of ['transaction.signable-and-sign', 'transaction.abort-release']) expect(outcomes.find(row => row.id === id)?.result).toBe('PASS')
    expect(outcomes.find(row => row.id === 'transaction.known-proof-omission')?.result).toBe('FAIL')
    report.assertions = outcomes; expect((await verifyNativeConditionalConformance(report)).assertionCount).toBe(84)
  })
  it.each([
    ['reused known-proof source', 'transaction.signable-and-sign', (r: ConditionalReport) => { call(r, 'signable').args.inputs[0].outpoint = call(r, 'known-proof-omission').args.inputs[0].outpoint }],
    ['wrong returned signing source', 'transaction.signable-and-sign', (r: ConditionalReport) => { call(r, 'signable').result.signableTransaction.tx = signingPair(r, 0).prepared }],
    ['missing signed result', 'transaction.abort-release', (r: ConditionalReport) => { delete call(r, 'signed').result }],
    ['signed output still spendable', 'transaction.abort-release', (r: ConditionalReport) => { call(r, 'after-abort').result.outputs.push({ outpoint: signingPair(r, 2).outpoint, spendable: true }) }],
    ['aborted output not released', 'transaction.abort-release', (r: ConditionalReport) => { const outpoint = signingPair(r, 1).outpoint; call(r, 'after-abort').result.outputs.find((o: any) => o.outpoint === outpoint).spendable = false }]
  ] as const)('rejects %s', async (_name, id, mutate) => {
    const report = prospectiveReference(); mutate(report)
    const result = (await deriveConditionalOutcomes(report)).find(row => row.id === id)
    expect(result?.result, result?.detail).toBe('FAIL')
  })
  const withAssociatedLabels = () => {
    const report = prospectiveReference()
    for (const output of call(report, 'outputs-metadata').result.outputs) {
      const action = call(report, 'actions-includes').result.actions.find((a: any) => output.outpoint.startsWith(`${a.txid}.`))
      const extra = ['admin month2026-11', 'admin originator todo.itcve.test']
      action.labels.push(...extra); output.labels = action.labels.filter((label: string) => !label.startsWith('reference '))
    }
    for (const output of call(report, 'outputs-only-includeLabels').result.outputs) output.labels = call(report, 'actions-includes').result.actions.find((a: any) => output.outpoint.startsWith(`${a.txid}.`)).labels.filter((label: string) => !label.startsWith('reference '))
    return report
  }
  it('accepts all matching associated labels and never discards administration labels', async () => {
    const report = withAssociatedLabels(), outcomes = await deriveConditionalOutcomes(report)
    for (const id of ['query.outputs-includes', 'query.outputs-only-includeLabels']) { const outcome = outcomes.find(row => row.id === id); expect(outcome?.result, outcome?.detail).toBe('PASS') }
    report.oracle = conditionalPolicy.oracle; report.policySha256 = conditionalPolicySha256
    expect((await deriveConditionalOutcomes(report)).find(row => row.id === 'query.outputs-includes')?.result).toBe('FAIL')
  })
  it.each([
    ['one-sided extra label', (r: ConditionalReport) => { call(r, 'outputs-metadata').result.outputs[0].labels.push('unbound extra') }],
    ['one-sided missing administrative label', (r: ConditionalReport) => { call(r, 'outputs-metadata').result.outputs[0].labels.pop() }],
    ['duplicate output label', (r: ConditionalReport) => { const labels = call(r, 'outputs-metadata').result.outputs[0].labels; labels.push(labels[0]) }],
    ['duplicate action label', (r: ConditionalReport) => { const labels = call(r, 'actions-includes').result.actions[0].labels; labels.push(labels[0]) }],
    ['missing requested label from both APIs', (r: ConditionalReport) => { for (const o of call(r, 'outputs-metadata').result.outputs) o.labels = o.labels.filter((l: string) => l !== conditionalConfig.label); for (const a of call(r, 'actions-includes').result.actions) a.labels = a.labels.filter((l: string) => l !== conditionalConfig.label) }],
    ['substituted transaction identity', (r: ConditionalReport) => { call(r, 'actions-includes').result.actions[0].txid = 'ab'.repeat(32) }],
    ['wrong synthetic reference', (r: ConditionalReport) => { const labels = call(r, 'actions-includes').result.actions[0].labels; labels[labels.findIndex((label: string) => label.startsWith('reference '))] = 'reference abcd' }],
    ['duplicate synthetic reference', (r: ConditionalReport) => { call(r, 'actions-includes').result.actions[0].labels.push('reference abcd') }],
    ['synthetic reference leaked to output', (r: ConditionalReport) => { call(r, 'outputs-metadata').result.outputs[0].labels.push('reference abcd') }],
    ['missing independent stored reference', (r: ConditionalReport) => { r.actionReferences!.pop() }],
    ['noncanonical stored base64', (r: ConditionalReport) => { r.actionReferences![0]!.reference += ' ' }],
    ['duplicate stored references', (r: ConditionalReport) => { r.actionReferences![1]!.reference = r.actionReferences![0]!.reference }],
    ['non-label custom instruction corruption', (r: ConditionalReport) => { call(r, 'outputs-metadata').result.outputs[0].customInstructions = 'wrong' }],
    ['non-label tag corruption', (r: ConditionalReport) => { call(r, 'outputs-metadata').result.outputs[0].tags.push('wrong') }],
    ['non-label script corruption', (r: ConditionalReport) => { call(r, 'outputs-metadata').result.outputs[0].lockingScript = '00' }]
  ] as const)('rejects associated-label or unchanged-byte mutation: %s', async (_name, mutate) => {
    const report = withAssociatedLabels(); mutate(report)
    expect((await deriveConditionalOutcomes(report)).find(row => row.id === 'query.outputs-includes')?.result).toBe('FAIL')
  })
  it.each([
    ['one-sided extra', (r: ConditionalReport) => { call(r, 'outputs-only-includeLabels').result.outputs[0].labels.push('unbound label') }],
    ['one-sided missing', (r: ConditionalReport) => { call(r, 'outputs-only-includeLabels').result.outputs[0].labels.pop() }],
    ['duplicate', (r: ConditionalReport) => { const labels = call(r, 'outputs-only-includeLabels').result.outputs[0].labels; labels.push(labels[0]) }],
    ['missing independent action', (r: ConditionalReport) => { call(r, 'actions-includes').result.actions.pop() }]
  ] as const)('binds every labels-only return against complete independent action labels: %s', async (_name, mutate) => {
    const report = withAssociatedLabels(); mutate(report)
    const result = (await deriveConditionalOutcomes(report)).find(row => row.id === 'query.outputs-only-includeLabels')
    expect(result?.result, result?.detail).toBe('FAIL')
  })
  it('runs the actual producer beyond known-proof failure with independent signing and abort inputs', async () => {
    const source = reference(), pair = signingPair(source, 2), abort = signingPair(source, 1)
    let released = false
    const wallet: any = new Proxy({}, { get: (_target, method: string) => async (args: any) => {
      if (method === 'createAction') {
        const match = /^TPNIL conditional action (\d+)$/.exec(args.description)
        if (match) return structuredClone(call(source, `population-${match[1]}`).result)
        if (args.options?.trustSelf === 'known') throw new Error('Every signableTransaction input must have a sourceTransaction')
        if (args.inputs?.[0]?.outpoint === pair.outpoint) return { signableTransaction: { reference: 'LAB_SELF_TEST_ONLY_sign', tx: pair.prepared } }
        if (args.inputs?.[0]?.outpoint === abort.outpoint) return { signableTransaction: { reference: 'LAB_SELF_TEST_ONLY_abort', tx: abort.prepared } }
        throw new Error('LAB_SELF_TEST_ONLY unsupported unrelated request')
      }
      if (method === 'signAction') return pair.signed
      if (method === 'abortAction') { released = true; return { aborted: true } }
      if (method === 'listOutputs' && released) return { outputs: [{ outpoint: abort.outpoint, spendable: true }], totalOutputs: 1 }
      return {}
    } })
    const report = await runNativeConditionalConformance({ wallet, fixtureRevision: 2, services: { submissions: [], registerControlledRoute: () => () => {}, nativeActionReferences: async () => prospectiveReference().actionReferences } as any, evidence: { addJson: () => {} } as any, boundaryReport: { trace: [{ method: 'getPublicKey', args: { identityKey: true }, result: { publicKey: source.identity } }] } })
    expect(report.oracle).toBe('tpnil-native-conditional-oracle@2.0.0')
    expect(call(report, 'known-proof-omission').error.message).toContain('sourceTransaction')
    expect(call(report, 'signable').args.inputs[0].outpoint).toBe(pair.outpoint)
    expect(call(report, 'abort-prepare').args.inputs[0].outpoint).toBe(abort.outpoint)
    expect(report.assertions.find(row => row.id === 'transaction.signable-and-sign')?.result).toBe('PASS')
    expect(report.assertions.find(row => row.id === 'transaction.abort-release')?.result).toBe('PASS')
  })
})
