import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PrivateKey } from '@bsv/sdk'
import { conditionalPolicy, conditionalPolicySha256, type ConditionalReport } from '../src/wallet-lab/native/conformance-conditional-model.js'
import { deriveConditionalOutcomes, verifyNativeConditionalConformance } from '../src/wallet-lab/native/verify-conformance-conditional.js'

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
