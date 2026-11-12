import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { Beef, KeyDeriver, LockingScript, MasterCertificate, P2PKH, PrivateKey, ProtoWallet, Transaction } from '@bsv/sdk'
import { canonicalJson } from '../src/determinism.js'
import { issueFixtureCertificateForSubject } from '../src/wallet-lab/certificate-fixture.js'
import { coverageCategoryCall, coverageCertificateSerial, coverageCertificateType, coverageManifest, coveragePaymentArgs, coveragePaymentScript, coveragePeer, coverageStepOrder, coverageVerifier, permissionCoverageAssertionIds, permissionCoverageCategories, permissionCoverageConfig as config, permissionCoverageOracle, permissionCoveragePolicy, permissionCoveragePolicySha256 } from '../src/wallet-lab/native/conformance-permission-coverage-model.js'
import { assertNoCoverageDeniedPayments, evaluateNativePermissionCoverage, verifyNativePermissionCoverage } from '../src/wallet-lab/native/verify-conformance-permission-coverage.js'

// LAB_SELF_TEST_ONLY. Constructed adversarial observer records exercise the
// verifier; only the crypto and transaction bytes below are actual SDK results.
// These records are never archived as native/physical execution evidence.
const now = () => new Date().toISOString(), sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const nativeKey = PrivateKey.fromHex('63'.repeat(32)), native = new ProtoWallet(nativeKey), identity = nativeKey.toPublicKey().toString(), extensionId = 'a'.repeat(32)
const artifacts = new Map<string, Buffer>()
const read = (name: string) => { const bytes = artifacts.get(name); if (!bytes) throw new Error(`Missing fixture ${name}`); return bytes }
let original: any
const step = (r: any, id: string) => r.steps.find((row: any) => row.id === id)
const png = (name: string) => { const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex'); artifacts.set(name, bytes); return { name, size: bytes.length, sha256: sha(bytes) } }
function click(url: string, body: string, button: string, callNonce: string, at: string) {
  const nonce = randomUUID()
  return { schema: 'tpnil-native-permission-click@2', nonce, callNonce, popupUrl: url, button, armedAt: at, attemptStartedAt: at, completedAt: at, automation: { status: 'fulfilled', endedAt: at }, dispatch: { nonce, url, body, button, type: 'click', isTrusted: true, visible: true, disabled: false, mouseButton: 0, eventPhase: 1, dispatchedAt: at, receivedAt: at, expectedPage: true, expectedMainFrame: true } }
}
function prompt(row: any, category: string, decision: string, grouped = false) {
  const origin = new URL(row.origin).host, at = row.startedAt
  const title = category === 'basket' ? 'Basket Access' : category === 'certificate' ? 'Certificate Access' : category === 'spending' ? 'Spending Authorization' : 'Protocol Permission'
  const protocol = category === 'counterparty-linkage' ? `counterparty key linkage revelation ${coveragePeer}` : category === 'specific-linkage' ? `specific key linkage revelation ${config.linkageProtocol[1]} ${config.linkageKeyID}` : config.protocol[1]
  const detail = category === 'basket' ? `Basket\n${config.basket}` : category === 'certificate' ? `Cert Type\n${coverageCertificateType}\nFields\nname` : category === 'spending' ? `Reason\n${row.args.description}\nNative coverage allowance recipient (${row.args.outputs[0].satoshis} satoshis)` : `Protocol\n${protocol}\nCounterparty\n${category === 'protocol' ? coveragePeer : coverageVerifier}`
  const body = grouped ? `Permission Request\n${origin} is requesting the following permissions\n${config.basket}\n${coverageCertificateType}\n${config.protocol[1]}\nThis app wants to spend up to 0.00000100 BSV (100 satoshis)` : `${title}\nOrigin\n${origin}\n${detail}`
  const url = `chrome-extension://${extensionId}/prompt.html?fixture=${row.id}`, button = grouped ? decision === 'allow' ? 'Allow Selected' : 'Deny All' : decision === 'allow' ? 'Allow' : 'Deny'
  const result: any = { url, body, button, decision, observedAt: at, pendingBeforeDecision: true, clickedAt: at, clickCompletedAt: at, trustedClick: click(url, body, button, row.requestNonce, at), selections: [], screenshot: png(`conformance/coverage-${row.id}-0.png`) }
  if (grouped && decision === 'allow') {
    const nonce = randomUUID(), label = 'This app wants to spend up to 0.00000100 BSV (100 satoshis)'
    result.selections.push({ nonce, callNonce: row.requestNonce, label, url, before: false, after: true, startedAt: at, endedAt: at, dispatch: { nonce, label, url, checked: true, type: 'change', isTrusted: true, expectedPage: true, expectedMainFrame: true, dispatchedAt: at, receivedAt: at } })
  }
  row.prompts.push(result)
}
async function fixture() {
  artifacts.clear()
  const report: any = { schema: 'tpnil-native-permission-coverage@1.0.0', oracle: permissionCoverageOracle, policySha256: permissionCoveragePolicySha256, claim: 'ENGINEERING_OBSERVATION_ONLY', identity, extensionId, startedAt: now(), endedAt: '', steps: [], restarts: [], revocations: [], manifest: { value: coverageManifest, sha256: sha(Buffer.from(canonicalJson(coverageManifest))), requests: [] }, transactions: [], submissions: [], submissionWindow: { startIndex: 0, endIndex: 0 }, errors: [], cleanup: { pagesClosed: true, settingsClosed: true, routeUnregistered: true }, remainingCoverage: permissionCoveragePolicy.remainingCoverage, completeBRC100Conformance: false }
  const funding = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
  const root = Transaction.fromAtomicBEEF([...Buffer.from(funding.atomicBeefHex, 'hex')])
  const fundingKey = new KeyDeriver(PrivateKey.fromHex('77'.repeat(32))).derivePrivateKey([2, '3241645161d8'], `${funding.payment.derivationPrefix} ${funding.payment.derivationSuffix}`, funding.payment.senderIdentityKey)
  expect(fundingKey.toPublicKey().toString()).toBe(funding.payment.publicKey)
  const spend = async (source: Transaction, index: number, key: PrivateKey, amount: number, script: string) => {
    const tx = new Transaction(); tx.addInput({ sourceTransaction: source, sourceOutputIndex: index, unlockingScriptTemplate: new P2PKH().unlock(key) })
    tx.addOutput({ satoshis: amount, lockingScript: LockingScript.fromHex(script) })
    tx.addOutput({ satoshis: source.outputs[index]!.satoshis! - amount - 1, lockingScript: new P2PKH().lock(nativeKey.toPublicKey().toAddress()) })
    await tx.sign(); return tx
  }
  const basketTx = await spend(root, 0, fundingKey, config.basketAmount, '51'), firstTx = await spend(basketTx, 1, nativeKey, config.paymentAmounts.first, coveragePaymentScript), secondTx = await spend(firstTx, 1, nativeKey, config.paymentAmounts.second, coveragePaymentScript)
  report.setupOutpoint = `${basketTx.id('hex')}.0`
  const cert = await issueFixtureCertificateForSubject(new ProtoWallet(PrivateKey.fromHex(config.issuerKeyHex)), identity, config.fields, coverageCertificateType, async () => report.setupOutpoint, coverageCertificateSerial)
  report.certificate = JSON.parse(JSON.stringify(cert)); report.certificateMasterKeyring = report.certificate.masterKeyring; delete report.certificate.masterKeyring
  const proof = { keyringForVerifier: await MasterCertificate.createKeyringForVerifier(native, cert.certifier, coverageVerifier, cert.fields, ['name'], cert.masterKeyring, cert.serialNumber) }
  const contexts: any[] = [{ sequence: 0, profileBinding: 'ab'.repeat(32), extensionId, openedAt: report.startedAt }]
  const restart = () => {
    const at = now(), sequence = report.restarts.length + 1
    const receipt = { schema: 'tpnil-native-browser-restart@1', sequence, profileBinding: contexts[0].profileBinding, extensionId, startedAt: at, closedAt: at, openedAt: at, unlockedAt: at, endedAt: at, oldPageCount: 2, oldPagesClosed: true, version: 'yours-wallet-5.1.1', identity, sandboxEvidence: `native-sandbox-restart-${sequence}.txt` }
    contexts[sequence - 1].closedAt = at; contexts.push({ sequence, profileBinding: contexts[0].profileBinding, extensionId, openedAt: at, restart: receipt }); report.restarts.push(receipt)
    artifacts.set(receipt.sandboxEvidence, Buffer.from('PID namespaces Yes\nSeccomp-BPF sandbox Yes')); png(`conformance/restart-${sequence}-unlocked.png`)
  }
  const revoke = (id: string, origin: string) => {
    const at = now(), requestNonce = randomUUID(), url = `chrome-extension://${extensionId}/index.html`, body = `${new URL(origin).host}\n${config.basket}\n${config.protocol[1]}`
    const confirmation = `Revoke all access for ${new URL(origin).host}? This revokes every permission granted to this app.`
    report.revocations.push({ id, origin, pageUrl: url, requestNonce, startedAt: at, endedAt: at, beforeBody: body, cardBody: body, confirmationBody: confirmation, afterBody: 'Permissions', afterOriginCardCount: 0, revoke: click(url, body, 'Revoke All Access', requestNonce, at), confirm: click(url, confirmation, 'Confirm', requestNonce, at), before: png(`conformance/coverage-${id}-before.png`), confirmation: png(`conformance/coverage-${id}-confirmation.png`), after: png(`conformance/coverage-${id}-after.png`) })
  }
  for (const id of coverageStepOrder) {
    if (id === 'protocol-restart' || id === 'protocol-revoked-restart') restart()
    if (id === 'protocol-revoked') { revoke('revoke-primary', config.primary); revoke('revoke-allowance', config.allowance) }
    const origin = id === 'identity' || id.startsWith('setup-') ? config.application : id.endsWith('-alternate-deny') || id === 'allowance-alternate' ? config.alternate : id.startsWith('manifest-') || id.startsWith('allowance-') ? config.allowance : config.primary
    const row: any = { id, origin, pageUrl: `${origin}/`, requestNonce: randomUUID(), startedAt: now(), endedAt: '', method: '', args: {}, outcome: {}, prompts: [], submissionStart: report.submissions.length, submissionEnd: report.submissions.length }
    const category = permissionCoverageCategories.find(category => id.startsWith(`${category}-`)) ?? (id.startsWith('manifest-') ? id.slice('manifest-'.length) : undefined)
    let result: any
    if (id === 'identity') { row.method = 'getPublicKey'; row.args = { identityKey: true }; result = { publicKey: identity } }
    else if (id === 'setup-certificate') { row.method = 'acquireCertificate'; row.args = { ...report.certificate, acquisitionProtocol: 'direct', keyringRevealer: 'certifier', keyringForSubject: cert.masterKeyring }; result = report.certificate }
    else if (id === 'manifest-grant') { row.method = 'waitForAuthentication'; result = { authenticated: true }; prompt(row, 'grouped', 'allow', true); report.manifest.requests.push({ method: 'GET', path: '/manifest.json', servedAt: row.startedAt, responseSha256: report.manifest.sha256 }) }
    else if (id === 'setup-basket' || id.startsWith('allowance-')) {
      row.method = 'createAction'
      const kinds: any = { 'allowance-first': 'first', 'allowance-second': 'second', 'allowance-overflow': 'overflow', 'allowance-alternate': 'alternate', 'allowance-revoked': 'revoked', 'allowance-revoked-restart': 'revokedRestart' }
      row.args = id === 'setup-basket' ? { description: 'TPNIL permission coverage basket fixture', outputs: [{ satoshis: config.basketAmount, lockingScript: '51', basket: config.basket, outputDescription: 'Native permission coverage fixture', customInstructions: 'tpnil:permission-coverage:1' }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } } : coveragePaymentArgs(kinds[id])
      const tx = id === 'setup-basket' ? basketTx : id === 'allowance-first' ? firstTx : id === 'allowance-second' ? secondTx : undefined
      if (tx) { result = { txid: tx.id('hex'), tx: tx.toAtomicBEEF() }; report.transactions.push({ role: id, txid: result.txid, atomicBeef: result.tx }); report.submissions.push({ txid: result.txid, verdict: 'ACCEPTED_BY_NETWORK', beefHex: Buffer.from(result.tx).toString('hex') }) }
      else prompt(row, 'spending', 'deny', id.includes('revoked'))
    } else if (category && category !== 'grant') {
      Object.assign(row, coverageCategoryCall(category as any, report.certificate))
      if (id.endsWith('-grant')) prompt(row, category, 'allow')
      if (id.endsWith('-alternate-deny') || id.includes('-revoked')) prompt(row, category, 'deny')
      else if (category === 'protocol') result = await native.getPublicKey(row.args)
      else if (category === 'basket') result = { totalOutputs: 1, outputs: [{ outpoint: report.setupOutpoint, satoshis: config.basketAmount, spendable: true }], BEEF: Beef.fromBinary(basketTx.toAtomicBEEF()).toBinary() }
      else if (category === 'certificate') result = proof
      else result = await (native as any)[row.method](row.args)
    }
    row.endedAt = now(); row.submissionEnd = report.submissions.length
    row.outcome = result === undefined ? { status: 'rejected', requestNonce: row.requestNonce, settledAt: row.endedAt, error: { name: 'Error', message: 'Permission denied by user' } } : { status: 'fulfilled', requestNonce: row.requestNonce, settledAt: row.endedAt, value: result }
    report.steps.push(row)
  }
  report.submissionWindow.endIndex = report.submissions.length; report.endedAt = now()
  artifacts.set('native-browser-contexts.json', Buffer.from(JSON.stringify({ schema: 'tpnil-native-browser-contexts@1', contexts })))
  report.assertions = await evaluateNativePermissionCoverage(report, read, identity); report.result = report.assertions.every((row: any) => row.result === 'PASS') ? 'PASS' : 'FAIL'
  return report
}
beforeAll(async () => { original = await fixture() })

describe('prospective native permission coverage independent oracle', () => {
  it('validates all28 declared cases using actual crypto and mined-root transaction controls', async () => {
    expect(original.assertions.filter((row: any) => row.result !== 'PASS')).toEqual([])
    const result = await verifyNativePermissionCoverage(structuredClone(original), read, identity)
    expect(result.result).toBe('PASS'); expect(result.assertions.map(row => row.id)).toEqual(permissionCoverageAssertionIds)
    expect(original.steps).toHaveLength(43); expect(original.completeBRC100Conformance).toBe(false)
  })
  it.each([
    ['missing step', (r: any) => r.steps.pop()],
    ['wrong origin', (r: any) => { step(r, 'protocol-cached').origin = config.alternate }],
    ['replayed nonce', (r: any) => { step(r, 'protocol-cached').outcome.requestNonce = step(r, 'protocol-grant').requestNonce }],
    ['cached call prompts', (r: any) => { step(r, 'protocol-cached').prompts = step(r, 'protocol-grant').prompts }],
    ['synthetic UI dispatch', (r: any) => { step(r, 'basket-grant').prompts[0].trustedClick.dispatch.isTrusted = false }],
    ['unclicked default checkbox', (r: any) => { step(r, 'manifest-grant').prompts[0].selections[0].before = true }],
    ['synthetic checkbox selection', (r: any) => { step(r, 'manifest-grant').prompts[0].selections[0].dispatch.isTrusted = false }],
    ['wrong manifest cap', (r: any) => { r.manifest.value.metanet.groupPermissions.spendingAuthorization.amount++ }],
    ['no served manifest', (r: any) => { r.manifest.requests = [] }],
    ['restart uses artifact version instead of public wallet version', (r: any) => { r.restarts[0].version = '5.1.1' }],
    ['restart changes identity', (r: any) => { r.restarts[0].identity = coveragePeer }],
    ['old pages survive restart', (r: any) => { r.restarts[0].oldPagesClosed = false }],
    ['restart swaps profile', (r: any) => { r.restarts[0].profileBinding = 'ff'.repeat(32) }],
    ['transport timeout as denial', (r: any) => { step(r, 'allowance-overflow').outcome.error.message = 'Permission denied due to network timeout' }],
    ['post-revoke disclosure', (r: any) => { step(r, 'specific-linkage-revoked-restart').outcome = step(r, 'specific-linkage-cached').outcome }],
    ['wrong-origin revocation', (r: any) => { r.revocations[0].origin = config.alternate }],
    ['synthetic revocation click', (r: any) => { r.revocations[0].confirm.dispatch.isTrusted = false }],
    ['corrupted linkage ciphertext', (r: any) => { step(r, 'counterparty-linkage-restart').outcome.value.encryptedLinkage[0] ^= 1 }],
    ['wrong linkage verifier', (r: any) => { step(r, 'specific-linkage-grant').outcome.value.verifier = coveragePeer }],
    ['extra disclosed certificate field', (r: any) => { step(r, 'certificate-restart').outcome.value.keyringForVerifier.private = 'AAAA' }],
    ['missing signed payment', (r: any) => { r.transactions = r.transactions.filter((row: any) => row.role !== 'allowance-second') }],
    ['retargeted signed payment', (r: any) => { step(r, 'allowance-first').args.outputs[0].satoshis++ }],
    ['payment requires fresh consent', (r: any) => { step(r, 'allowance-second').prompts = step(r, 'allowance-overflow').prompts }],
    ['complete-conformance escalation', (r: any) => { r.completeBRC100Conformance = true }],
    ['unsupported gap relabeled covered', (r: any) => { r.remainingCoverage[0].status = 'PASS' }],
    ['route leak', (r: any) => { r.cleanup.routeUnregistered = false }]
  ])('rejects false coverage claim: %s', async (_name, change) => {
    const report = structuredClone(original); change(report)
    await expect(verifyNativePermissionCoverage(report, read, identity)).rejects.toThrow()
  })
  it.each(['overflow', 'alternate', 'revoked', 'revokedRestart'])('rejects any delayed denied %s payment regardless of clipped call windows', async kind => {
    const report = structuredClone(original), tx = new Transaction()
    tx.addOutput({ satoshis: config.paymentAmounts[kind], lockingScript: LockingScript.fromHex(coveragePaymentScript) })
    report.submissions.push({ txid: tx.id('hex'), beefHex: tx.toHex(), verdict: 'REJECTED_INVALID_TX' }); report.submissionWindow.endIndex++
    expect(() => assertNoCoverageDeniedPayments(report.submissions)).toThrow()
    await expect(verifyNativePermissionCoverage(report, read, identity)).rejects.toThrow()
  })
  it('retains a genuine missing-execution failure without promoting it to PASS', async () => {
    const report = structuredClone(original); step(report, 'protocol-restart').outcome = { status: 'timeout', message: 'Native request exceeded interval' }
    report.assertions = await evaluateNativePermissionCoverage(report, read, identity); report.result = 'FAIL'
    expect((await verifyNativePermissionCoverage(report, read, identity)).result).toBe('FAIL')
  })
})
