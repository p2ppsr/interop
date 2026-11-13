// Exact retained native6 bytes are used only as a prospective local funding
// control. The original failed native run and its qualification remain unchanged.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Beef, MerklePath, Transaction, Utils } from '@bsv/sdk'
import { test } from 'vitest'
import { deriveTransactionCoveragePaymentRoots } from '../src/wallet-lab/native/coverage-completion/funding-roots.js'
import { getTransactionCoveragePolicy } from '../src/wallet-lab/native/coverage-transactions-model.js'
const root = path.resolve(import.meta.dirname, '../..')
const zip = path.join(root, 'journals/integrated-native-attempts/2026-11-12/43216478235/native-integrated.zip')
assert.equal(createHash('sha256').update(fs.readFileSync(zip)).digest('hex'), '6701efea0672ddf069796dfd96b221ae21415fbc478871a97b8be0c9449aad23')
const names = ['conformance/coverage-transactions.json', 'native-transactions.json', 'native-submissions.json', 'funding.json', 'conformance/funding-reserves.json']
const retained = JSON.parse(execFileSync('python3', ['-c', 'import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:json.loads(z.read("repetition-1/evidence/"+n)) for n in sys.argv[2:]}))', zip, ...names], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
const mined = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8'))
function fixture() {
  const raw = structuredClone(retained), report = raw[names[0]!], current = getTransactionCoveragePolicy(3)
  assert.equal(report.oracle, 'tpnil-native-coverage-transactions-oracle@2.0.0')
  report.oracle = current.policy.oracle; report.schema = 'tpnil-native-coverage-transactions@3.0.0'; report.policySha256 = current.policySha256
  const storage = new Map<string, Transaction>(raw[names[1]!].map((r: any) => [r.txid, Transaction.fromHex(r.rawTxHex)]))
  const graph = new Map(storage), root = Transaction.fromAtomicBEEF([...Buffer.from(mined.atomicBeefHex, 'hex')]); graph.set(root.id('hex'), root)
  const hydrate = (id: string, seen = new Set<string>()): Transaction => {
    assert.ok(!seen.has(id) && seen.size < 32); if (id === root.id('hex')) return root
    const tx = graph.get(id); assert.ok(tx); tx.merklePath = undefined
    for (const input of tx.inputs) input.sourceTransaction = hydrate(input.sourceTXID!, new Set([...seen, id]))
    return tx
  }
  const incoming = report.trace.find((r: any) => r.id === 'incoming-fixture'); hydrate(incoming.result.txid)
  const roots = [`${raw[names[3]!].fundingTxid}.0`, ...raw[names[4]!].payments.map((r: any) => r.outpoint)]
  const binding: any = { profile: 'ITCVE-1@4.5.0', identity: report.identity, fixture: structuredClone(mined), storageTransactions: storage,
    resolvedTransactions: graph, declaredNativePayments: roots, globalSubmissions: raw[names[2]!], finalSubmissions: raw[names[2]!], readEvidence: () => { throw Error('Not used by this narrow root control') } }
  return { report, binding, incoming }
}
test('exact signed native6 incoming fixture admits only two1000 roots under prospective narrow review', async () => {
  const f = fixture(), v = await deriveTransactionCoveragePaymentRoots(f.report, f.binding)
  assert.equal(v.verified, true); assert.equal(v.fullModuleAdmission, false); assert.equal(v.actualPaymentSatoshis, 2000)
  assert.deepEqual(v.addedNativePayments, [f.incoming.result.txid + '.0', f.incoming.result.txid + '.1'])
  assert.equal(f.binding.declaredNativePayments.length, 3)
})
for (const kind of ['downgrade', 'foreign-identity', 'duplicate', 'wrong-actor', 'wrong-output-intent', 'wrong-remittance', 'failed-acceptance', 'missing-storage', 'wrong-mined-root', 'missing-ancestor', 'native-funder-input', 'no-receipt', 'getter-submission', 'prefix', 'fractional-window', 'trailing-beef', 'unmarked-bad-proof'] as const) test(`narrow roots reject ${kind}`, async () => {
  const f = fixture(), row = (id: string) => f.report.trace.find((v: any) => v.id === id)
  if (kind === 'downgrade') f.report.oracle = 'tpnil-native-coverage-transactions-oracle@2.0.0'
  if (kind === 'foreign-identity') f.report.identity = 'foreign'
  if (kind === 'duplicate') f.report.trace.push(structuredClone(f.incoming))
  if (kind === 'wrong-actor') f.incoming.actor = 'wallet'
  if (kind === 'wrong-output-intent') f.incoming.args.outputs[0].satoshis++
  if (kind === 'wrong-remittance') row('payment').args.outputs[0].paymentRemittance.senderIdentityKey = f.report.identity
  if (kind === 'failed-acceptance') row('payment').result.accepted = false
  if (kind === 'missing-storage') f.binding.storageTransactions.delete(f.incoming.result.txid)
  if (kind === 'wrong-mined-root') f.binding.fixture.merkleRoot = '00'.repeat(32)
  if (kind === 'missing-ancestor') { const id = Transaction.fromAtomicBEEF(f.incoming.result.tx).inputs[0]!.sourceTXID!; f.binding.resolvedTransactions.delete(id) }
  if (kind === 'native-funder-input') { const input = Transaction.fromAtomicBEEF(f.incoming.result.tx).inputs[0]!; f.binding.declaredNativePayments.push(`${input.sourceTXID}.${input.sourceOutputIndex}`) }
  if (kind === 'no-receipt') { for (const value of f.binding.globalSubmissions) if (value.txid === f.incoming.result.txid) value.verdict = 'REJECTED'; f.report.submissions = f.binding.globalSubmissions.slice(f.report.submissionStart, f.report.submissionEnd) }
  if (kind === 'getter-submission') row('payment').submissionEnd++
  if (kind === 'prefix') f.report.submissionPrefix.pop()
  if (kind === 'fractional-window') f.incoming.submissionStart += 0.5
  if (kind === 'trailing-beef') f.incoming.result.tx.push(0)
  if (kind === 'unmarked-bad-proof') { const bytes = f.incoming.result.tx, beef = Beef.fromBinary(bytes); beef.bumps.push(new MerklePath(mined.fundingHeight, [[{ offset: 0, hash: 'ab'.repeat(32) }]])); const writer = new Utils.Writer(); beef.toWriter(writer); f.incoming.result.tx = [...bytes.slice(0, 36), ...writer.toArray()] }
  await assert.rejects(deriveTransactionCoveragePaymentRoots(f.report, f.binding))
})

import { gunzipSync } from 'node:zlib'
import { deriveCompletionReserveRoot } from '../src/wallet-lab/native/coverage-completion/funding-roots.js'
import { verifyCompletionFunding } from '../src/wallet-lab/native/coverage-completion/funding.js'
const completionBytes = gunzipSync(fs.readFileSync(new URL('./fixtures/native-completion-funding/reference.json.gz', import.meta.url)))
const completionProvenance = JSON.parse(fs.readFileSync(new URL('./fixtures/native-completion-funding/provenance.json', import.meta.url), 'utf8'))
assert.equal(createHash('sha256').update(completionBytes).digest('hex'), completionProvenance.originalSha256)
function completionFixture() {
  const { report, binding: saved, evidence } = JSON.parse(completionBytes.toString())
  const storage = new Map<string, Transaction>(saved.storageRows.map((r: any) => [r.txid, Transaction.fromHex(r.rawTxHex)])), graph = new Map(storage)
  const root = Transaction.fromAtomicBEEF([...Buffer.from(saved.fixture.atomicBeefHex, 'hex')]); graph.set(root.id('hex'), root)
  const hydrate = (id: string, seen = new Set<string>()): Transaction => {
    assert.ok(!seen.has(id) && seen.size < 32); if (id === root.id('hex')) return root
    const tx = graph.get(id); assert.ok(tx); tx.merklePath = undefined
    for (const input of tx.inputs) input.sourceTransaction = hydrate(input.sourceTXID!, new Set([...seen, id]))
    return tx
  }
  for (const tx of graph.values()) hydrate(tx.id('hex'))
  const binding = { ...saved, storageTransactions: storage, resolvedTransactions: graph, readEvidence: (name: string) => Buffer.from(JSON.stringify(evidence[name])) }
  return { report, binding, payment: report.trace.find((r: any) => r.id === 'completion-payment'), acceptance: report.trace.find((r: any) => r.id === 'completion-acceptance') }
}
function changeCompletionProof(f: ReturnType<typeof completionFixture>, kind: string) {
  const bytes = f.payment.result.tx
  if (kind === 'trailing') bytes.push(0)
  else if (kind === 'truncated') bytes.pop()
  else if (kind === 'sparse') delete bytes[4]
  else {
    const graph = Beef.fromBinary(bytes), proof = kind === 'valid-unmarked' ? MerklePath.fromBinary(graph.bumps[0]!.toBinary()) : new MerklePath(mined.fundingHeight, [[{ offset: 0, hash: 'ab'.repeat(32) }]])
    for (const leaf of proof.path[0]!) delete leaf.txid
    graph.bumps.push(proof); const writer = new Utils.Writer(); graph.toWriter(writer); f.payment.result.tx = [...bytes.slice(0, 36), ...writer.toArray()]
  }
  f.acceptance.args.tx = f.payment.result.tx
}
test('actual4a completion reference admits only the exact50000 output and fee47', async () => {
  const f = completionFixture(), v = await deriveCompletionReserveRoot(f.report, f.binding)
  assert.deepEqual(v.declaredNativePayments, [f.payment.result.txid + '.0']); assert.equal(v.actualPaymentSatoshis, 50000); assert.equal(v.actualFee, 47)
})
test('retains the prior unmarked-public-proof counterexample while narrow admission rejects it', async () => {
  const f = completionFixture(); changeCompletionProof(f, 'bad-unmarked')
  assert.equal((await verifyCompletionFunding(f.report, f.binding)).verified, true)
  await assert.rejects(deriveCompletionReserveRoot(f.report, f.binding), /foreign root/)
})
test('valid unmarked completion proof remains independently admissible', async () => {
  const f = completionFixture(); changeCompletionProof(f, 'valid-unmarked')
  assert.equal((await deriveCompletionReserveRoot(f.report, f.binding)).actualPaymentSatoshis, 50000)
})
for (const kind of ['trailing', 'truncated', 'sparse']) test(`completion public BEEF ${kind} cannot disappear during independent reconstruction`, async () => {
  const f = completionFixture(); changeCompletionProof(f, kind)
  await assert.rejects(deriveCompletionReserveRoot(f.report, f.binding))
})

// Constructed profile controls retain the signed fixture and cannot qualify a new run.
test('funding-root parent selects oracle4 for4.8 and rejects an oracle3 child', async () => {
  const f = fixture(); f.binding.profile = 'ITCVE-1@4.8.0'
  await assert.rejects(deriveTransactionCoveragePaymentRoots(f.report, f.binding))
  const current = getTransactionCoveragePolicy(4)
  f.report.schema = 'tpnil-native-coverage-transactions@4.0.0'
  f.report.oracle = current.policy.oracle; f.report.policySha256 = current.policySha256
  assert.equal((await deriveTransactionCoveragePaymentRoots(f.report, f.binding)).actualPaymentSatoshis, 2000)
  f.binding.profile = 'ITCVE-1@4.7.0'
  await assert.rejects(deriveTransactionCoveragePaymentRoots(f.report, f.binding))
})

function insertExactReplay(f: any, callId: string, creationId: string) {
 const {report,binding}=f, target=report.trace.find((r:any)=>r.id===callId), creation=report.trace.find((r:any)=>r.id===creationId), index=target.submissionStart
 const receipt={...binding.globalSubmissions.slice(creation.submissionStart,creation.submissionEnd).find((r:any)=>r.txid===creation.result.txid)}
 binding.globalSubmissions.splice(index,0,receipt)
 binding.finalSubmissions=structuredClone(binding.globalSubmissions)
 for(const row of report.trace) {if(row===target)row.submissionEnd++;else if(row.submissionStart>=index){row.submissionStart++;row.submissionEnd++}}
 report.submissionEnd++
 if(report.submissions)report.submissions=binding.globalSubmissions.slice(report.submissionStart,report.submissionEnd)
 return receipt
}
for(const kind of ['exact','wrong-txid','wrong-body','rejected'] as const)test(`4.8 incoming root replay ${kind} retains exact prior-fixture contract`,async()=>{
 const f=fixture(),current=getTransactionCoveragePolicy(4);f.binding.profile='ITCVE-1@4.8.0';Object.assign(f.report,{schema:'tpnil-native-coverage-transactions@4.0.0',oracle:current.policy.oracle,policySha256:current.policySha256})
 const receipt=insertExactReplay(f,'payment','incoming-fixture')
 if(kind==='wrong-txid')receipt.txid='00'.repeat(32)
 if(kind==='wrong-body')receipt.beefHex+='00'
 if(kind==='rejected')receipt.verdict='REJECTED'
 if(kind==='exact')assert.equal((await deriveTransactionCoveragePaymentRoots(f.report,f.binding)).actualPaymentSatoshis,2000)
 else await assert.rejects(deriveTransactionCoveragePaymentRoots(f.report,f.binding))
})
for(const kind of ['exact','wrong-body','rejected'] as const)test(`4.8 reserve root replay ${kind} retains exact prior-fixture contract`,async()=>{
 const f=completionFixture();f.binding.profile='ITCVE-1@4.8.0'
 const receipt=insertExactReplay(f,'completion-acceptance','completion-payment')
 if(kind==='wrong-body')receipt.beefHex+='00'
 if(kind==='rejected')receipt.verdict='REJECTED'
 if(kind==='exact')assert.equal((await deriveCompletionReserveRoot(f.report,f.binding)).actualPaymentSatoshis,50000)
 else await assert.rejects(deriveCompletionReserveRoot(f.report,f.binding))
})
