import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { test } from 'vitest'
import { Beef, MerklePath, P2PKH, PrivateKey, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import { coverageObservationEncoding, decodeCoverageObservation } from '../src/wallet-lab/native/coverage-observation.js'
import { evaluateTransactionBranches, transactionBranchAssertions, verifyTransactionActiveProvider, verifyTransactionBranchParent, finalizeTransactionBranchReport } from '../src/wallet-lab/native/coverage-completion/transaction-branches-parent.js'
import { strictBeef, verifyTransactionBranchProof, returnedChange, proveFullSetConsumption } from '../src/wallet-lab/native/coverage-completion/transaction-branches-oracle.js'
import { hydrateTransactionCompletionFixture } from '../src/wallet-lab/native/coverage-completion/transaction-known-source.js'
import { coveragePaymentScript as extensionRecipient } from '../src/wallet-lab/native/coverage-permissions-model.js'
import { coveragePaymentScript as baseRecipient } from '../src/wallet-lab/native/conformance-permission-coverage-model.js'
import { lifecyclePermissionConfig } from '../src/wallet-lab/native/conformance-permission-lifecycle-model.js'

const directory = new URL('./fixtures/native-transaction-branches-source3/', import.meta.url)
const provenance = JSON.parse(fs.readFileSync(new URL('provenance.json', directory), 'utf8'))
function read(name: string) {
 const entry = provenance.files.find((r: any) => r.path === `${name}.gz`), bytes = fs.readFileSync(new URL(entry.path, directory)), raw = gunzipSync(bytes)
 assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.gzipSha256); assert.equal(createHash('sha256').update(raw).digest('hex'), entry.originalSha256)
 return JSON.parse(raw.toString())
}
const original = decodeCoverageObservation<any>(read('report.json'), coverageObservationEncoding)
const tracker = { currentHeight: async () => original.fixture.fundingHeight + original.fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === original.fixture.merkleRoot && height === original.fixture.fundingHeight }
const row = (report: any, id: string) => report.trace.find((c: any) => c.id === id)
const wire = (graph: Beef, target: string) => { const writer = new Utils.Writer(); graph.toWriter(writer); return [1, 1, 1, 1, ...Buffer.from(target, 'hex').reverse(), ...writer.toArray()] }
const satisfied = (result: any) => result.outcomes.filter((r: any) => r.localChecks === 'SATISFIED').length

test('exact candidate library and final Go reference retains seven scoped checks and one frontend absence gap', async () => {
 const checked = await evaluateTransactionBranches(structuredClone(original)); assert.equal(satisfied(checked), 7)
 assert.equal(checked.acceptedNativeAssertions, 0); assert.equal(original.walletCalls, 24); assert.equal(original.funderCalls + original.unknownSource.trace.length, 6)
 assert.deepEqual(read('source-before.json'), read('source-after.json'))
})
test('new transaction recipient cannot collide with existing final-tail permission protections', () => {
 const script = new P2PKH().lock(PrivateKey.fromHex('7a'.repeat(32)).toPublicKey().toAddress()).toHex()
 assert.equal(original.recipientScript, script)
 for (const protectedScript of [extensionRecipient, baseRecipient, new P2PKH().lock(PrivateKey.fromHex(lifecyclePermissionConfig.paymentRecipientKeyHex).toPublicKey().toAddress()).toHex()]) assert.notEqual(script, protectedScript)
})
for (const kind of ['unmarked-false', 'extraneous-unmarked', 'wrong-height', 'wrong-membership', 'out-of-range-index', 'trailing-byte', 'invalid-extra-transaction'] as const)
 test(`entire supplied BEEF rejects ${kind}`, async () => {
  const bytes = row(original, 'fanout').result.tx; await verifyTransactionBranchProof(bytes, tracker)
  const graph = strictBeef(bytes), target = graph.atomicTxid!
  if (kind === 'unmarked-false') { graph.bumps[0]!.blockHeight++; for (const leaf of graph.bumps[0]!.path[0]!) delete leaf.txid }
  if (kind === 'extraneous-unmarked') graph.bumps.push(new MerklePath(original.fixture.fundingHeight + 1, [[{ offset: 0, hash: '12'.repeat(32) }]]))
  if (kind === 'wrong-height') graph.bumps[0]!.blockHeight++
  if (kind === 'wrong-membership') graph.findTxid(target)!.bumpIndex = 0
  if (kind === 'out-of-range-index') graph.findTxid(target)!.bumpIndex = 99
  if (kind === 'invalid-extra-transaction') { const tx = Transaction.fromHex(graph.findTxid(target)!.tx!.toHex()); tx.inputs[0]!.unlockingScript = UnlockingScript.fromHex('51'); graph.mergeRawTx(tx.toBinary()) }
  const hostile = wire(graph, target); if (kind === 'trailing-byte') hostile.push(0)
  await assert.rejects(verifyTransactionBranchProof(hostile, tracker))
 })
for (const kind of ['actor', 'method', 'order', 'arguments', 'cut-time', 'staged-locktime', 'incomplete-full-set', 'unsigned-point', 'batch-option', 'early-batch', 'missing-provider', 'truncated-accepted'] as const)
 test(`actual transaction branch replay rejects ${kind}`, async () => {
  const r = structuredClone(original)
  if (kind === 'actor') row(r, 'full-held-a').actor = 'funder'
  if (kind === 'method') row(r, 'default-sign-false').method = 'createAction'
  if (kind === 'order') [r.trace[1], r.trace[2]] = [r.trace[2], r.trace[1]]
  if (kind === 'arguments') row(r, 'batch-return-sign').args.options.acceptDelayedBroadcast = true
  if (kind === 'cut-time') r.cuts.find((c: any) => c.id === 'truncation-before').endedAt = r.endedAt
  if (kind === 'staged-locktime') { const c = row(r, 'default-stage-false'), tx = Transaction.fromAtomicBEEF(c.result.signableTransaction.tx); tx.lockTime++; c.result.signableTransaction.tx = tx.toAtomicBEEF() }
  if (kind === 'incomplete-full-set') r.fullSet.eligible.pop()
  if (kind === 'unsigned-point') r.stale.unsigned = r.stale.signed
  if (kind === 'batch-option') row(r, 'batch-release-txid-only').args.options.returnTXIDOnly = false
  if (kind === 'early-batch') r.submissions[r.initialSubmissionCount]!.txid = r.batchTargets.create[0]
  if (kind === 'missing-provider') r.cuts[0].snapshot.providers = []
  if (kind === 'truncated-accepted') { const c = row(r, 'internalize-truncated'); delete c.error; c.result = { accepted: true } }
  let rejected = false; try { rejected = satisfied(await evaluateTransactionBranches(r)) < 7 } catch { rejected = true }
  assert.ok(rejected)
 })
test('prior deliberate provider rejection remains outside this module acceptance window', async () => {
 const r = structuredClone(original), rejected = { ...r.submissions[0], verdict: 'REJECTED' }
 r.submissions.unshift(rejected); r.finalSubmissions.unshift(structuredClone(rejected)); r.initialSubmissionCount++
 for (const c of [...r.trace, ...r.unknownSource.trace, r.unknownSource.target]) { c.submissionStart++; c.submissionEnd++ }
 for (const c of [...r.cuts, ...r.unknownSource.cuts]) c.submissionIndex++
 r.unknownSource.finalSubmissionCount++
 assert.equal(satisfied(await evaluateTransactionBranches(r)), 7)
})

/** Synthetic parent envelopes over genuine public data are LAB_SELF_TEST_ONLY;
 * they exercise joins and cannot qualify a native session. */
async function parentFixture() {
 const report = structuredClone(original); report.mode = 'NATIVE_OBSERVATION'
 const source = report.providerRegistry[0], other = { id: 'source/replacement-wallet.itcve.test', identityKey: PrivateKey.fromHex('12'.repeat(32)).toPublicKey().toString(), componentIdentity: structuredClone(source.componentIdentity) }, registry = [source, other]
 report.providerRegistry = registry
 for (const cut of report.cuts) {
  cut.snapshot.providers.push({ id: other.id, componentIdentity: other.componentIdentity, snapshot: { ...structuredClone(cut.snapshot.providers[0].snapshot), providerIdentityKey: other.identityKey, outputs: [] } })
  cut.observation.snapshots = structuredClone(cut.snapshot)
 }
 for (const cut of report.unknownSource.cuts) {
  cut.observation.registry = structuredClone(registry)
  const s = structuredClone(cut.observation.snapshots.providers[0].snapshot); s.providerIdentityKey = other.identityKey; s.known = []; s.transactions = []; s.knownCount = 0; s.transactionCount = 0
  cut.observation.snapshots.providers.push({ id: other.id, componentIdentity: other.componentIdentity, snapshot: s })
 }
 const image = Buffer.from('89504e470d0a1a0a', 'hex'), imageSha = createHash('sha256').update(image).digest('hex'), evidence: Record<string, any> = {
  'service-components.json': source.componentIdentity, 'conformance/service-counterparts.json': { 'replacement-wallet.itcve.test': other.componentIdentity },
  'native-output-provider-registry.json': registry, 'native-output-snapshot-observations.json': report.cuts.map((c: any) => c.observation),
  'native-completion-inventory-ledger.json': { registry, certificates: [], transactionKnowledge: report.unknownSource.cuts.map((c: any) => c.observation) },
  'routes.json': report.finalRoutes, 'native-browser-contexts.json': { contexts: [{ extensionId: 'a'.repeat(32) }] },
  'conformance/portability.json': { mode: 'native-ui', counterparts: { url: 'https://replacement-wallet.itcve.test', destination: { storageIdentityKey: other.identityKey } }, ui: [{ stage: 'replacement-active' }, { stage: 'source-removed-from-config' }] }
 }
 for (const [stage, field, at] of [['initial', 'activeProviderInitial', report.startedAt], ['full-set', 'activeProvider', row(report, 'full-held-b').endedAt]]) {
  const screenshot = `conformance/transaction-branches-active-provider-${stage}.png`, mainScreenshot = `conformance/transaction-branches-provider-cards-${stage}.png`
  evidence[screenshot] = image; evidence[mainScreenshot] = image
  report[field] = { kind: 'NATIVE_REMOTE_BACKUP_UI', id: source.id, providerUrl: 'https://wallet.1sat.app', url: `chrome-extension://${'a'.repeat(32)}/index.html`,
   candidates: [{ id: source.id, providerUrl: 'https://wallet.1sat.app', present: true, card: 'wallet.1sat.app\nIn use' }, { id: other.id, providerUrl: 'https://replacement-wallet.itcve.test', present: true, card: 'replacement-wallet.itcve.test\nBackup copy' }],
   activeCards: ['wallet.1sat.app\nIn use'], card: 'wallet.1sat.app\nIn use\nhttps://wallet.1sat.app', screenshot, screenshotSha256: imageSha, mainScreenshot, mainScreenshotSha256: imageSha, startedAt: at, endedAt: at }
 }
 const graph = new Map<string, Transaction>(report.observedStorage.map((r: any) => [r.txid, Transaction.fromHex(r.rawTxHex)]))
 const root = Transaction.fromAtomicBEEF([...Buffer.from(report.fixture.atomicBeefHex, 'hex')]); graph.set(root.id('hex'), root)
 report.assertions = transactionBranchAssertions(await evaluateTransactionBranches(report))
 const binding = { profile: 'ITCVE-1@4.5.0' as const, identity: report.identity, fixture: report.fixture, storageTransactions: graph, resolvedTransactions: new Map(graph),
  declaredNativePayments: report.declaredNativePayments, globalSubmissions: report.submissions, finalSubmissions: report.finalSubmissions,
  readEvidence: (name: string) => Buffer.isBuffer(evidence[name]) ? evidence[name] : Buffer.from(JSON.stringify(evidence[name])) }
 return { report, binding, evidence }
}
test('full parent joins all providers and admits only verified isolated fixture ancestry', async () => {
 const f = await parentFixture(), originalSize = f.binding.storageTransactions.size
 const checked = await verifyTransactionBranchParent(f.report, f.binding)
 assert.equal(checked.assertions.filter((r: any) => r.result === 'PASS').length, 7); assert.equal(checked.assertions.filter((r: any) => r.result === 'BLOCKED').length, 1)
 assert.equal(f.binding.storageTransactions.size, originalSize); assert.ok(f.binding.resolvedTransactions.has(f.report.unknownSource.sourceTxid))
})
for (const kind of ['bad-bump', 'unmarked-extra-bump', 'bad-raw', 'source-membership', 'wrong-provider', 'network-exposure', 'native-funding', 'early-release', 'missing-ledger', 'wrong-policy', 'target-substitution', 'cut-after-target', 'missing-blob-cut'] as const)
 test(`isolated fixture hydration rejects ${kind} before inserting ancestry`, async () => {
  const f = await parentFixture(), source = f.report.unknownSource, baseline = [...f.binding.resolvedTransactions.keys()]
  await hydrateTransactionCompletionFixture(f.report, { ...f.binding, resolvedTransactions: new Map(f.binding.resolvedTransactions) })
  if (kind === 'bad-bump' || kind === 'unmarked-extra-bump') { const c = source.trace[2], g = strictBeef(c.result.tx); if (kind === 'bad-bump') { g.bumps[0]!.blockHeight++; for (const leaf of g.bumps[0]!.path[0]!) delete leaf.txid } else g.bumps.push(new MerklePath(f.report.fixture.fundingHeight + 1, [[{ offset: 0, hash: 'ab'.repeat(32) }]])); c.result.tx = wire(g, c.result.txid) }
  if (kind === 'bad-raw') source.storage[0].rawTxHex += '00'
  if (kind === 'source-membership') { const s = source.cuts[1].observation.snapshots.providers[0].snapshot; s.known.push({ ...s.known[0], txid: source.sourceTxid }); s.knownCount++ }
  if (kind === 'wrong-provider') source.cuts[0].observation.snapshots.providers[0].snapshot.providerIdentityKey = source.providerIdentity
  if (kind === 'network-exposure') source.outboundAttempts.push({ method: 'getRawTx', at: source.startedAt })
  if (kind === 'native-funding') { const p = Transaction.fromAtomicBEEF(source.trace[0].result.tx); f.binding.declaredNativePayments.push(`${p.inputs[0]!.sourceTXID ?? p.inputs[0]!.sourceTransaction!.id('hex')}.${p.inputs[0]!.sourceOutputIndex}`) }
  if (kind === 'early-release') source.trace[3].submissionStart = 0
  if (kind === 'missing-ledger') f.evidence['native-completion-inventory-ledger.json'].transactionKnowledge = []
  if (kind === 'target-substitution') source.target.args.options.knownTxids = []
  if (kind === 'cut-after-target') source.cuts[1].endedAt = source.cuts[2].endedAt
  if (kind === 'missing-blob-cut') source.cuts[1].observation.snapshots.providers[0].snapshot.knownCount++
  if (kind === 'wrong-policy') source.policy = { ...source.policy, sourceAmount: 501 }
  await assert.rejects(hydrateTransactionCompletionFixture(f.report, f.binding)); assert.deepEqual([...f.binding.resolvedTransactions.keys()], baseline)
 })
for (const kind of ['wrong-host', 'unknown-active', 'two-active', 'wrong-main-image', 'wrong-detail-image', 'after-cut', 'backup-selected', 'wrong-provider-registry'] as const)
 test(`fresh active provider UI rejects ${kind}`, async () => {
  const f = await parentFixture(); verifyTransactionActiveProvider(f.report, f.binding.readEvidence)
  const o = f.report.activeProvider
  if (kind === 'wrong-host') o.providerUrl = 'https://attacker.test'
  if (kind === 'unknown-active') o.activeCards.push('Local Storage\nIn use')
  if (kind === 'two-active') o.candidates[1].card = 'replacement-wallet.itcve.test\nIn use'
  if (kind === 'wrong-main-image') f.evidence[o.mainScreenshot] = Buffer.from('not a png')
  if (kind === 'wrong-detail-image') o.screenshotSha256 = '00'.repeat(32)
  if (kind === 'after-cut') o.endedAt = new Date(Date.parse(f.report.endedAt) + 1).toISOString()
  if (kind === 'backup-selected') o.card = 'wallet.1sat.app\nBackup copy\nhttps://wallet.1sat.app'
  if (kind === 'wrong-provider-registry') o.id = 'unowned'
  assert.throws(() => verifyTransactionActiveProvider(f.report, f.binding.readEvidence))
 })

// LAB_SELF_TEST_ONLY: the new summary representation is joined to the same
// independently owned provider ledger, exact extension origin and cut windows.
async function modernProviderFixture() {
 const f = await parentFixture()
 for (const o of [f.report.activeProviderInitial, f.report.activeProvider]) {
  o.representation = 'ACTIVE_STORAGE_SUMMARY_V3'; o.summaryButtons = 2; o.summaryEditButtons = 1; o.summarySyncButtons = 1; o.makeActiveButtons = 0
  o.activeSummary = 'ACTIVE STORAGE\nSynced across devices\nWALLET.1SAT.APP'
  o.candidates[0].card = o.activeSummary; o.activeCards = [o.activeSummary]
 }
 return f
}
test('new active summary retains independent native parent identity and time joins', async () => {
 const f = await modernProviderFixture(); verifyTransactionActiveProvider(f.report, f.binding.readEvidence, 'ITCVE-1@4.8.0')
 assert.throws(() => verifyTransactionActiveProvider(f.report, f.binding.readEvidence, 'ITCVE-1@4.7.0'))
})
for (const kind of ['missing-summary', 'two-headings', 'wrong-summary-host', 'two-active', 'two-buttons', 'make-active', 'backup-detail', 'wrong-image', 'after-cut', 'foreign-origin', 'wrong-provider-ledger'] as const)
 test(`new active summary parent rejects ${kind}`, async () => {
  const f = await modernProviderFixture(), o = f.report.activeProvider
  if (kind === 'missing-summary') delete o.activeSummary
  if (kind === 'two-headings') { o.activeSummary += '\nActive Storage'; o.candidates[0].card = o.activeSummary; o.activeCards = [o.activeSummary] }
  if (kind === 'wrong-summary-host') { o.activeSummary = 'Active Storage\nwallet.1sat.app.evil'; o.candidates[0].card = o.activeSummary; o.activeCards = [o.activeSummary] }
  if (kind === 'two-active') o.candidates[1].card += '\nActive Storage'
  if (kind === 'two-buttons') o.summaryEditButtons = 2
  if (kind === 'make-active') o.makeActiveButtons = 1
  if (kind === 'backup-detail') o.card = 'wallet.1sat.app\nBackup copy\nhttps://wallet.1sat.app'
  if (kind === 'wrong-image') o.mainScreenshotSha256 = '00'.repeat(32)
  if (kind === 'after-cut') o.endedAt = new Date(Date.parse(f.report.endedAt) + 1).toISOString()
  if (kind === 'foreign-origin') o.url = 'https://attacker.test/index.html'
  if (kind === 'wrong-provider-ledger') f.evidence['conformance/portability.json'].counterparts.destination.storageIdentityKey = '00'
  assert.throws(() => verifyTransactionActiveProvider(f.report, f.binding.readEvidence, 'ITCVE-1@4.8.0'))
 })

// Retained native counterexamples are input evidence, never completed qualification.
for (const repetition of [1, 2]) test(`native15 repetition${repetition} permits a fee-only full-set remainder`, async () => {
 const r = decodeCoverageObservation<any>(read(`native15-no-change-${repetition}.json`), coverageObservationEncoding)
 assert.equal(r.nativeQualification, false); assert.equal(r.sourceRun, 43358474345)
 const signed = Transaction.fromAtomicBEEF(r.sign.result.tx), staged = Transaction.fromAtomicBEEF(r.stage.result.signableTransaction.tx)
 const tr = { currentHeight: async () => r.fixture.fundingHeight + r.fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === r.fixture.merkleRoot && height === r.fixture.fundingHeight }
 await verifyTransactionBranchProof(r.sign.result.tx, tr)
 const balance = proveFullSetConsumption(r.fullSet.eligible, r.fullSet.required, signed, 0, r.recipientScript)
 assert.ok(balance.fee > 0); assert.equal(signed.outputs.length, 1)
 const change = r.outputs.filter((o: any) => o.basketName === 'default').map((o: any) => o.outpoint)
 assert.deepEqual(change, []); returnedChange(r.stage.result, change)
 assert.deepEqual(staged.outputs.map(o => [o.satoshis, o.lockingScript.toHex()]), signed.outputs.map(o => [o.satoshis, o.lockingScript.toHex()]))
 assert.throws(() => returnedChange({ ...r.stage.result, noSendChange: [signed.id('hex') + '.0'] }, change))
 assert.throws(() => returnedChange({ ...r.stage.result, noSendChange: null }, change))
})
test('stale fixture uses its own independently observed change after batch signing', async () => {
 assert.equal(original.programRevision, 2)
 const signed = row(original, 'batch-sign-held').result.txid
 assert.ok(original.stale.signed.startsWith(signed + '.'))
 assert.ok(original.cuts.find((c: any) => c.id === 'stale-before').snapshot.providers.some((p: any) => p.snapshot.outputs.some((o: any) => o.outpoint === original.stale.signed && o.spendable && o.basketName === 'default')))
 const r = structuredClone(original); r.stale.signed = row(r, 'full-child-sign').result.txid + '.0'
 await assert.rejects(evaluateTransactionBranches(r))
})
test('evaluator persists an invalid-evidence diagnostic and propagates the global failure', async () => {
 const r = structuredClone(original); row(r, 'full-held-a').actor = 'funder'
 let saved: any
 await assert.rejects(finalizeTransactionBranchReport(r, value => { saved = structuredClone(value) }))
 assert.equal(saved.result, 'INVALID_EVIDENCE'); assert.equal(saved.evaluatorError.name, 'AssertionError')
 assert.ok(saved.evaluatorError.message); assert.equal(saved.assertions, undefined)
 await assert.rejects(evaluateTransactionBranches(saved))
})
test('positive evaluator report retains scoped assertions and never qualifies the reference', async () => {
 let saved: any
 const r = await finalizeTransactionBranchReport(structuredClone(original), value => { saved = structuredClone(value) })
 assert.deepEqual(saved, r); assert.equal(r.nativeQualification, false); assert.equal(r.assertions.filter((x: any) => x.result === 'PASS').length, 7); assert.equal(r.result, 'BLOCKED')
})

test('missing independently staged fixture retains row diagnostics without discarding the report', async () => {
 const r = decodeCoverageObservation<any>(read('missing-stage-report.json'), coverageObservationEncoding)
 const checked = await evaluateTransactionBranches(r)
 assert.equal(satisfied(checked), 5)
 const stale = checked.outcomes.find((x: any) => x.id === 'transaction.nosend-change/unsigned-stale-txid')!
 assert.equal(stale.result, 'BLOCKED'); assert.equal(stale.localChecks, 'UNAVAILABLE')
 assert.match(stale.detail, /fixture unavailable.*Missing public prerequisite/)
 assert.equal(checked.outcomes.find((x: any) => x.id === 'transaction.batch-send/returnTXIDOnly')!.result, 'FAIL')
 assert.deepEqual(checked, read('missing-stage-verification.json'))
 assert.equal(checked.acceptedNativeAssertions, 0)
})
