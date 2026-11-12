// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Beef, BigNumber, KeyDeriver, Point, PrivateKey, ProtoWallet, PublicKey, Schnorr, Transaction, VerifiableCertificate } from '@bsv/sdk'
import { canonicalJson } from '../../determinism.js'
import { verifyPermissionCallNonces, verifyPermissionClick, type PermissionClickReceipt } from './permission-click.js'
import { coverageSpendingSummary } from './permission-coverage-observer.js'
import { assertNoDeniedPermissionPayment } from './verify-conformance-permission-lifecycle.js'
import { coverageCertificateSerial, coverageCertificateType, coverageCategoryCall, coverageManifestForRevision, coveragePaymentArgs, coveragePaymentScript, coveragePeer, coverageVerifier, permissionCoverageCategories, permissionCoverageConfig as config, permissionCoverageSelection, type CoverageRevocation, type CoverageStep, type NativePermissionCoverageReport, type PermissionCoverageCategory } from './conformance-permission-coverage-model.js'

const funding = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const same = (left: unknown, right: unknown) => assert.equal(canonicalJson(left), canonicalJson(right))
const time = (value: string) => { const parsed = Date.parse(value); assert.ok(Number.isFinite(parsed), `Invalid observation time ${value}`); return parsed }
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const deniedKinds = { 'allowance-overflow': 'overflow', 'allowance-alternate': 'alternate', 'allowance-revoked': 'revoked', 'allowance-revoked-restart': 'revokedRestart' } as const
const forbidden = /timed? ?out|timeout|unsupported|not implemented|fetch failed|network error|50[0-9]|message channel|not enough funds|insufficient funds|invalid parameter/i

/** Apply to the module prefix or a separately bound final provider ledger.
 * Every denied marker has its own amount and script; no successful payment is
 * exempted by amount or by a caller-supplied transaction identity. */
export function assertNoCoverageDeniedPayments(submissions: Array<{ txid: string; beefHex: string }>) {
  for (const kind of Object.values(deniedKinds)) assertNoDeniedPermissionPayment(submissions, coveragePaymentScript, config.paymentAmounts[kind])
}

export function verifyCoverageRevocationClick(receipt: PermissionClickReceipt, row: CoverageRevocation, button: string, body: string) {
    assert.equal(receipt.schema, 'tpnil-native-permission-click@2'); assert.equal(receipt.callNonce, row.requestNonce); assert.equal(receipt.popupUrl, row.pageUrl); assert.equal(receipt.button, button); assert.match(receipt.nonce, /^[a-f0-9-]{36}$/)
    const event = receipt.dispatch; assert.ok(event); assert.equal(event.nonce, receipt.nonce); assert.equal(event.url, row.pageUrl); assert.equal(event.button, button); assert.equal(event.body, body); assert.equal(event.type, 'click'); assert.equal(event.isTrusted, true); assert.equal(event.visible, true); assert.equal(event.disabled, false); assert.equal(event.mouseButton, 0); assert.equal(event.eventPhase, 1); assert.equal(event.expectedPage, true); assert.equal(event.expectedMainFrame, true)
    const ordered = [row.startedAt, receipt.armedAt, receipt.attemptStartedAt, event.dispatchedAt, event.receivedAt, receipt.completedAt, row.endedAt].map(time); assert.ok(ordered.every((value, i) => !i || ordered[i - 1]! <= value)); assert.equal(receipt.automation.status, 'fulfilled')
  }

/** This authenticates the prelude's content and timing; the parent must still
 * join its exact rows to the provider snapshot and independently admitted roots. */
export function verifyPermissionFundingPrelude(report: NativePermissionCoverageReport, readEvidence: (name: string) => Buffer, identity: string) {
  assert.ok(report.fundingPrelude, 'Fresh managed funding prelude is required')
  assert.equal(report.fundingPrelude.evidencePath, 'conformance/permission-prelude.json')
  const bytes = readEvidence(report.fundingPrelude.evidencePath); assert.equal(sha(bytes), report.fundingPrelude.sha256)
  const p = JSON.parse(bytes.toString()); assert.equal(p.schema, 'tpnil-native-permission-prelude@1.0.0'); assert.equal(p.prerequisite, 'fresh-managed-funding'); assert.equal(p.identity, identity); assert.equal(p.outputObservationSequence, 0)
  assert.ok(time(p.startedAt) <= time(p.endedAt) && time(p.endedAt) <= time(report.startedAt), 'Fresh funding snapshot must precede permission execution')
  assert.ok(Number.isSafeInteger(p.submissionStart) && p.submissionStart >= 0); assert.equal(p.submissionEnd, p.submissionStart); assert.equal(p.submissionEnd, report.submissionWindow.startIndex)
  assert.ok(Array.isArray(p.initialOutputs)); assert.equal(p.initialOutputs.length, 3); assert.equal(new Set(p.initialOutputs.map((o: any) => o.outpoint)).size, 3)
  for (const output of p.initialOutputs) { assert.match(output.outpoint, /^[0-9a-f]{64}\.[0-9]+$/); assert.equal(output.satoshis, 10000); assert.equal(output.spendable, true); assert.equal(output.basketName, 'default'); assert.match(output.lockingScript, /^76a914[0-9a-f]{40}88ac$/) }
  return p
}

export interface PermissionCoverageContextOptions { profile: 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' }
export async function evaluateNativePermissionCoverage(report: NativePermissionCoverageReport, readEvidence: (name: string) => Buffer, expectedIdentity: string, options?: PermissionCoverageContextOptions) {
  const revision = report.oracle === 'tpnil-native-permission-coverage-oracle@1.0.0' ? 1 : report.oracle === 'tpnil-native-permission-coverage-oracle@2.0.0' ? 2 : report.oracle === 'tpnil-native-permission-coverage-oracle@3.0.0' ? 3 : report.oracle === 'tpnil-native-permission-coverage-oracle@4.0.0' ? 4 : report.oracle === 'tpnil-native-permission-coverage-oracle@5.0.0' ? 5 : undefined
  assert.ok(revision, 'Unknown permission coverage oracle')
  if (options) { assert.ok(['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0'].includes(options.profile)); assert.equal(revision, 5, 'Expanded browser prefix requires permission oracle5') }
  const { config, oracle, policy, policySha256, assertionIds, stepOrder } = permissionCoverageSelection(revision)
  const coverageManifest = coverageManifestForRevision(revision)
  const step = (id: string) => { const rows = report.steps.filter(row => row.id === id); assert.equal(rows.length, 1, `Exactly one ${id} observation required`); return rows[0]! }
  const success = (id: string) => { const row = step(id); assert.equal(row.outcome.status, 'fulfilled', `${id}: ${row.outcome.error?.message ?? row.outcome.message ?? row.outcome.status}`); assert.equal(row.outcome.error, undefined); return row.outcome.value }
  const image = (value: any, expectedName: string) => {
    assert.equal(value.name, expectedName); const bytes = readEvidence(value.name)
    assert.equal(bytes.length, value.size); assert.ok(bytes.length > 8); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(sha(bytes), value.sha256)
  }
  const originFor = (id: string) => id === 'identity' || id.startsWith('setup-') ? config.application : id.endsWith('-alternate-deny') || id === 'allowance-alternate' ? config.alternate : id.startsWith('manifest-') || id.startsWith('allowance-') ? config.allowance : config.primary
  const common = () => {
    if (revision === 5) verifyPermissionFundingPrelude(report, readEvidence, expectedIdentity)
    else assert.equal(report.fundingPrelude, undefined, 'Legacy permission reports cannot claim a new funding prerequisite')
    assert.equal(report.schema, 'tpnil-native-permission-coverage@1.0.0'); assert.equal(report.oracle, oracle); assert.equal(report.policySha256, policySha256)
    assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false); same(report.remainingCoverage, policy.remainingCoverage)
    assert.equal(report.identity, expectedIdentity); assert.equal(PublicKey.fromString(expectedIdentity).toString(), expectedIdentity); assert.match(report.extensionId, /^[a-p]{32}$/)
    same(report.steps.map(row => row.id), stepOrder); verifyPermissionCallNonces(report.steps)
    assert.ok(time(report.startedAt) <= time(report.endedAt)); assert.equal(report.submissionWindow.endIndex, report.submissions.length)
    assert.ok(Number.isSafeInteger(report.submissionWindow.startIndex) && report.submissionWindow.startIndex >= 0 && report.submissionWindow.startIndex <= report.submissionWindow.endIndex)
    for (const [index, row] of report.steps.entries()) {
      assert.equal(row.origin, originFor(row.id)); assert.equal(new URL(row.pageUrl).origin, row.origin)
      assert.ok(time(report.startedAt) <= time(row.startedAt) && time(row.startedAt) <= time(row.endedAt) && time(row.endedAt) <= time(report.endedAt))
      if (index) { assert.ok(time(report.steps[index - 1]!.endedAt) <= time(row.startedAt)); assert.ok(report.steps[index - 1]!.submissionEnd <= row.submissionStart) }
      assert.ok(Number.isSafeInteger(row.submissionStart) && Number.isSafeInteger(row.submissionEnd)); assert.ok(row.submissionStart >= report.submissionWindow.startIndex && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionWindow.endIndex)
      if (row.outcome.settledAt) assert.ok(time(row.startedAt) <= time(row.outcome.settledAt) && time(row.outcome.settledAt) <= time(row.endedAt))
    }
    assert.equal(step('identity').method, 'getPublicKey'); same(step('identity').args, { identityKey: true }); assert.equal(success('identity').publicKey, expectedIdentity)
  }
  const prompt = (id: string, decision: 'allow' | 'deny', category?: PermissionCoverageCategory | 'spending' | 'grouped') => {
    const row = step(id); assert.equal(row.prompts.length, 1, `${id} must have exactly one visible decision`)
    const p = row.prompts[0]!
    assert.ok(p.url.startsWith(`chrome-extension://${report.extensionId}/prompt.html`)); assert.equal(p.pendingBeforeDecision, true); assert.equal(p.decision, decision)
    const lines = p.body.split('\n').map(line => line.trim()).filter(Boolean)
    const after = (label: string) => { assert.ok(lines.includes(label), `Missing prompt label ${label}`); return lines[lines.indexOf(label) + 1] }
    const grouped = lines[0] === 'Permission Request'
    assert.equal(p.button, grouped ? decision === 'allow' ? 'Allow Selected' : 'Deny All' : decision === 'allow' ? 'Allow' : 'Deny')
    if (grouped) {
      assert.ok(category === 'grouped' || category === 'spending' && id.includes('revoked'))
      assert.ok(p.body.replace(/\s+/g, ' ').includes(`${new URL(row.origin).host} is requesting the following permissions`))
      assert.ok(p.body.includes(`${config.allowanceSatoshis} satoshis`)); assert.ok(p.body.includes(config.basket)); assert.ok(p.body.includes(coverageCertificateType)); assert.ok(p.body.includes(config.protocol[1]))
    } else {
      assert.equal(after('Origin'), new URL(row.origin).host)
      if (category === 'basket') { assert.equal(lines[0], 'Basket Access'); assert.equal(after('Basket'), config.basket) }
      else if (category === 'certificate') { assert.equal(lines[0], 'Certificate Access'); assert.equal(after('Cert Type'), coverageCertificateType); assert.equal(after('Fields'), 'name') }
      else if (category === 'spending') { assert.equal(lines[0], 'Spending Authorization'); assert.equal(after('Reason'), row.args.description); assert.ok(p.body.includes(`Native coverage allowance recipient (${row.args.outputs[0].satoshis} satoshis)`)) }
      else {
        assert.equal(lines[0], 'Protocol Permission')
        const protocol = category === 'counterparty-linkage' ? `counterparty key linkage revelation ${coveragePeer}` : category === 'specific-linkage' ? `specific key linkage revelation ${config.linkageProtocol[1]} ${config.linkageKeyID}` : config.protocol[1]
        assert.equal(after('Protocol'), protocol); assert.equal(after('Counterparty'), category === 'protocol' ? coveragePeer : coverageVerifier)
      }
    }
    verifyPermissionClick(p.trustedClick, p, row); image(p.screenshot, `conformance/coverage-${id}-0.png`)
    return p
  }
  const rejected = (id: string, category: PermissionCoverageCategory | 'spending') => {
    const row = step(id); assert.equal(row.outcome.status, 'rejected'); assert.equal(row.outcome.value, undefined)
    assert.match(row.outcome.error?.message ?? '', /permission.*denied|denied by user|user has denied|no user consent/i); assert.ok(!forbidden.test(row.outcome.error!.message))
    prompt(id, 'deny', category); return row
  }
  const mined = async (bytes: number[]) => {
    const tx = Transaction.fromAtomicBEEF(bytes)
    assert.ok(await tx.verify({ currentHeight: async () => funding.fundingHeight + funding.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === funding.merkleRoot && height === funding.fundingHeight }))
    const rooted = (current: Transaction, depth = 0): boolean => { assert.ok(depth < 48); return current.id('hex') === funding.txid || current.inputs.some(input => input.sourceTransaction && rooted(input.sourceTransaction, depth + 1)) }
    assert.ok(rooted(tx), 'Native transaction must descend from the admitted mined reserve'); return tx
  }
  const txCache = new Map<string, Promise<Transaction>>()
  const transaction = (role: string) => {
    if (!txCache.has(role)) txCache.set(role, (async () => {
      const rows = report.transactions.filter(row => row.role === role); assert.equal(rows.length, 1)
      const row = step(role), value = success(role), tx = await mined(rows[0]!.atomicBeef)
      assert.equal(row.method, 'createAction'); same(rows[0]!.atomicBeef, value.tx); assert.equal(rows[0]!.txid, value.txid); assert.equal(tx.id('hex'), value.txid)
      const submissions = report.submissions.slice(row.submissionStart, row.submissionEnd).filter(submitted => submitted.txid === value.txid)
      assert.equal(submissions.length, 1); assert.equal(submissions[0]!.verdict, 'ACCEPTED_BY_NETWORK')
      const bytes = [...Buffer.from(submissions[0]!.beefHex, 'hex')]; let submitted: Transaction
      try { submitted = Transaction.fromAtomicBEEF(bytes) } catch { submitted = Transaction.fromBinary(bytes) }
      assert.equal(submitted.toHex(), tx.toHex())
      if (role === 'setup-basket') same(row.args, { description: 'TPNIL permission coverage basket fixture', outputs: [{ satoshis: config.basketAmount, lockingScript: '51', basket: config.basket, outputDescription: 'Native permission coverage fixture', customInstructions: 'tpnil:permission-coverage:1' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
      else {
        const kind = role === 'allowance-first' ? 'first' : role === 'allowance-second' ? 'second' : role === 'allowance-third' && revision >= 3 ? 'third' : undefined
        assert.ok(kind, `Unknown accepted allowance role ${role}`); same(row.args, coveragePaymentArgs(kind, revision))
      }
      assert.equal(tx.outputs[0]!.satoshis, row.args.outputs[0].satoshis); assert.equal(tx.outputs[0]!.lockingScript.toHex(), row.args.outputs[0].lockingScript)
      return tx
    })())
    return txCache.get(role)!
  }
  const categoryArgs = (category: PermissionCoverageCategory, id: string) => { const call = coverageCategoryCall(category, report.certificate), row = step(id); assert.equal(row.method, call.method); same(row.args, call.args) }
  const positive = async (category: PermissionCoverageCategory, id: string, cached = false) => {
    categoryArgs(category, id); if (cached) assert.equal(step(id).prompts.length, 0, `${id} must settle without a new grant`)
    const value = success(id)
    if (category === 'protocol') {
      const expected = new KeyDeriver(PrivateKey.fromHex(config.peerKeyHex)).derivePublicKey(config.protocol, config.keyID, expectedIdentity, false).toString(); assert.equal(value.publicKey, expected)
    } else if (category === 'basket') {
      const tx = await transaction('setup-basket'); assert.equal(report.setupOutpoint, `${tx.id('hex')}.0`)
      const output = value.outputs.find((output: any) => output.outpoint.replace('_', '.') === report.setupOutpoint)
      assert.ok(output?.spendable); assert.equal(output.satoshis, config.basketAmount)
      const restored = await mined(Beef.fromBinary(value.BEEF).toBinaryAtomic(tx.id('hex'))); assert.equal(restored.toHex(), tx.toHex())
    } else if (category === 'certificate') {
      const certificate = report.certificate
      assert.equal(certificate.revocationOutpoint, report.setupOutpoint); assert.equal(certificate.subject, expectedIdentity); assert.equal(certificate.type, coverageCertificateType); assert.equal(certificate.serialNumber, coverageCertificateSerial); assert.equal(certificate.certifier, PrivateKey.fromHex(config.issuerKeyHex).toPublicKey().toString())
      assert.equal(step('setup-certificate').method, 'acquireCertificate'); same(step('setup-certificate').args, { ...certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: report.certificateMasterKeyring }); same(success('setup-certificate'), certificate)
      same(Object.keys(value.keyringForVerifier), ['name']); const verified = VerifiableCertificate.fromCertificate(certificate, value.keyringForVerifier)
      assert.ok(await verified.verify()); same(await verified.decryptFields(new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex))), { name: config.fields.name })
    } else {
      const verifier = new ProtoWallet(PrivateKey.fromHex(config.verifierKeyHex)), peer = PrivateKey.fromHex(config.peerKeyHex)
      assert.equal(value.prover, expectedIdentity); assert.equal(value.counterparty, coveragePeer); assert.equal(value.verifier, coverageVerifier)
      if (category === 'counterparty-linkage') {
        assert.ok(time(step(id).startedAt) <= time(value.revelationTime) && time(value.revelationTime) <= time(step(id).endedAt))
        const args = { protocolID: [2, 'counterparty linkage revelation'] as [2, string], keyID: value.revelationTime, counterparty: expectedIdentity }
        const clear = (await verifier.decrypt({ ...args, ciphertext: value.encryptedLinkage })).plaintext
        same(clear, PublicKey.fromString(expectedIdentity).mul(peer).encode(true))
        const proof = (await verifier.decrypt({ ...args, ciphertext: value.encryptedLinkageProof })).plaintext
        assert.equal(proof.length, 98); assert.ok(new Schnorr().verifyProof(PublicKey.fromString(expectedIdentity), peer.toPublicKey(), Point.fromDER(clear), { R: Point.fromDER(proof.slice(0, 33)), SPrime: Point.fromDER(proof.slice(33, 66)), z: new BigNumber(proof.slice(66)) }))
      } else {
        assert.equal(value.proofType, 0)
        const clear = (await verifier.decrypt({ protocolID: [2, `specific linkage revelation ${config.linkageProtocol[0]} ${config.linkageProtocol[1]}`], keyID: config.linkageKeyID, counterparty: expectedIdentity, ciphertext: value.encryptedLinkage })).plaintext
        same(clear, new ProtoWallet(peer).keyDeriver!.revealSpecificSecret(expectedIdentity, config.linkageProtocol, config.linkageKeyID))
      }
    }
  }
  const restarts = () => {
    assert.equal(report.restarts.length, 2)
    const contexts = JSON.parse(readEvidence('native-browser-contexts.json').toString()); assert.equal(contexts.schema, 'tpnil-native-browser-contexts@1'); assert.equal(contexts.contexts.length, options ? 5 : 3); if (options) contexts.contexts = contexts.contexts.slice(0, 3)
    const profileBinding = contexts.contexts[0].profileBinding; assert.match(profileBinding, /^[a-f0-9]{64}$/)
    const boundaries = [['allowance-first', 'protocol-restart'], ['allowance-revoked', 'protocol-revoked-restart']]
    for (const [index, receipt] of report.restarts.entries()) {
      assert.equal(receipt.schema, 'tpnil-native-browser-restart@1'); assert.equal(receipt.sequence, index + 1); assert.equal(receipt.profileBinding, profileBinding); assert.equal(receipt.extensionId, report.extensionId); assert.equal(receipt.identity, expectedIdentity); assert.equal(receipt.version, 'yours-wallet-5.1.1'); assert.ok(receipt.oldPageCount > 0); assert.equal(receipt.oldPagesClosed, true)
      same(contexts.contexts[index + 1].restart, receipt); assert.equal(contexts.contexts[index].closedAt, receipt.closedAt); assert.equal(contexts.contexts[index + 1].openedAt, receipt.openedAt)
      const ordered = [step(boundaries[index]![0]!).endedAt, receipt.startedAt, receipt.closedAt, receipt.openedAt, receipt.unlockedAt, receipt.endedAt, step(boundaries[index]![1]!).startedAt].map(time)
      assert.ok(ordered.every((value, i) => !i || ordered[i - 1]! <= value))
      assert.equal(receipt.sandboxEvidence, `native-sandbox-restart-${index + 1}.txt`)
      const sandbox = readEvidence(receipt.sandboxEvidence!).toString(); assert.match(sandbox, /PID namespaces\s+Yes/); assert.match(sandbox, /Seccomp-BPF sandbox\s+Yes/)
      const screenshot = readEvidence(`conformance/restart-${index + 1}-unlocked.png`); assert.equal(screenshot.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    }
  }
  const revocations = () => {
    same(report.revocations.map(row => row.id), ['revoke-primary', 'revoke-allowance'])
    const nonces = new Set<string>()
    for (const [index, row] of report.revocations.entries()) {
      assert.equal(row.origin, index ? config.allowance : config.primary); assert.equal(row.pageUrl, `chrome-extension://${report.extensionId}/index.html`); assert.match(row.requestNonce, /^[a-f0-9-]{36}$/)
      assert.equal(row.cardBody.split('\n')[0], new URL(row.origin).host); assert.ok(row.cardBody.includes(config.basket)); assert.ok(row.cardBody.includes(config.protocol[1]))
      if (revision >= 2) { assert.ok(row.beforeBody.includes(row.cardBody)); if (index) assert.ok(coverageSpendingSummary(row.cardBody, config.allowanceSatoshis), 'Standing allowance monthly usage must be visible before revocation') }
      assert.ok(row.confirmationBody.includes(`Revoke all access for ${new URL(row.origin).host}? This revokes every permission granted to this app.`)); assert.equal(row.afterOriginCardCount, 0)
      verifyCoverageRevocationClick(row.revoke, row, 'Revoke All Access', row.beforeBody); verifyCoverageRevocationClick(row.confirm, row, 'Confirm', row.confirmationBody); assert.ok(time(row.revoke.completedAt) <= time(row.confirm.attemptStartedAt))
      for (const nonce of [row.requestNonce, row.revoke.nonce, row.confirm.nonce]) { assert.ok(!nonces.has(nonce)); nonces.add(nonce) }
      for (const kind of ['before', 'confirmation', 'after'] as const) image(row[kind], `conformance/coverage-${row.id}-${kind}.png`)
      assert.ok(time(step('allowance-alternate').endedAt) <= time(row.startedAt) && time(row.endedAt) <= time(step('protocol-revoked').startedAt))
      if (index) assert.ok(time(report.revocations[index - 1]!.endedAt) <= time(row.startedAt))
    }
  }
  const manifest = async () => {
    same(report.manifest.value, coverageManifest); assert.equal(report.manifest.sha256, sha(Buffer.from(canonicalJson(coverageManifest))))
    assert.ok(report.manifest.requests.length > 0); assert.ok(report.manifest.requests.some(row => time(step('manifest-grant').startedAt) <= time(row.servedAt) && time(row.servedAt) <= time(step('manifest-grant').endedAt)))
    for (const row of report.manifest.requests) { assert.equal(row.method, 'GET'); assert.equal(row.path, '/manifest.json'); assert.equal(row.responseSha256, report.manifest.sha256); assert.ok(time(report.startedAt) <= time(row.servedAt) && time(row.servedAt) <= time(report.endedAt)) }
    const row = step('manifest-grant'); assert.equal(row.method, 'waitForAuthentication'); same(row.args, {}); assert.equal(success(row.id).authenticated, true)
    const p = prompt(row.id, 'allow', 'grouped'); assert.equal(p.selections.length, 1)
    const selection = p.selections[0]!, event = selection.dispatch; assert.ok(event); assert.equal(selection.callNonce, row.requestNonce); assert.match(selection.nonce, /^[a-f0-9-]{36}$/); assert.equal(selection.url, p.url); assert.equal(selection.before, false); assert.equal(selection.after, true); assert.match(selection.label, /spend up to/); assert.ok(selection.label.includes(`${config.allowanceSatoshis} satoshis`))
    assert.equal(event.nonce, selection.nonce); assert.equal(event.label, selection.label); assert.equal(event.url, p.url); assert.equal(event.type, 'change'); assert.equal(event.checked, true); assert.equal(event.isTrusted, true); assert.equal(event.expectedPage, true); assert.equal(event.expectedMainFrame, true)
    const ordered = [row.startedAt, selection.startedAt, event.dispatchedAt, event.receivedAt, selection.endedAt, p.clickedAt].map(time); assert.ok(ordered.every((value, i) => !i || ordered[i - 1]! <= value))
    for (const category of ['protocol', 'basket', 'certificate'] as const) await positive(category, `manifest-${category}`, true)
  }
  const spent = async (role: 'allowance-first' | 'allowance-second' | 'allowance-third') => {
    assert.equal(step(role).prompts.length, 0); const tx = await transaction(role)
    const fee = tx.inputs.reduce((total, input) => total + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((total, output) => total + output.satoshis!, 0)
    assert.ok(Number.isSafeInteger(fee) && fee >= 0); return tx.outputs[0]!.satoshis! + fee
  }
  const denyPayment = (id: keyof typeof deniedKinds) => { same(step(id).args, coveragePaymentArgs(deniedKinds[id], revision)); assert.equal(step(id).method, 'createAction'); rejected(id, 'spending'); assertNoCoverageDeniedPayments(report.submissions.slice(report.submissionWindow.startIndex)) }
  const predicates: Array<() => unknown | Promise<unknown>> = [
    ...permissionCoverageCategories.map(category => async () => { prompt(`${category}-grant`, 'allow', category); await positive(category, `${category}-grant`); await positive(category, `${category}-cached`, true) }),
    ...permissionCoverageCategories.map(category => () => { categoryArgs(category, `${category}-alternate-deny`); rejected(`${category}-alternate-deny`, category) }),
    restarts,
    ...permissionCoverageCategories.map(category => async () => { restarts(); await positive(category, `${category}-restart`, true) }),
    revocations,
    ...permissionCoverageCategories.map(category => () => { restarts(); revocations(); for (const suffix of ['revoked', 'revoked-restart']) { categoryArgs(category, `${category}-${suffix}`); rejected(`${category}-${suffix}`, category) } }),
    manifest,
    async () => { await manifest(); restarts(); const first = await spent('allowance-first'), second = await spent('allowance-second'); assert.ok(first > 0 && first + second <= config.allowanceSatoshis) },
    ...(revision >= 3 ? [async () => { await manifest(); restarts(); const total = await spent('allowance-first') + await spent('allowance-second') + await spent('allowance-third'); assert.equal(config.allowanceSatoshis, revision === 4 ? 114 : 100); assert.equal(total, config.allowanceSatoshis, `The three signed payments including actual fees must reach the fixed${config.allowanceSatoshis}-satoshi cap exactly`); revocations(); same(coverageSpendingSummary(report.revocations[1]!.cardBody, config.allowanceSatoshis), { cap: config.allowanceSatoshis, spent: total, remaining: 0 }) }] : []),
    async () => { const first = await spent('allowance-first'), second = await spent('allowance-second'), third = revision >= 3 ? await spent('allowance-third') : 0; assert.ok(config.paymentAmounts.overflow < config.allowanceSatoshis); assert.ok(first + second + third <= config.allowanceSatoshis && first + second + third + config.paymentAmounts.overflow > config.allowanceSatoshis); denyPayment('allowance-overflow') },
    () => denyPayment('allowance-alternate'),
    () => { revocations(); restarts(); denyPayment('allowance-revoked'); denyPayment('allowance-revoked-restart') },
    () => { same(report.cleanup, { pagesClosed: true, settingsClosed: true, routeUnregistered: true }); same(report.errors, []); same(report.transactions.map(row => row.role), ['setup-basket', 'allowance-first', 'allowance-second', ...(revision >= 3 ? ['allowance-third'] : [])]) }
  ]
  assert.equal(predicates.length, assertionIds.length)
  return await Promise.all(predicates.map(async (predicate, index) => {
    try { common(); await predicate(); return { id: assertionIds[index]!, result: 'PASS' as const, detail: 'Declared native permission case independently verified from public results, trusted UI, restart receipts and retained transactions.' } }
    catch (error) { return { id: assertionIds[index]!, result: 'FAIL' as const, detail: error instanceof Error ? error.message : String(error) } }
  }))
}

export async function verifyNativePermissionCoverage(report: NativePermissionCoverageReport, readEvidence: (name: string) => Buffer, expectedIdentity: string, options?: PermissionCoverageContextOptions) {
  const assertions = await evaluateNativePermissionCoverage(report, readEvidence, expectedIdentity, options)
  same(report.assertions.map(({ id, result }) => ({ id, result })), assertions.map(({ id, result }) => ({ id, result })))
  const result = assertions.every(row => row.result === 'PASS') ? 'PASS' : 'FAIL'; assert.equal(report.result, result)
  return { verified: true, result, assertions }
}
