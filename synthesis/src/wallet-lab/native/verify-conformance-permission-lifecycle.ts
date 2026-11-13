import {nativeProofResources} from './proof-resources.js'
import { verifyPermissionClick, verifyPermissionCallNonces } from './permission-click.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Beef, Certificate, KeyDeriver, P2PKH, PrivateKey, ProtoWallet, PublicKey, SymmetricKey, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'
import { canonicalJson } from '../../determinism.js'
import { permissionArgs, permissionProtocol } from './conformance-permissions-model.js'
import { lifecyclePermissionConfig as config, permissionLifecycleAssertionIds, permissionLifecycleOracle, permissionLifecycleOracleV2, type LifecyclePermissionStep, type NativePermissionLifecycleReport } from './conformance-permission-lifecycle-model.js'

const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const time = (value: string) => { const parsed = Date.parse(value); assert.ok(Number.isFinite(parsed)); return parsed }
const equal = (a: unknown, b: unknown) => assert.equal(canonicalJson(a), canonicalJson(b))
const forbiddenError = /timed? ?out|timeout|network|fetch failed|unsupported|not implemented|50[0-9]|message channel|not enough funds/i
const stepOrder = ['identity', 'setup-basket', 'setup-certificate', 'primary-protocol-before', 'alternate-protocol-before', 'basket-deny', 'basket-allow', 'basket-cached', 'certificate-deny', 'certificate-allow', 'certificate-cached', 'spending-deny', 'spending-allow', 'spending-second-deny', 'alternate-basket-allow', 'basket-after-single-deny', 'certificate-after-single-cached', 'basket-recovery-allow', 'basket-recovery-cached', 'basket-after-all-deny', 'certificate-after-all-deny', 'protocol-after-all', 'alternate-basket-after-all', 'alternate-protocol-after-all']

export function assertNoDeniedPermissionPayment(submissions: Array<{ txid: string; beefHex: string }>, script: string, satoshis: number): void {
  for (const row of submissions) {
    const bytes = [...Buffer.from(row.beefHex, 'hex')]
    let tx: Transaction
    try { tx = Transaction.fromAtomicBEEF(bytes) } catch { tx = Transaction.fromBinary(bytes) }
    assert.equal(tx.id('hex'), row.txid, 'Submission identity must match its retained body')
    assert.ok(!tx.outputs.some(output => output.satoshis === satoshis && output.lockingScript.toHex() === script), 'Denied customer payment must not be submitted; unrelated background transactions are retained')
  }
}

export async function evaluateNativePermissionLifecycle(report: NativePermissionLifecycleReport, readEvidence: (name: string) => Buffer, expectedIdentity: string) {
  const trustedClick = report.schema === 'tpnil-native-permission-lifecycle@2.0.0'
  const step = (id: string) => { const row = report.steps.find(row => row.id === id); assert.ok(row, `Missing native observation ${id}`); return row }
  const success = (id: string) => { const row = step(id); assert.equal(row.outcome.status, 'fulfilled', `${id}: ${row.outcome.error?.message ?? row.outcome.message ?? row.outcome.status}`); return row.outcome.value }
  const rejected = (id: string) => { const row = step(id); assert.equal(row.outcome.status, 'rejected'); assert.match(row.outcome.error?.message ?? '', /permission.*denied|denied by user|the user has denied the request for permission|no protocol permission token found/i); assert.ok(!forbiddenError.test(row.outcome.error!.message)); return row }
  const image = (value: any, expected: string) => {
    assert.equal(value.name, expected); const bytes = readEvidence(value.name)
    assert.equal(bytes.length, value.size); assert.ok(bytes.length > 8); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(createHash('sha256').update(bytes).digest('hex'), value.sha256)
  }
  const prompt = (id: string, category: 'basket' | 'certificate' | 'spending', decision: 'allow' | 'deny') => {
    const row = step(id); assert.equal(row.prompts.length, 1); const observed = row.prompts[0]!
    assert.equal(observed.url.startsWith(`chrome-extension://${report.extensionId}/prompt.html`), true)
    const lines = observed.body.split('\n').map(line => line.trim()).filter(Boolean), after = (label: string) => { assert.ok(lines.includes(label)); return lines[lines.indexOf(label) + 1] }
    assert.equal(lines[0], { basket: 'Basket Access', certificate: 'Certificate Access', spending: 'Spending Authorization' }[category])
    assert.equal(after('Origin'), new URL(row.origin).host)
    if (category === 'basket') assert.equal(after('Basket'), config.basket)
    if (category === 'certificate') { assert.equal(after('Cert Type'), config.certificateType); assert.equal(after('Fields'), 'name') }
    if (category === 'spending') {
      assert.equal(after('Reason'), row.args.description)
      const amount = Number(after('Amount')?.replaceAll(',', '').match(/^([0-9]+) satoshis$/)?.[1])
      const fee = Number(after('fee')?.match(/^Network fee \(([0-9]+) satoshis\)$/)?.[1])
      assert.equal(after('output'), `Public permission fixture recipient (${row.args.outputs[0].satoshis} satoshis)`)
      assert.ok(Number.isSafeInteger(fee) && fee >= 0); assert.equal(amount, row.args.outputs[0].satoshis + fee, 'Spending UI amount must equal the exact customer output plus its displayed fee')
    }
    assert.equal(observed.pendingBeforeDecision, true); assert.equal(observed.decision, decision); assert.equal(observed.button, decision === 'allow' ? 'Allow' : 'Deny')
    if (trustedClick) verifyPermissionClick(observed.trustedClick, observed, row)
    else {
      assert.equal(observed.trustedClick, undefined)
    assert.ok(time(row.startedAt) <= time(observed.observedAt) && time(observed.observedAt) <= time(observed.clickedAt) && time(observed.clickedAt) <= time(observed.clickCompletedAt) && time(observed.clickCompletedAt) <= time(row.endedAt))
    assert.ok(row.outcome.settledAt && time(row.outcome.settledAt) >= time(observed.clickedAt))
    }
    image(observed.screenshot, `conformance/permission-lifecycle-${id}-0.png`)
  }
  const mined = async (bytes: number[]) => {
    const tx = Transaction.fromAtomicBEEF(bytes)
    assert.ok(await tx.verify({ currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }))
    const root = (current: Transaction, depth = 0): boolean => { assert.ok(depth < nativeProofResources().maximumProofDepth); return current.id('hex') === fixture.txid || current.inputs.some(input => input.sourceTransaction && root(input.sourceTransaction, depth + 1)) }
    assert.ok(root(tx)); return tx
  }
  const transaction = async (role: 'setup-basket' | 'spending-allow') => {
    const rows = report.transactions.filter(row => row.role === role); assert.equal(rows.length, 1)
    const observed = success(role), tx = await mined(rows[0]!.atomicBeef)
    if (role === 'setup-basket') {
      assert.equal(step(role).method, 'createAction')
      equal(step(role).args, { description: 'TPNIL permission lifecycle basket fixture', outputs: [{ satoshis: config.basketAmount, lockingScript: '51', basket: config.basket, outputDescription: 'Permission lifecycle public fixture', customInstructions: 'tpnil:permission-lifecycle:1' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
    }
    equal(rows[0]!.atomicBeef, observed.tx); assert.equal(rows[0]!.txid, observed.txid); assert.equal(tx.id('hex'), observed.txid)
    const call = step(role), submissions = report.submissions.slice(call.submissionStart, call.submissionEnd).filter(row => row.txid === tx.id('hex'))
    assert.equal(submissions.length, 1); assert.equal(submissions[0]!.verdict, 'ACCEPTED_BY_NETWORK')
    const bytes = [...Buffer.from(submissions[0]!.beefHex, 'hex')]
    let submitted: Transaction
    try { submitted = Transaction.fromAtomicBEEF(bytes) } catch { submitted = Transaction.fromBinary(bytes) }
    assert.equal(submitted.toHex(), tx.toHex()); return tx
  }
  const basketArgs = (id: string) => { const row = step(id); assert.equal(row.method, 'listOutputs'); equal(row.args, { basket: config.basket, include: 'entire transactions', includeTags: true, includeCustomInstructions: true }) }
  const certificateArgs = (id: string) => {
    const row = step(id); assert.equal(row.method, 'proveCertificate')
    const provided = { ...report.certificate }; delete provided.masterKeyring
    equal(row.args, { certificate: provided, fieldsToReveal: ['name'], verifier: PrivateKey.fromHex(config.verifierKeyHex).toPublicKey().toString() })
  }
  const basket = async (id: string, cached = false) => {
    const row = step(id); assert.equal(row.method, 'listOutputs')
    equal(row.args, { basket: config.basket, include: 'entire transactions', includeTags: true, includeCustomInstructions: true })
    if (cached) assert.equal(row.prompts.length, 0)
    const result = success(id), created = await transaction('setup-basket')
    assert.equal(report.setupOutpoint, `${created.id('hex')}.0`)
    assert.equal(created.outputs[0]!.satoshis, config.basketAmount); assert.equal(created.outputs[0]!.lockingScript.toHex(), '51')
    const output = result.outputs.find((output: any) => output.outpoint.replace('_', '.') === report.setupOutpoint)
    assert.ok(output?.spendable); assert.equal(output.satoshis, config.basketAmount)
    const restored = await mined(Beef.fromBinary(result.BEEF).toBinaryAtomic(created.id('hex')))
    assert.equal(restored.toHex(), created.toHex())
  }
  const certificate = async (id: string, cached = false) => {
    const row = step(id); certificateArgs(id); if (cached) assert.equal(row.prompts.length, 0)
    assert.equal(row.args.certificate.subject, expectedIdentity); assert.equal(row.args.certificate.type, config.certificateType); assert.equal(row.args.certificate.serialNumber, config.certificateSerial)
    assert.equal(row.args.certificate.certifier, PrivateKey.fromHex(config.issuerKeyHex).toPublicKey().toString())
    equal(row.args.fieldsToReveal, ['name']); assert.equal(row.args.verifier, PrivateKey.fromHex(config.verifierKeyHex).toPublicKey().toString())
    const provided = { ...report.certificate }; delete provided.masterKeyring
    equal(row.args.certificate, provided)
    const acquired = step('setup-certificate'); assert.equal(acquired.method, 'acquireCertificate')
    equal(acquired.args, { ...report.certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: report.certificate.masterKeyring })
    equal(success('setup-certificate'), provided)
    const value = success(id); equal(Object.keys(value.keyringForVerifier), ['name'])
    const verifier = new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex))
    const parsed = VerifiableCertificate.fromCertificate(row.args.certificate, value.keyringForVerifier)
    assert.ok(await parsed.verify()); equal(await parsed.decryptFields(verifier), { name: config.fields.name })
    const key = await verifier.decrypt({ ciphertext: Utils.toArray(value.keyringForVerifier.name, 'base64'), ...Certificate.getCertificateFieldEncryptionDetails('name', config.certificateSerial), counterparty: expectedIdentity })
    assert.equal(key.plaintext.length, 32, 'Field revelation key must preserve all32 bytes')
    assert.equal(Utils.toUTF8(new SymmetricKey(key.plaintext).decrypt(Utils.toArray(row.args.certificate.fields.name, 'base64')) as number[]), config.fields.name)
  }
  const key = (id: string) => {
    const row = step(id); assert.equal(row.method, 'getPublicKey'); equal(row.args, permissionArgs(false)); assert.equal(row.prompts.length, 0)
    const expected = new KeyDeriver(PrivateKey.fromHex('01')).derivePublicKey([...permissionProtocol], 'origin-isolation', expectedIdentity, false).toString()
    assert.equal(success(id).publicKey, expected)
  }
  const paymentArgs = (id: string, second: boolean) => {
    const row = step(id); assert.equal(row.method, 'createAction')
    equal(row.args, { description: second ? 'TPNIL one-shot permission second payment' : 'TPNIL one-shot permission payment', outputs: [{ satoshis: second ? config.secondPaymentSatoshis : config.paymentSatoshis, lockingScript: report.paymentScript, outputDescription: 'Public permission fixture recipient' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
  }
  const deniedPayment = (id: string, second: boolean) => {
    paymentArgs(id, second); prompt(id, 'spending', 'deny'); const row = rejected(id)
    const satoshis = second ? config.secondPaymentSatoshis : config.paymentSatoshis
    const position = report.steps.indexOf(row), previous = report.steps[position - 1]!, next = report.steps[position + 1]!
    // Adjacent settled-call bounds include every inter-call gap. Moving either
    // denied-call endpoint cannot remove a matching submission from this check.
    assertNoDeniedPermissionPayment(report.submissions.slice(previous.submissionEnd, next.submissionStart), report.paymentScript!, satoshis)
    const approved = step('spending-allow')
    const allowedTxid = !second && approved.outcome.status === 'fulfilled' && report.transactions.some(tx => tx.role === 'spending-allow' && tx.txid === approved.outcome.value?.txid) ? approved.outcome.value.txid : undefined
    // Include delayed receipts anywhere in the complete module window. The one
    // legitimate later approval is exempt only by its exact returned txid and
    // its retained call window; transaction() independently verifies that body.
    for (let index = report.submissionWindow.startIndex; index < report.submissionWindow.endIndex; index++) {
      const receipt = report.submissions[index]!
      if (allowedTxid && receipt.txid === allowedTxid && index >= approved.submissionStart && index < approved.submissionEnd) continue
      assertNoDeniedPermissionPayment([receipt], report.paymentScript!, satoshis)
    }
  }
  const ui = (id: string) => { const rows = report.ui.filter(row => row.id === id); assert.equal(rows.length, 1); return rows[0] }
  const singleUi = () => {
    const row = ui('single-revoke'); assert.equal(row.origin, config.primary); assert.equal(row.pageUrl, `chrome-extension://${report.extensionId}/index.html`); assert.equal(row.cardHeading, new URL(config.primary).host)
    assert.equal(row.beforeBody.split('\n')[0], new URL(config.primary).host); assert.ok(!row.beforeBody.includes(new URL(config.alternate).host))
    equal(row.control, { detail: `Can access: ${config.basket}`, role: 'button', count: 1 }); assert.equal(row.afterDetailCount, 0)
    assert.ok(row.beforeBody.includes(`Can access: ${config.basket}`)); assert.ok(!row.afterBody.includes(`Can access: ${config.basket}`))
    assert.ok(time(step('alternate-basket-allow').endedAt) <= time(row.startedAt) && time(row.startedAt) <= time(row.clickedAt) && time(row.clickedAt) <= time(row.endedAt) && time(row.endedAt) <= time(step('basket-after-single-deny').startedAt))
    image(row.before, 'conformance/permission-lifecycle-single-before.png'); image(row.after, 'conformance/permission-lifecycle-single-after.png')
  }
  const originUi = () => {
    const row = ui('origin-revoke'); assert.equal(row.origin, config.primary); assert.equal(row.pageUrl, `chrome-extension://${report.extensionId}/index.html`); assert.equal(row.cardHeading, new URL(config.primary).host)
    assert.equal(row.beforeBody.split('\n')[0], new URL(config.primary).host); assert.ok(!row.beforeBody.includes(new URL(config.alternate).host))
    assert.equal(row.button, 'Revoke All Access'); assert.equal(row.confirmButton, 'Confirm'); assert.equal(row.afterOriginCardCount, 0)
    assert.ok(row.beforeBody.includes(`Can access: ${config.basket}`)); assert.ok(row.confirmationBody.includes(`Revoke all access for ${new URL(config.primary).host}? This revokes every permission granted to this app.`))
    assert.ok(time(step('basket-recovery-cached').endedAt) <= time(row.startedAt) && time(row.startedAt) <= time(row.clickedAt) && time(row.clickedAt) <= time(row.confirmedAt) && time(row.confirmedAt) <= time(row.endedAt) && time(row.endedAt) <= time(step('basket-after-all-deny').startedAt))
    image(row.before, 'conformance/permission-lifecycle-origin-before.png'); image(row.confirmation, 'conformance/permission-lifecycle-origin-confirm.png'); image(row.after, 'conformance/permission-lifecycle-origin-after.png')
  }
  const common = () => {
    if (trustedClick) { assert.equal(report.oracle, permissionLifecycleOracleV2); verifyPermissionCallNonces(report.steps) }
    else { assert.equal(report.schema, 'tpnil-native-permission-lifecycle@1.0.0'); assert.equal(report.oracle, permissionLifecycleOracle) }
    assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.interface, 'unchanged native CWI and visible Settings Permissions UI')
    equal(report.configuration, config); assert.equal(PublicKey.fromString(expectedIdentity).toString(), expectedIdentity); assert.equal(report.identity, expectedIdentity)
    assert.equal(step('identity').method, 'getPublicKey'); equal(step('identity').args, { identityKey: true }); assert.equal(success('identity').publicKey, expectedIdentity); assert.match(report.extensionId, /^[a-p]{32}$/)
    assert.ok(time(report.startedAt) <= time(report.endedAt)); assert.ok(report.steps.length <= stepOrder.length)
    for (const [index, row] of report.steps.entries()) {
      assert.equal(row.id, stepOrder[index]); const origin = row.id === 'identity' || row.id.startsWith('setup-') ? config.application : row.id.startsWith('alternate-') ? config.alternate : config.primary
      assert.equal(row.origin, origin); assert.equal(new URL(row.pageUrl).origin, origin)
      assert.ok(time(row.startedAt) <= time(row.endedAt)); if (index) { assert.ok(time(report.steps[index - 1]!.endedAt) <= time(row.startedAt)); assert.ok(report.steps[index - 1]!.submissionEnd <= row.submissionStart, 'Sequential submission windows cannot overlap or move backwards') }
      if (row.outcome.settledAt) assert.ok(time(row.startedAt) <= time(row.outcome.settledAt) && time(row.outcome.settledAt) <= time(row.endedAt))
      assert.ok(Number.isSafeInteger(row.submissionStart) && Number.isSafeInteger(row.submissionEnd) && row.submissionStart >= report.submissionWindow.startIndex && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionWindow.endIndex)
    }
    assert.equal(report.paymentScript, new P2PKH().lock(PrivateKey.fromHex(config.paymentRecipientKeyHex).toPublicKey().toAddress()).toHex())
    assert.equal(report.submissionWindow.endIndex, report.submissions.length)
    equal(report.submissionWindow.entries, report.submissions.slice(report.submissionWindow.startIndex).map((row, index) => ({ index: report.submissionWindow.startIndex + index, txid: row.txid, verdict: row.verdict, serializedHex: row.beefHex })))
  }
  const predicates: Array<() => void | Promise<void>> = [
    () => { basketArgs('basket-deny'); prompt('basket-deny', 'basket', 'deny'); rejected('basket-deny') },
    async () => { prompt('basket-allow', 'basket', 'allow'); await basket('basket-allow') },
    () => basket('basket-cached', true),
    () => { certificateArgs('certificate-deny'); prompt('certificate-deny', 'certificate', 'deny'); rejected('certificate-deny') },
    async () => { prompt('certificate-allow', 'certificate', 'allow'); await certificate('certificate-allow') },
    () => certificate('certificate-cached', true),
    () => deniedPayment('spending-deny', false),
    async () => { paymentArgs('spending-allow', false); prompt('spending-allow', 'spending', 'allow'); const tx = await transaction('spending-allow'); assert.equal(tx.outputs[0]!.satoshis, config.paymentSatoshis); assert.equal(tx.outputs[0]!.lockingScript.toHex(), report.paymentScript); const shownFee = Number(step('spending-allow').prompts[0]!.body.match(/Network fee \(([0-9]+) satoshis\)/)?.[1]); const actualFee = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0); assert.equal(shownFee, actualFee) },
    () => deniedPayment('spending-second-deny', true),
    singleUi,
    async () => { singleUi(); basketArgs('basket-after-single-deny'); prompt('basket-after-single-deny', 'basket', 'deny'); rejected('basket-after-single-deny'); prompt('basket-recovery-allow', 'basket', 'allow'); await basket('basket-recovery-allow'); await basket('basket-recovery-cached', true) },
    () => certificate('certificate-after-single-cached', true),
    originUi,
    () => { originUi(); basketArgs('basket-after-all-deny'); certificateArgs('certificate-after-all-deny'); prompt('basket-after-all-deny', 'basket', 'deny'); rejected('basket-after-all-deny'); prompt('certificate-after-all-deny', 'certificate', 'deny'); rejected('certificate-after-all-deny'); assert.equal(step('protocol-after-all').method, 'getPublicKey'); equal(step('protocol-after-all').args, permissionArgs(false)); assert.equal(step('protocol-after-all').prompts.length, 0); rejected('protocol-after-all') },
    async () => { key('primary-protocol-before'); key('alternate-protocol-before'); prompt('alternate-basket-allow', 'basket', 'allow'); await basket('alternate-basket-allow'); await basket('alternate-basket-after-all', true); key('alternate-protocol-after-all') },
    () => { assert.equal(report.cleanup.applicationPagesClosed, true); assert.equal(report.cleanup.ownedPromptsClosed, true); assert.equal(report.cleanup.settingsPageClosed, true) }
  ]
  return await Promise.all(predicates.map(async (predicate, index) => {
    try { common(); await predicate(); return { id: permissionLifecycleAssertionIds[index]!, result: 'PASS' as const, detail: 'Independent public permission lifecycle predicate verified.' } }
    catch (error) { return { id: permissionLifecycleAssertionIds[index]!, result: 'FAIL' as const, detail: error instanceof Error ? error.message : String(error) } }
  }))
}

export async function verifyNativePermissionLifecycle(report: NativePermissionLifecycleReport, readEvidence: (name: string) => Buffer, expectedIdentity: string) {
  const assertions = await evaluateNativePermissionLifecycle(report, readEvidence, expectedIdentity)
  equal(report.assertions.map(({ id, result }) => ({ id, result })), assertions.map(({ id, result }) => ({ id, result })))
  const result = assertions.every(row => row.result === 'PASS') ? 'PASS' : 'FAIL'; assert.equal(report.result, result)
  if (result === 'PASS') { equal(report.transactions.map(row => row.role), ['setup-basket', 'spending-allow']); equal(report.errors, []) }
  return { verified: true, result, assertions }
}
