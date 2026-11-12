// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Beef, KeyDeriver, PrivateKey, ProtoWallet, PublicKey, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'
import { canonicalJson } from '../../determinism.js'
import { verifyPermissionCallNonces, verifyPermissionClick } from './permission-click.js'
import { coverageSpendingSummary } from './coverage-permissions-observer.js'
import { verifyNativePermissionCoverage } from './verify-conformance-permission-coverage.js'
import { observedSubmissionTransactions, type SubmissionGraphOptions } from './verify-transaction-state-bindings.js'
import { verifyObservedNativeTransactionBindings } from './verify-conditional-transaction-bindings.js'
import { spendsOnlyDeclaredNativePayments } from './verify-conformance-reserves.js'
import type { NativePermissionCoverageReport } from './conformance-permission-coverage-model.js'
import { permissionExtensionPolicy, permissionExtensionStepIds, permissionExtensionManifestLabels, extensionCategories, linkageDimensions, coverageCategoryCall, coverageManifest, coveragePaymentScript, extensionLinkageArgs, extensionPaymentArgs, permissionCoverageConfig as original, coverageVerifier, type NativePermissionExtensionReport as Report, type ExtensionControl, type ExtensionImage } from './coverage-permissions-model.js'
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const same = (a: unknown, b: unknown) => assert.equal(canonicalJson(a), canonicalJson(b))
const instant = (v: string) => { const n = Date.parse(v); assert.ok(Number.isFinite(n)); return n }
const fixture = () => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const terminal = (step: any) => { assert.equal(step.outcome.status, 'fulfilled', step.outcome.error?.message); assert.equal(step.outcome.error, undefined); return step.outcome.value }
export function decodePermissionExtensionAtomic(bytes: unknown): Transaction {
  assert.ok(Array.isArray(bytes) && bytes.length > 0 && bytes.length <= 16 * 1024 * 1024)
  for (let i = 0; i < bytes.length; i++) assert.ok(Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255, 'Expected dense transaction bytes')
  const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader); assert.ok(reader.eof(), 'Trailing staged/signed BEEF')
  const tx = Transaction.fromAtomicBEEF(bytes); assert.equal(graph.atomicTxid, tx.id('hex')); return tx
}
function signedBytes(value: any): Transaction {
  assert.match(value.txid, /^[a-f0-9]{64}$/); const tx = decodePermissionExtensionAtomic(value.tx); assert.equal(tx.id('hex'), value.txid); return tx
}

export function verifyPermissionExtensionPromptScope(step: Report['steps'][number], prompt: Report['steps'][number]['prompts'][number]): void {
  const lines = prompt.body.split('\n').map(line => line.trim()).filter(Boolean)
  const after = (label: string) => { assert.equal(lines.filter(line => line === label).length, 1, `Exact visible ${label} required`); return lines[lines.indexOf(label) + 1] }
  const origin = new URL(step.origin).host
  if (lines[0] === 'Permission Request') {
    assert.equal(lines[1], `${origin} is requesting the following permissions`)
    assert.equal(lines[2], coverageManifest.metanet.groupPermissions.description)
    const labels = permissionExtensionManifestLabels()
    const keys = step.method === 'waitForAuthentication' && step.id.endsWith('-grant') ? ['spending', 'protocol', 'basket', 'certificate'] : ['basket-subset', 'certificate-subset', 'subset-spend-deny'].includes(step.id) ? ['spending', 'basket', 'certificate'] : step.id === 'unchecked-spend-deny' ? ['spending'] : undefined
    assert.ok(keys, 'Grouped prompt cannot authorize this declared request')
    same(prompt.checkboxStates.map(row => row.label).sort(), keys.map(key => labels[key as keyof typeof labels]).sort())
    return
  }
  assert.equal(after('Origin'), origin)
  if (step.method === 'getPublicKey' && step.args.identityKey === true) {
    same(step.args, { identityKey: true })
    same(lines, ['Protocol Permission', 'An application is requesting permission to use protocol "identity key retrieval" with security level 1.', 'Origin', origin, 'Protocol', 'identity key retrieval', 'Security', 'Level 1 · this app only', 'Allow', 'Deny'])
    same(prompt.checkboxStates, []); same(prompt.selections, [])
    return
  }
  if (step.method === 'getPublicKey' || step.method === 'revealSpecificKeyLinkage') {
    assert.equal(lines[0], 'Protocol Permission')
    assert.equal(after('Protocol'), step.method === 'getPublicKey' ? step.args.protocolID[1] : `specific key linkage revelation ${step.args.protocolID[1]} ${step.args.keyID}`)
    assert.equal(after('Counterparty'), step.method === 'getPublicKey' ? step.args.counterparty : step.args.verifier)
    assert.equal(after('Security'), 'Level 2 · this app and this recipient only')
  } else if (step.method === 'listOutputs') { assert.equal(lines[0], 'Basket Access'); assert.equal(after('Basket'), step.args.basket) }
  else if (step.method === 'proveCertificate') { assert.equal(lines[0], 'Certificate Access'); assert.equal(after('Cert Type'), step.args.certificate.type); assert.equal(after('Fields'), step.args.fieldsToReveal.join(', ')) }
  else if (step.method === 'createAction') {
    assert.equal(lines[0], 'Spending Authorization'); assert.equal(after('Reason'), step.args.description)
    for (const output of step.args.outputs) assert.ok(lines.includes(`${output.outputDescription} (${output.satoshis} satoshis)`), 'Visible recipient intent differs from the public request')
    assert.match(after('Amount') ?? '', /^(?:[0-9,]+ satoshis|[0-9]+(?:\.[0-9]+)? BSV)$/)
  } else throw new Error('Unexpected permission prompt method')
  assert.equal(prompt.checkboxStates.length, 0)
}
/** Prospective identity consent is a distinct level1 grant, not an inferred
 * side effect of the later protocol/category grants. */
export function verifyPermissionExtensionIdentityConsent(step: Report['steps'][number], extensionId: string, read: (name: string) => Buffer, identity: string): void {
  assert.equal(step.id, 'identity'); assert.equal(step.origin, permissionExtensionPolicy().configuration.primary); assert.equal(new URL(step.pageUrl).origin, step.origin)
  assert.equal(step.method, 'getPublicKey'); same(step.args, { identityKey: true })
  assert.equal(PublicKey.fromString(identity).toString(), identity); assert.equal(terminal(step).publicKey, identity)
  verifyPermissionCallNonces([step]); assert.equal(step.prompts.length, 1)
  const prompt = step.prompts[0]!
  assert.equal(prompt.decision, 'allow'); assert.equal(prompt.button, 'Allow'); assert.equal(prompt.pendingBeforeDecision, true)
  assert.match(extensionId, /^[a-p]{32}$/)
  const url = new URL(prompt.url); assert.equal(url.protocol, 'chrome-extension:'); assert.equal(url.host, extensionId); assert.equal(url.pathname, '/prompt.html')
  verifyPermissionExtensionPromptScope(step, prompt); verifyPermissionClick(prompt.trustedClick, prompt, step)
  assert.equal(prompt.screenshot.name, 'conformance/extension-identity-0.png')
  const bytes = read(prompt.screenshot.name); assert.equal(bytes.length, prompt.screenshot.size); assert.equal(sha(bytes), prompt.screenshot.sha256); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
}
export function verifyPermissionExtensionStaging(prepared: number[], signed: number[]): void {
  const before = decodePermissionExtensionAtomic(prepared), after = decodePermissionExtensionAtomic(signed)
  const intent = (tx: Transaction) => ({ version: tx.version, lockTime: tx.lockTime, inputs: tx.inputs.map(i => ({ txid: i.sourceTXID ?? i.sourceTransaction?.id('hex'), index: i.sourceOutputIndex, sequence: i.sequence })), outputs: tx.outputs.map(o => ({ satoshis: o.satoshis, script: o.lockingScript.toHex() })) })
  same(intent(before), intent(after))
}
export const permissionExtensionSettingsOrder = [
  ['overcap-before', 'overcap-grant', 'overcap-deny'], ['overcap-after', 'overcap-deny', 'concurrent-grant'],
  ['concurrent-before', 'concurrent-grant', 'concurrent-a'], ['concurrent-after', 'concurrent-b', 'abort-grant'],
  ['abort-before', 'abort-grant', 'abort-stage'], ['abort-held', 'abort-stage', 'abort-close'], ['abort-after', 'abort-close', 'abort-recovery'], ['abort-recovered', 'abort-recovery', 'rejection-grant'],
  ['rejection-before', 'rejection-grant', 'rejection-create'], ['rejection-after', 'rejection-create', 'rejection-recovery'], ['rejection-recovered', 'rejection-recovery', 'nosend-grant'],
  ['nosend-before', 'nosend-grant', 'nosend-stage'], ['nosend-held', 'nosend-sign', 'nosend-close'], ['nosend-after', 'nosend-close', 'nosend-recovery'], ['nosend-recovered', 'nosend-recovery', undefined]
] as const
/** Bind auxiliary UI observations to the same public-call timeline. Receipt
 * names are exact producer names, so a valid unrelated PNG cannot substitute. */
export function verifyPermissionExtensionReceiptSequence(report: Report): void {
  const step = (id: string) => { const rows = report.steps.filter(s => s.id === id); assert.equal(rows.length, 1); return rows[0]! }
  const pair = ['concurrent-a', 'concurrent-b'], ids = report.steps.map(s => s.id)
  same(ids.filter(id => !pair.includes(id)), permissionExtensionStepIds.filter(id => !pair.includes(id)))
  same(ids.slice(permissionExtensionStepIds.indexOf('concurrent-a'), permissionExtensionStepIds.indexOf('concurrent-a') + 2).sort(), pair)
  assert.equal(ids.length, permissionExtensionStepIds.length); assert.equal(new Set(ids).size, ids.length)
  for (const [i, s] of report.steps.entries()) {
    assert.ok(instant(report.startedAt) <= instant(s.startedAt) && instant(s.startedAt) <= instant(s.endedAt) && instant(s.endedAt) <= instant(report.endedAt))
    for (const prior of report.steps.slice(0, i)) if (!(pair.includes(prior.id) && pair.includes(s.id))) assert.ok(instant(prior.endedAt) <= instant(s.startedAt), 'Sequential public observations overlap or are reordered')
    for (const [index, prompt] of s.prompts.entries()) assert.equal(prompt.screenshot.name, `conformance/extension-${s.id}-${index}.png`)
  }
  same(report.ui.map(r => r.id), ['lock', 'unlock', 'single-revoke']); assert.equal(new Set(report.ui.map(r => r.nonce)).size, 3)
  for (const r of report.ui) { assert.equal(r.before.name, `conformance/extension-ui-${r.id}-before.png`); assert.equal(r.after.name, `conformance/extension-ui-${r.id}-after.png`); assert.ok(instant(report.startedAt) <= instant(r.startedAt) && instant(r.startedAt) <= instant(r.endedAt) && instant(r.endedAt) <= instant(report.endedAt)) }
  const revoke = report.ui[2]!
  assert.ok(instant(step('certificate-after-lock-alternate-deny').endedAt) <= instant(revoke.startedAt) && instant(revoke.endedAt) <= instant(step('protocol-after-single-revoke').startedAt), 'Individual revoke must precede its subsequent permission checks')
  same(report.settings.map(s => s.id), permissionExtensionSettingsOrder.map(([id]) => id))
  for (const [id, before, after] of permissionExtensionSettingsOrder) {
    const s = report.settings.find(s => s.id === id)!; assert.equal(s.image.name, `conformance/extension-settings-${id}.png`)
    const lower = id === 'concurrent-after' ? Math.max(...pair.map(id => instant(step(id).endedAt)), instant(report.concurrent.endedAt)) : instant(step(before).endedAt)
    const upper = id === 'concurrent-before' ? Math.min(...pair.map(id => instant(step(id).startedAt)), instant(report.concurrent.startedAt)) : after ? instant(step(after).startedAt) : instant(report.endedAt)
    assert.ok(lower <= instant(s.at) && instant(s.at) <= upper, `Usage snapshot ${id} is outside its exact public-call interval`)
  }
}
export function verifyPermissionExtensionCheckboxTiming(selection: Report['steps'][number]['prompts'][number]['selections'][number], step: Report['steps'][number], prompt: Report['steps'][number]['prompts'][number]): void {
  const e = selection.dispatch; assert.ok(e)
  assert.ok(instant(step.startedAt) <= instant(selection.startedAt) && instant(selection.startedAt) <= instant(e.dispatchedAt) && instant(e.dispatchedAt) <= instant(e.receivedAt) && instant(e.receivedAt) <= instant(selection.endedAt) && instant(selection.endedAt) <= instant(prompt.clickedAt) && instant(prompt.clickedAt) <= instant(step.endedAt), 'Checkbox observation must precede its trusted permission decision in source order')
}
export function permissionExtensionTransactionGraph(report: Report): Map<string, Transaction> {
  const txs = new Map<string, Transaction>(), f = fixture()
  const insert = (tx: Transaction, depth = 0) => { assert.ok(depth < 48); const id = tx.id('hex'), previous = txs.get(id); if (previous) assert.equal(previous.toHex(), tx.toHex()); else txs.set(id, tx); for (const input of tx.inputs) if (input.sourceTransaction) insert(input.sourceTransaction, depth + 1) }
  insert(Transaction.fromAtomicBEEF([...Buffer.from(f.atomicBeefHex, 'hex')]))
  assert.ok(report.storageTransactions.length <= 2048)
  for (const row of report.storageTransactions) { const tx = Transaction.fromHex(row.rawTxHex); assert.equal(tx.toHex(), row.rawTxHex); assert.equal(tx.id('hex'), row.txid); insert(tx) }
  for (const step of report.steps) for (const bytes of [step.outcome.value?.tx, step.outcome.value?.signableTransaction?.tx, step.outcome.error?.tx]) if (Array.isArray(bytes)) {
    try { insert(Transaction.fromAtomicBEEF(bytes)) } catch { /* Malformed public returns are separately failed, never proof material. */ }
  }
  for (const tx of txs.values()) for (const input of tx.inputs) {
    const id = input.sourceTXID ?? input.sourceTransaction?.id('hex'), source = id && txs.get(id)
    if (source) { if (input.sourceTransaction) assert.equal(input.sourceTransaction.toHex(), source.toHex()); input.sourceTransaction = source }
  }
  return txs
}
export function permissionExtensionFee(tx: Transaction): number {
  const inputs = tx.inputs.reduce((sum, input) => { const amount = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis; assert.ok(Number.isSafeInteger(amount) && amount! >= 0, 'Unresolved independent input amount'); return sum + amount! }, 0)
  const outputs = tx.outputs.reduce((sum, output) => { assert.ok(Number.isSafeInteger(output.satoshis) && output.satoshis! >= 0); return sum + output.satoshis! }, 0)
  const fee = inputs - outputs; assert.ok(Number.isSafeInteger(fee) && fee >= 0); return fee
}
export async function verifyPermissionExtensionLinkage(value: any, identity: string): Promise<void> {
  const args = extensionLinkageArgs(), verifier = new ProtoWallet(PrivateKey.fromHex(original.verifierKeyHex))
  assert.equal(value.prover, identity); assert.equal(value.verifier, coverageVerifier); assert.equal(value.counterparty, args.counterparty)
  same(value.protocolID, args.protocolID); assert.equal(value.keyID, args.keyID); assert.equal(value.proofType, 0)
  const encryption = { protocolID: [2, `specific linkage revelation ${original.linkageProtocol[0]} ${original.linkageProtocol[1]}`] as [2, string], keyID: original.linkageKeyID, counterparty: identity }
  const clear = (await verifier.decrypt({ ...encryption, ciphertext: value.encryptedLinkage })).plaintext
  same(clear, new ProtoWallet(PrivateKey.fromHex(original.peerKeyHex)).keyDeriver!.revealSpecificSecret(identity, original.linkageProtocol, original.linkageKeyID))
  // The pinned type0 contract explicitly carries an encrypted no-proof marker.
  // It is not a Schnorr proof; bind its authentication and exact marker anyway.
  same((await verifier.decrypt({ ...encryption, ciphertext: value.encryptedLinkageProof })).plaintext, [0])
}
export async function evaluatePermissionExtension(report: Report, anchor: NativePermissionCoverageReport, read: (name: string) => Buffer, identity: string): Promise<Report['assertions']> {
  const p = permissionExtensionPolicy(), c = p.configuration, f = fixture()
  const step = (id: string) => { const rows = report.steps.filter(row => row.id === id); assert.equal(rows.length, 1, `Exactly one ${id}`); return rows[0]! }
  const success = (id: string) => terminal(step(id))
  const image = (i: ExtensionImage) => { assert.match(i.name, /^conformance\/extension-[a-z0-9-]+\.png$/); const bytes = read(i.name); assert.equal(bytes.length, i.size); assert.equal(sha(bytes), i.sha256); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a') }
  const check = (id: string, origin: string, method: string, args: any) => { const s = step(id); assert.equal(s.origin, origin); assert.equal(s.method, method); same(s.args, args); return s }
  let graph: Map<string, Transaction> | undefined, anchorPromise: Promise<unknown> | undefined
  const transactions = () => graph ??= permissionExtensionTransactionGraph(report)
  const anchorVerified = () => anchorPromise ??= verifyNativePermissionCoverage(anchor, name => {
    if (name !== 'native-browser-contexts.json') return read(name)
    const contexts = JSON.parse(read(name).toString()); assert.ok(contexts.contexts.length >= 3)
    // This NEW module retains the original exact initial+two-restart prefix.
    // The enclosing extension profile must additionally admit the whole chain.
    return Buffer.from(JSON.stringify({ ...contexts, contexts: contexts.contexts.slice(0, 3) }))
  }, identity)
  const prompt = (id: string, decision: 'allow' | 'deny') => {
    const s = step(id); assert.equal(s.prompts.length, 1, `${id} needs its own decision`); const v = s.prompts[0]!
    assert.equal(v.decision, decision); assert.equal(v.pendingBeforeDecision, true); assert.ok(v.body.includes(new URL(s.origin).host)); assert.ok(v.url.startsWith(`chrome-extension://${report.extensionId}/prompt.html`)); verifyPermissionExtensionPromptScope(s, v); verifyPermissionClick(v.trustedClick, v, s); image(v.screenshot)
    return v
  }
  const deny = (id: string) => { const s = step(id); assert.equal(s.outcome.status, 'rejected'); assert.equal(s.outcome.value, undefined); assert.match(s.outcome.error?.message ?? '', /permission.*denied|denied by user|user has denied|no user consent/i); assert.doesNotMatch(s.outcome.error.message, /timeout|timed out|unsupported|not implemented|network|fetch failed|insufficient|invalid parameter/i); prompt(id, 'deny') }
  const cached = (id: string) => { assert.equal(step(id).prompts.length, 0); return success(id) }
  const positive = async (category: typeof extensionCategories[number], suffix: string, origin: string, cache = true) => {
    const id = `${category}-${suffix}`, call = coverageCategoryCall(category, anchor.certificate); check(id, origin, call.method, call.args); const v = cache ? cached(id) : success(id)
    if (category === 'protocol') assert.equal(v.publicKey, new KeyDeriver(PrivateKey.fromHex(original.peerKeyHex)).derivePublicKey(original.protocol, original.keyID, identity, false).toString())
    if (category === 'basket') { const out = v.outputs.filter((o: any) => o.outpoint.replace('_', '.') === anchor.setupOutpoint); assert.equal(out.length, 1); assert.equal(out[0].satoshis, original.basketAmount); assert.equal(out[0].spendable, true); const restored = Transaction.fromAtomicBEEF(Beef.fromBinary(v.BEEF).toBinaryAtomic(anchor.setupOutpoint!.slice(0, 64))); assert.equal(restored.toHex(), transactions().get(restored.id('hex'))?.toHex()) }
    if (category === 'certificate') { same(Object.keys(v.keyringForVerifier), ['name']); const cert = VerifiableCertificate.fromCertificate(anchor.certificate, v.keyringForVerifier); assert.ok(await cert.verify()); same(await cert.decryptFields(new ProtoWallet(PrivateKey.fromHex(original.verifierKeyHex))), { name: original.fields.name }) }
  }
  const linkage = async (id: string, cache = true) => {
    check(id, c.primary, 'revealSpecificKeyLinkage', extensionLinkageArgs())
    await verifyPermissionExtensionLinkage(cache ? cached(id) : success(id), identity)
  }
  const control = (id: string) => {
    const rows = report.ui.filter(x => x.id === id); assert.equal(rows.length, 1); const r = rows[0]!, e = r.dispatch; assert.ok(e); assert.equal(r.url, `chrome-extension://${report.extensionId}/index.html`); assert.match(r.nonce, /^[a-f0-9-]{36}$/); assert.equal(e.nonce, r.nonce); assert.equal(e.url, r.url); assert.equal(e.body, r.beforeBody); assert.equal(e.type, 'click'); assert.equal(e.isTrusted, true); assert.equal(e.visible, true); assert.equal(e.disabled, false); assert.equal(e.button, 0); assert.ok([1, 2].includes(e.eventPhase)); assert.equal(e.expectedPage, true); assert.equal(e.expectedMainFrame, true); assert.equal(r.automation.status, 'fulfilled'); assert.ok(instant(r.startedAt) <= instant(e.dispatchedAt) && instant(e.dispatchedAt) <= instant(e.receivedAt) && instant(e.receivedAt) <= instant(r.endedAt)); image(r.before); image(r.after); return r
  }
  const usage = (id: string, origin: string) => { const rows = report.settings.filter(s => s.id === id); assert.equal(rows.length, 1); const s = rows[0]!; assert.equal(s.origin, origin); assert.equal(s.pageUrl, `chrome-extension://${report.extensionId}/index.html`); assert.ok(s.body.includes(s.cardBody)); assert.equal(s.cardBody.split('\n')[0], new URL(origin).host); image(s.image); const v = coverageSpendingSummary(s.cardBody, c.cap); assert.ok(v); return v.spent }
  const manifest = (name: string, selection: 'all' | 'protocol' | 'no-spend') => {
    check(`${name}-grant`, c[name], 'waitForAuthentication', {}); assert.equal(success(`${name}-grant`).authenticated, true); const s = step(`${name}-grant`), ui = prompt(s.id, 'allow'), rows = report.manifests.filter(x => x.origin === c[name]); assert.equal(rows.length, 1); const m = rows[0]!; same(m.value, coverageManifest); assert.equal(m.sha256, sha(Buffer.from(canonicalJson(coverageManifest)))); assert.ok(m.requests.some(r => instant(s.startedAt) <= instant(r.at) && instant(r.at) <= instant(s.endedAt) && r.sha256 === m.sha256))
    assert.equal(ui.checkboxStates.length, 4); same(ui.checkboxStates.map(row => row.label).sort(), Object.values(permissionExtensionManifestLabels()).sort()); const states = new Map(ui.checkboxStates.map(row => [row.label, row.checked])); assert.equal(states.size, 4)
    for (const row of ui.checkboxStates) { const spending = row.label === permissionExtensionManifestLabels().spending, protocol = row.label === permissionExtensionManifestLabels().protocol; assert.equal(row.checked, selection === 'all' || selection === 'protocol' && protocol || selection === 'no-spend' && !spending) }
    for (const r of ui.selections) { assert.equal(r.callNonce, s.requestNonce); const e = r.dispatch; assert.ok(e); assert.equal(e.nonce, r.nonce); assert.equal(e.url, ui.url); assert.equal(e.label, r.label); assert.equal(e.type, 'change'); assert.equal(e.isTrusted, true); assert.equal(e.expectedPage, true); assert.equal(e.expectedMainFrame, true); assert.equal(e.checked, r.after); assert.notEqual(r.before, r.after); assert.equal(states.get(r.label), r.after); verifyPermissionExtensionCheckboxTiming(r, s, ui) }
    if (selection === 'all') { const r = ui.selections.filter(r => /spend up to/i.test(r.label)); assert.equal(r.length, 1); assert.equal(r[0]!.before, false); assert.equal(r[0]!.after, true) }
    else assert.equal(ui.selections.filter(r => /spend up to/i.test(r.label)).length, 0)
  }
  const spend = async (id: string, origin: string, amount: number, role = id) => {
    check(id, origin, 'createAction', extensionPaymentArgs(role, amount)); const v = cached(id), tx = signedBytes(v), independent = transactions().get(tx.id('hex')); assert.ok(independent); assert.equal(independent.toHex(), tx.toHex()); const tracker = { currentHeight: async () => f.fundingHeight + f.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === f.merkleRoot && height === f.fundingHeight }; assert.ok(await independent.verify(tracker)); assert.equal(tx.outputs[0]!.satoshis, amount); assert.equal(tx.outputs[0]!.lockingScript.toHex(), coveragePaymentScript)
    const s = step(id), submitted = report.submissions.slice(s.submissionStart, s.submissionEnd).filter(row => row.txid === tx.id('hex')); assert.equal(submitted.length, 1); assert.equal(submitted[0]!.verdict, 'ACCEPTED_BY_NETWORK'); assert.equal(observedSubmissionTransactions(submitted[0]!)[0]!.transaction.toHex(), tx.toHex()); return amount + permissionExtensionFee(independent)
  }
  const common = async () => {
    assert.ok(report.identityPermission === undefined || report.identityPermission === 'explicit-allow-v1', 'Unknown identity consent observer');
    assert.equal(report.schema, 'tpnil-native-permission-extension@1.0.0'); assert.equal(report.oracle, p.oracle); assert.equal(report.policySha256, p.sha256); assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false); assert.equal(report.identity, identity); assert.equal(PublicKey.fromString(identity).toString(), identity); assert.equal(report.anchorSha256, sha(Buffer.from(canonicalJson(anchor)))); await anchorVerified()
    assert.equal(report.extensionId, anchor.extensionId); verifyPermissionExtensionReceiptSequence(report); assert.ok(report.steps.length <= p.maximumCalls); verifyPermissionCallNonces(report.steps); same(report.errors, []); assert.equal(report.cleanup.pagesClosed, true); assert.equal(report.cleanup.routesUnregistered, true); assert.equal(report.cleanup.settingsClosed, true)
    assert.ok(instant(report.startedAt) <= instant(report.endedAt)); assert.equal(report.submissionWindow.endIndex, report.submissions.length); assert.ok(Number.isSafeInteger(report.submissionWindow.startIndex) && report.submissionWindow.startIndex >= 0 && report.submissionWindow.startIndex <= report.submissionWindow.endIndex)
    for (const [index, s] of report.steps.entries()) { if (index && !([report.steps[index - 1]!.id, s.id].every(id => ['concurrent-a', 'concurrent-b'].includes(id)))) assert.ok(instant(report.steps[index - 1]!.endedAt) <= instant(s.startedAt), 'Sequential native calls overlap'); assert.equal(new URL(s.pageUrl).origin, s.origin); assert.ok(instant(report.startedAt) <= instant(s.startedAt) && instant(s.startedAt) <= instant(s.endedAt) && instant(s.endedAt) <= instant(report.endedAt)); assert.ok(Number.isSafeInteger(s.submissionStart) && Number.isSafeInteger(s.submissionEnd) && s.submissionStart >= report.submissionWindow.startIndex && s.submissionEnd >= s.submissionStart && s.submissionEnd <= report.submissionWindow.endIndex) }
    check('identity', c.primary, 'getPublicKey', { identityKey: true }); assert.equal(success('identity').publicKey, identity)
    if (report.identityPermission === 'explicit-allow-v1') verifyPermissionExtensionIdentityConsent(step('identity'), report.extensionId, read, identity)
    const applicationTransactions = [...transactions().values()].filter(tx => tx.outputs.some(output => output.lockingScript.toHex() === coveragePaymentScript) && tx.inputs.every(input => input.unlockingScript && input.unlockingScript.toBinary().length > 0)); assert.ok(applicationTransactions.length <= p.maximumSignedApplicationTransactions); assert.ok(applicationTransactions.reduce((sum, tx) => sum + permissionExtensionFee(tx), 0) <= p.maximumApplicationFees)
  }
  const predicates: Array<() => Promise<void> | void> = [
    ...extensionCategories.map(category => async () => {
      prompt(`${category}-grant`, 'allow'); await positive(category, 'grant', c.primary, false); await positive(category, 'cached', c.primary)
      for (const suffix of ['alternate-deny', 'after-lock-alternate-deny']) { const call = coverageCategoryCall(category, anchor.certificate); check(`${category}-${suffix}`, c.alternate, call.method, call.args); deny(`${category}-${suffix}`) }
      const locked = control('lock'), unlocked = control('unlock'); assert.ok(instant(step('before-lock-auth').endedAt) <= instant(locked.startedAt) && instant(unlocked.endedAt) <= instant(step('unlocked-auth').startedAt)); assert.equal(locked.dispatch!.text, 'Lock Wallet'); assert.equal(unlocked.dispatch!.text, 'Unlock'); assert.ok(instant(locked.endedAt) <= instant(step('locked-auth').startedAt) && instant(step('locked-auth').endedAt) <= instant(unlocked.startedAt)); assert.equal(report.lock.sameContext, true); assert.equal(report.lock.passwordVisible, true); assert.equal(report.lock.passwordHiddenAfterUnlock, true); assert.equal(report.lock.beforePageUrl, locked.url); assert.equal(report.lock.afterPageUrl, unlocked.url)
      for (const [id, authenticated] of [['before-lock-auth', true], ['locked-auth', false], ['unlocked-auth', true]] as const) { check(id, c.primary, 'isAuthenticated', {}); assert.equal(cached(id).authenticated, authenticated) }
      await positive(category, 'after-lock', c.primary)
    }),
    async () => {
      const revoke = control('single-revoke'); assert.equal(revoke.dispatch!.tag, 'BUTTON'); assert.equal(revoke.dispatch!.text, ''); assert.ok(revoke.dispatch!.parentText.includes(`Can access: ${original.basket}`)); assert.ok(revoke.beforeBody.includes(new URL(c.primary).host)); assert.ok(!revoke.afterBody.includes(`Can access: ${original.basket}`))
      assert.equal(report.restarts.length, 1); const restart = report.restarts[0]!, contexts = JSON.parse(read('native-browser-contexts.json').toString()); assert.equal(restart.sequence, 3); assert.equal(restart.identity, identity); assert.equal(restart.extensionId, report.extensionId); assert.equal(restart.oldPagesClosed, true); same(contexts.contexts[3].restart, restart); assert.equal(contexts.contexts[2].closedAt, restart.closedAt); assert.equal(restart.profileBinding, contexts.contexts[0].profileBinding); assert.equal(restart.sandboxEvidence, 'native-sandbox-restart-3.txt'); assert.match(read(restart.sandboxEvidence!).toString(), /Seccomp-BPF sandbox\s+Yes/); assert.ok(instant(step('certificate-after-single-revoke').endedAt) <= instant(restart.startedAt) && instant(restart.endedAt) <= instant(step('restart-identity').startedAt)); assert.equal(cached('restart-identity').publicKey, identity)
      for (const suffix of ['after-single-revoke', 'after-single-revoke-restart']) { const call = coverageCategoryCall('basket', anchor.certificate); check(`basket-${suffix}`, c.primary, call.method, call.args); deny(`basket-${suffix}`); for (const category of ['protocol', 'certificate'] as const) await positive(category, suffix, c.primary) }
    },
    ...linkageDimensions.map(dimension => async () => { prompt('linkage-grant', 'allow'); await linkage('linkage-grant', false); await linkage('linkage-cached'); check(`linkage-${dimension}-deny`, c.primary, 'revealSpecificKeyLinkage', extensionLinkageArgs(dimension)); deny(`linkage-${dimension}-deny`); await linkage(`linkage-${dimension}-control`) }),
    async () => { manifest('subset', 'protocol'); await positive('protocol', 'subset', c.subset); for (const category of ['basket', 'certificate'] as const) { const call = coverageCategoryCall(category, anchor.certificate); check(`${category}-subset`, c.subset, call.method, call.args); deny(`${category}-subset`) } check('subset-spend-deny', c.subset, 'createAction', extensionPaymentArgs('subset-denied', 17)); deny('subset-spend-deny') },
    async () => { manifest('unchecked', 'no-spend'); for (const category of extensionCategories) await positive(category, 'unchecked', c.unchecked); check('unchecked-spend-deny', c.unchecked, 'createAction', extensionPaymentArgs('unchecked-denied', 19)); deny('unchecked-spend-deny') },
    () => { manifest('overcap', 'all'); assert.equal(usage('overcap-before', c.overcap), 0); check('overcap-deny', c.overcap, 'createAction', extensionPaymentArgs('overcap-denied', c.overcapAmount)); assert.ok(c.overcapAmount > c.cap); deny('overcap-deny'); assert.equal(usage('overcap-after', c.overcap), 0) },
    async () => { manifest('concurrent', 'all'); assert.equal(usage('concurrent-before', c.concurrent), 0); const a = step('concurrent-a'), b = step('concurrent-b'); assert.ok(instant(step('concurrent-grant').endedAt) <= instant(report.concurrent.startedAt) && instant(report.concurrent.startedAt) <= Math.min(instant(a.startedAt), instant(b.startedAt)) && Math.max(instant(a.endedAt), instant(b.endedAt)) <= instant(report.concurrent.endedAt)); assert.ok(Math.max(instant(a.startedAt), instant(b.startedAt)) < Math.min(instant(a.endedAt), instant(b.endedAt)), 'Both requests must actually overlap'); const accepted = [a, b].filter(s => s.outcome.status === 'fulfilled'), denied = [a, b].filter(s => s.outcome.status === 'rejected'); assert.equal(accepted.length, 1); assert.equal(denied.length, 1); const used = await spend(accepted[0]!.id, c.concurrent, c.concurrentAmount); check(denied[0]!.id, c.concurrent, 'createAction', extensionPaymentArgs(denied[0]!.id, c.concurrentAmount)); deny(denied[0]!.id); assert.ok(used <= c.cap && used + c.concurrentAmount > c.cap); assert.equal(usage('concurrent-after', c.concurrent), used) },
    ...(['abort', 'rejection', 'nosend'] as const).map(kind => async () => {
      manifest(kind, 'all'); assert.equal(usage(`${kind}-before`, c[kind]), 0)
      if (kind === 'rejection') {
        check('rejection-create', c.rejection, 'createAction', extensionPaymentArgs('rejection-create', c.accountingAmount)); const s = step('rejection-create'); assert.equal(s.outcome.status, 'rejected'); assert.equal(s.outcome.value, undefined); assert.equal(s.prompts.length, 0); assert.match(s.outcome.error?.message ?? '', /review|reject|invalid.*transaction/i); assert.doesNotMatch(s.outcome.error.message, /timeout|network|fetch failed|insufficient/i); const rows = report.submissions.slice(s.submissionStart, s.submissionEnd); assert.equal(rows.length, 1); assert.equal(rows[0]!.verdict, 'REJECTED'); const tx = observedSubmissionTransactions(rows[0]!)[0]!.transaction; assert.equal(tx.outputs[0]!.lockingScript.toHex(), coveragePaymentScript); assert.equal(tx.outputs[0]!.satoshis, c.accountingAmount); assert.equal(report.cleanup.rejectedVerdictRemoved, undefined)
      } else {
        check(`${kind}-stage`, c[kind], 'createAction', extensionPaymentArgs(`${kind}-stage`, c.accountingAmount, { signAndProcess: false, ...(kind === 'nosend' ? { noSend: true } : {}) })); const v = cached(`${kind}-stage`); assert.equal(v.signableTransaction?.reference, report.references[kind]); assert.equal(Buffer.from(report.references[kind]!, 'base64').toString('base64'), report.references[kind]); assert.ok(report.references[kind]!.length > 0); const stage = decodePermissionExtensionAtomic(v.signableTransaction.tx); const raw = transactions().get(stage.id('hex')); assert.ok(raw); assert.equal(stage.outputs[0]!.lockingScript.toHex(), coveragePaymentScript); assert.equal(stage.outputs[0]!.satoshis, c.accountingAmount)
        let heldValue = c.accountingAmount + permissionExtensionFee(raw)
        if (kind === 'nosend') { check('nosend-sign', c.nosend, 'signAction', { reference: report.references.nosend, spends: {}, options: { noSend: true } }); verifyPermissionExtensionStaging(v.signableTransaction.tx, cached('nosend-sign').tx); const signed = signedBytes(cached('nosend-sign')), resolved = transactions().get(signed.id('hex')); assert.ok(resolved); heldValue = c.accountingAmount + permissionExtensionFee(resolved); assert.equal(step('nosend-sign').submissionStart, step('nosend-sign').submissionEnd) }
        assert.equal(usage(`${kind}-held`, c[kind]), heldValue); check(`${kind}-close`, c[kind], 'abortAction', { reference: report.references[kind] }); assert.equal(cached(`${kind}-close`).aborted, true); assert.equal(step(`${kind}-stage`).submissionStart, step(`${kind}-close`).submissionEnd)
      }
      assert.equal(usage(`${kind}-after`, c[kind]), 0); const spent = await spend(`${kind}-recovery`, c[kind], c.accountingAmount); assert.ok(spent <= c.cap); assert.equal(usage(`${kind}-recovered`, c[kind]), spent)
    })
  ]
  assert.equal(predicates.length, p.assertions.length)
  return await Promise.all(predicates.map(async (predicate, i) => { try { await common(); await predicate(); return { id: p.assertions[i], result: 'PASS' as const, detail: 'Independent permission, native UI, scope and signed-accounting checks passed; final parent ledger binding remains required.' } } catch (error) { return { id: p.assertions[i], result: 'FAIL' as const, detail: error instanceof Error ? error.message : String(error) } } }))
}
export async function verifyPermissionExtension(report: Report, anchor: NativePermissionCoverageReport, read: (name: string) => Buffer, identity: string) {
  const assertions = await evaluatePermissionExtension(report, anchor, read, identity); same(report.assertions.map(({ id, result }) => ({ id, result })), assertions.map(({ id, result }) => ({ id, result }))); assert.equal(report.result, assertions.every(x => x.result === 'PASS') ? 'PASS' : assertions.some(x => x.result === 'FAIL') ? 'FAIL' : 'BLOCKED'); return { verified: true as const, assertions, result: report.result }
}
/** The deliberately rejected, otherwise valid payment is a narrow exception to
 * the final no-payment guard. Its later accounting/recovery result is separate:
 * a failed recovery cannot erase this observed rejection or broaden its scope. */
export async function verifyPermissionExtensionControlledRejection(report: Report, binding: {
  identity: string; globalSubmissions: Report['submissions']; finalSubmissions: Report['submissions']
  storageTransactions: Map<string, Transaction>; graph: SubmissionGraphOptions; declaredNativePayments: string[]
}) {
  const p = permissionExtensionPolicy(), c = p.configuration, f = fixture()
  assert.equal(report.schema, 'tpnil-native-permission-extension@1.0.0'); assert.equal(report.oracle, p.oracle); assert.equal(report.policySha256, p.sha256)
  assert.equal(report.identity, binding.identity); assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false)
  assert.equal(binding.graph.requireResolvedAncestors, true); same(binding.graph.trustedMinedRoot, { txid: f.txid, rawHex: f.rawHex }); assert.ok(binding.graph.resolvedTransactions instanceof Map)
  const rows = report.steps.filter(s => s.id === 'rejection-create'); assert.equal(rows.length, 1); const step = rows[0]!
  assert.equal(step.origin, c.rejection); assert.equal(new URL(step.pageUrl).origin, c.rejection); assert.equal(step.method, 'createAction'); same(step.args, extensionPaymentArgs('rejection-create', c.accountingAmount))
  assert.equal(step.outcome.status, 'rejected'); assert.equal(step.outcome.value, undefined); assert.equal(step.outcome.error?.status, 'error')
  assert.equal(step.outcome.error?.name, 'WERR_REVIEW_ACTIONS'); assert.equal(step.outcome.error?.code, 'WERR_REVIEW_ACTIONS')
  assert.match(step.outcome.error?.message ?? '', /review/i); assert.doesNotMatch(step.outcome.error.message, /timeout|network|fetch failed|insufficient|permission denied/i)
  assert.equal(step.prompts.length, 0); verifyPermissionCallNonces([step]); assert.ok(step.outcome.settledAt)
  assert.ok(instant(report.startedAt) <= instant(step.startedAt) && instant(step.startedAt) <= instant(step.outcome.settledAt) && instant(step.outcome.settledAt) <= instant(step.endedAt) && instant(step.endedAt) <= instant(report.endedAt))
  assert.equal(report.cleanup.rejectedVerdictRemoved, undefined)
  assert.ok(Number.isSafeInteger(report.submissionWindow.startIndex) && report.submissionWindow.startIndex >= 0)
  assert.equal(report.submissionWindow.endIndex, report.submissions.length); assert.ok(report.submissionWindow.endIndex <= binding.globalSubmissions.length)
  same(report.submissions, binding.globalSubmissions.slice(0, report.submissionWindow.endIndex)); assert.ok(binding.finalSubmissions.length >= binding.globalSubmissions.length); same(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions)
  assert.ok(Number.isSafeInteger(step.submissionStart) && step.submissionStart >= report.submissionWindow.startIndex); assert.equal(step.submissionEnd, step.submissionStart + 1); assert.ok(step.submissionEnd <= report.submissionWindow.endIndex)
  const submission = report.submissions[step.submissionStart]!; assert.equal(submission.verdict, 'REJECTED')
  const observed = observedSubmissionTransactions(submission, binding.graph), target = observed.find(row => row.isTarget); assert.ok(target); assert.equal(observed.filter(row => row.isTarget).length, 1)
  const transaction = target.transaction, stored = binding.storageTransactions.get(target.txid), resolved = binding.graph.resolvedTransactions.get(target.txid)
  assert.ok(stored && resolved, 'Controlled rejection requires exact independent stored and resolved target bytes'); assert.equal(stored.toHex(), transaction.toHex()); assert.equal(resolved.toHex(), transaction.toHex())
  assert.equal(transaction.outputs[0]?.lockingScript.toHex(), coveragePaymentScript); assert.equal(transaction.outputs[0]?.satoshis, c.accountingAmount)
  assert.equal(transaction.outputs.filter(output => output.lockingScript.toHex() === coveragePaymentScript).length, 1, 'The exception permits only the declared payment output')
  assert.ok(spendsOnlyDeclaredNativePayments(resolved, binding.declaredNativePayments), 'Controlled rejection spends outside declared native payments')
  const tracker = { currentHeight: async () => f.fundingHeight + f.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === f.merkleRoot && height === f.fundingHeight }
  const graph = Beef.fromBinary(resolved.toAtomicBEEF()), mined = graph.findTxid(f.txid)
  assert.ok(mined?.tx && mined.bumpIndex !== undefined); assert.equal(mined.tx.toHex(), f.rawHex); assert.ok(await graph.verify(tracker)); assert.ok(await resolved.verify(tracker), 'Controlled rejection must have valid scripts/signatures')
  const fee = permissionExtensionFee(resolved); assert.ok(fee <= p.maximumApplicationFees)
  if (step.outcome.error.txid !== undefined) assert.equal(step.outcome.error.txid, target.txid)
  if (step.outcome.error.tx !== undefined) assert.equal(decodePermissionExtensionAtomic(step.outcome.error.tx).toHex(), transaction.toHex(), 'Public review payload differs from rejected target')
  for (let i = report.submissionWindow.startIndex; i < binding.finalSubmissions.length; i++) for (const row of observedSubmissionTransactions(binding.finalSubmissions[i]!, binding.graph)) if (row.txid === target.txid) {
    assert.equal(i, step.submissionStart, 'Controlled rejection was replayed or appears in later ancestry'); assert.equal(row.isTarget, true); assert.equal(binding.finalSubmissions[i]!.verdict, 'REJECTED')
  }
  return { verified: true as const, step, transaction, fee }
}
export async function verifyPermissionExtensionParentBindings(report: Report, anchor: NativePermissionCoverageReport, binding: { identity: string; globalSubmissions: Report['submissions']; finalSubmissions: Report['submissions']; storageTransactions: Map<string, Transaction>; graph: SubmissionGraphOptions; declaredNativePayments: string[]; readEvidence(name: string): Buffer }) {
  const child = await verifyPermissionExtension(report, anchor, binding.readEvidence, binding.identity), f = fixture()
  same(report.submissions, binding.globalSubmissions.slice(0, report.submissionWindow.endIndex)); same(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions); assert.equal(binding.graph.requireResolvedAncestors, true); same(binding.graph.trustedMinedRoot, { txid: f.txid, rawHex: f.rawHex }); assert.ok(binding.graph.resolvedTransactions instanceof Map)
  for (const row of report.storageTransactions) assert.equal(binding.storageTransactions.get(row.txid)?.toHex(), row.rawTxHex)
  const predicate = (id: string) => id.startsWith('concurrent-') ? 'permission-extension.allowance-boundaries.concurrent-cap' : id.startsWith('subset-') ? 'permission-extension.manifest-selection.subset-selected' : id.startsWith('unchecked-') ? 'permission-extension.manifest-selection.spending-unchecked' : id.startsWith('overcap-') ? 'permission-extension.standing-allowance.single-over-cap-deny' : `permission-extension.allowance-boundaries.${id.split('-')[0]}-accounting`
  const admission = await verifyObservedNativeTransactionBindings(report.steps.map(s => ({ id: s.id, method: s.method, args: s.args, result: s.outcome.value })), child.assertions, { storageTransactions: binding.storageTransactions, declaredNativePayments: binding.declaredNativePayments, fixture: f }, { rolePrefix: 'permission-extension', predicateFor: call => predicate(call.id), resolvedTransactions: new Map(binding.graph.resolvedTransactions) })
  const permitted = new Map<string, { step: Report['steps'][number]; transaction: Transaction; rejected: boolean }>()
  for (const s of report.steps) {
    if (s.id.endsWith('-recovery') || s.id.startsWith('concurrent-') && ['concurrent-a', 'concurrent-b'].includes(s.id)) {
      if (s.outcome.status !== 'fulfilled') continue
      assert.equal(child.assertions.find(x => x.id === predicate(s.id))?.result, 'PASS', 'An unqualified allowance cannot exempt a submitted payment')
      const tx = signedBytes(s.outcome.value); permitted.set(tx.id('hex'), { step: s, transaction: tx, rejected: false })
    }
    if (s.id === 'rejection-create' && s.outcome.status === 'rejected' && s.submissionEnd > s.submissionStart) {
      const rejected = await verifyPermissionExtensionControlledRejection(report, binding)
      permitted.set(rejected.transaction.id('hex'), { step: s, transaction: rejected.transaction, rejected: true })
    }
  }
  let checked = 0
  for (let i = report.submissionWindow.startIndex; i < binding.finalSubmissions.length; i++) for (const observed of observedSubmissionTransactions(binding.finalSubmissions[i]!, binding.graph)) {
    if (!observed.transaction.outputs.some(output => output.lockingScript.toHex() === coveragePaymentScript)) continue
    checked++; const allowed = permitted.get(observed.txid); assert.ok(allowed, 'Unapproved extended permission payment appears through final shutdown ancestry'); assert.equal(allowed.transaction.toHex(), observed.transaction.toHex())
    if (allowed.rejected) { assert.ok(observed.isTarget && i >= allowed.step.submissionStart && i < allowed.step.submissionEnd); assert.equal(binding.finalSubmissions[i]!.verdict, 'REJECTED', 'Rejected payment later reached an accepted path') }
    else if (observed.isTarget) assert.ok(i >= allowed.step.submissionStart && i < allowed.step.submissionEnd, 'Authorized payment replayed outside its original call')
  }
  return { verified: true as const, checkedFinalTransactionsAndAncestors: checked, admission, finalLedgerBound: true }
}
