import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
import { LockingScript, P2PKH, PrivateKey, ProtoWallet, Script, Transaction, UnlockingScript } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { observeExtensionControl } from '../src/wallet-lab/native/coverage-permissions-ui.js'
import { verifyPermissionExtensionLinkage, permissionExtensionFee, permissionExtensionTransactionGraph, evaluatePermissionExtension, verifyPermissionExtensionPromptScope, verifyPermissionExtensionStaging, decodePermissionExtensionAtomic, verifyPermissionExtensionControlledRejection, verifyPermissionExtensionReceiptSequence, permissionExtensionSettingsOrder, verifyPermissionExtensionCheckboxTiming } from '../src/wallet-lab/native/coverage-permissions-verifier.js'
import { permissionExtensionPolicy, permissionExtensionStepIds, permissionExtensionManifestLabels, coverageManifest, coverageCategoryCall, coveragePaymentScript, extensionPaymentArgs, extensionLinkageArgs } from '../src/wallet-lab/native/coverage-permissions-model.js'
// LAB_SELF_TEST_ONLY. Real local browser input checks the passive observer;
// handcrafted adversarial records and fee transactions never qualify a wallet.
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function payment() {
  const key = PrivateKey.fromHex('7'.padStart(64, '0')), source = new Transaction(1, [], [{ satoshis: 1000, lockingScript: new P2PKH().lock(key.toPublicKey().toAddress()) }], 0)
  const tx = new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: 0, sequence: 0xffffffff, unlockingScriptTemplate: new P2PKH().unlock(key) }], [{ satoshis: 975, lockingScript: Script.fromHex(coveragePaymentScript) }], 0)
  return { tx, source }
}
describe('prospective permission extension evidence', () => {
  it('keeps all15 exact planning rows and distinct63 public call observations', () => {
    const original = JSON.parse(fs.readFileSync(new URL('../../programs/ISI-4/proposals/native-coverage-accountability-20261111.json', import.meta.url), 'utf8'))
    const expected = original.variantRows.filter((row: any) => row.caseId.startsWith('permissions.') && row.status === 'FEASIBLE_NOT_IMPLEMENTED').map((row: any) => `${row.caseId}/${row.variantId}`)
    expect(permissionExtensionPolicy().planningRows).toEqual(expected)
    expect(permissionExtensionStepIds).toHaveLength(63); expect(new Set(permissionExtensionStepIds).size).toBe(63)
    expect(permissionExtensionPolicy().planningRows).toContain('permissions.allowance-boundaries/concurrent-cap')
    expect(permissionExtensionPolicy().planningRows).not.toContain('permissions.allowance-boundaries/calendar-rollover')
  })
  it('derives fee from serialized source amounts, never a caller supplied fee', async () => {
    const { tx } = payment(); await tx.sign()
    expect(permissionExtensionFee(tx)).toBe(25)
    expect(tx.outputs[0]!.lockingScript.toHex()).toBe(coveragePaymentScript)
  })
  it.each(['unresolved', 'negative', 'fraction', 'missing'] as const)('rejects %s fee evidence', kind => {
    const { tx, source } = payment()
    if (kind === 'unresolved') tx.inputs[0]!.sourceTransaction = undefined
    if (kind === 'negative') tx.outputs[0]!.satoshis = 1001
    if (kind === 'fraction') tx.outputs[0]!.satoshis = 975.5
    if (kind === 'missing') source.outputs[0]!.satoshis = undefined
    expect(() => permissionExtensionFee(tx)).toThrow()
  })
  it('binds independent storage transaction IDs and rejects trailing raw bytes', async () => {
    const { tx } = payment(); await tx.sign(); const base: any = { steps: [], storageTransactions: [{ txid: tx.id('hex'), rawTxHex: tx.toHex() }] }
    expect(permissionExtensionTransactionGraph(base).get(tx.id('hex'))?.toHex()).toBe(tx.toHex())
    const wrong = structuredClone(base); wrong.storageTransactions[0].txid = '00'.repeat(32)
    expect(() => permissionExtensionTransactionGraph(wrong)).toThrow()
    const trailing = structuredClone(base); trailing.storageTransactions[0].rawTxHex += '00'
    expect(() => permissionExtensionTransactionGraph(trailing)).toThrow()
  })
  it('does not convert an absent native run into passed coverage', async () => {
    const policy = permissionExtensionPolicy(), report: any = { schema: 'tpnil-native-permission-extension@1.0.0', oracle: policy.oracle, policySha256: policy.sha256, claim: 'ENGINEERING_OBSERVATION_ONLY', completeBRC100Conformance: false, identity: PrivateKey.fromHex('1'.padStart(64, '0')).toPublicKey().toString(), anchorSha256: '0'.repeat(64) }
    const rows = await evaluatePermissionExtension(report, {} as any, () => { throw new Error('No native evidence') }, report.identity)
    expect(rows).toHaveLength(15); expect(rows.every(row => row.result === 'FAIL')).toBe(true)
  })
})

describe.skipIf(!fs.existsSync(chromium.executablePath()))('actual local browser control capture (not native-wallet evidence)', () => {
  it('captures trusted div lock, password unlock and icon-only revoke before their handlers mutate the page', async () => {
    const browser = await chromium.launch({ headless: true }), context = await browser.newContext(), page = await context.newPage(), evidence = new Map<string, Buffer>()
    const owner: any = { evidence: { addBytes: (name: string, bytes: Uint8Array) => { if (evidence.has(name)) throw new Error('Duplicate test evidence'); evidence.set(name, Buffer.from(bytes)) } } }
    try {
      await page.setContent('<main><div id="lock">Lock Wallet</div></main><script>document.querySelector("#lock").onclick=()=>document.querySelector("main").innerHTML="<input placeholder=Password><button id=unlock>Unlock</button>";document.addEventListener("click",e=>{if(e.target.id==="unlock")document.querySelector("main").innerHTML="<div id=row>Data Access Can access: fixture<button id=revoke><span>X</span></button></div>";if(e.target.closest("#revoke"))document.querySelector("#row").remove()})</script>')
      const lock = await observeExtensionControl(owner, page, page.locator('#lock'), 'test-lock', () => page.getByPlaceholder('Password').waitFor())
      expect(lock.dispatch).toMatchObject({ isTrusted: true, text: 'Lock Wallet', expectedPage: true, expectedMainFrame: true, visible: true, disabled: false })
      expect(lock.dispatch!.body).toBe(lock.beforeBody); expect(lock.afterBody).toBe('Unlock')
      await page.getByPlaceholder('Password').fill('fixture-only')
      const unlock = await observeExtensionControl(owner, page, page.getByRole('button', { name: 'Unlock' }), 'test-unlock', () => page.locator('#row').waitFor())
      expect(unlock.dispatch!.isTrusted).toBe(true); expect(unlock.dispatch!.body).toBe('Unlock')
      const revoke = await observeExtensionControl(owner, page, page.locator('#revoke'), 'test-revoke', () => page.locator('#row').waitFor({ state: 'hidden' }))
      expect(revoke.dispatch).toMatchObject({ isTrusted: true, tag: 'BUTTON', expectedMainFrame: true }); expect(revoke.dispatch!.parentText).toContain('Can access: fixture'); expect(revoke.afterBody).toBe('')
      for (const receipt of [lock, unlock, revoke]) for (const i of [receipt.before, receipt.after]) { const bytes = evidence.get(i.name)!; expect(sha(bytes)).toBe(i.sha256); expect(bytes.length).toBe(i.size) }
      expect(new Set([lock.nonce, unlock.nonce, revoke.nonce]).size).toBe(3)
    } finally { await context.close(); await browser.close() }
  }, 30000)
})


describe('scope and staged-intent false-pass regressions', () => {
  it('rejects a different same-origin protocol even with an otherwise trusted click', () => {
    const c = coverageCategoryCall('protocol'), step: any = { id: 'protocol-grant', origin: 'https://permission-extension.itcve.test', method: c.method, args: c.args }
    const prompt: any = { body: `Protocol Permission\nOrigin\npermission-extension.itcve.test\nProtocol\n${c.args.protocolID![1]}\nSecurity\nLevel 2 · this app and this recipient only\nCounterparty\n${c.args.counterparty}`, checkboxStates: [] }
    expect(() => verifyPermissionExtensionPromptScope(step, prompt)).not.toThrow()
    prompt.body = prompt.body.replace(c.args.protocolID![1] as string, 'unrelated scope')
    expect(() => verifyPermissionExtensionPromptScope(step, prompt)).toThrow()
  })
  it('requires exact grouped checkbox labels and rejects arbitrary grants', () => {
    const labels = permissionExtensionManifestLabels(), step: any = { id: 'subset-grant', origin: 'https://permission-extension-subset.itcve.test', method: 'waitForAuthentication', args: {} }, prompt: any = { body: `Permission Request\npermission-extension-subset.itcve.test is requesting the following permissions\n${coverageManifest.metanet.groupPermissions.description}`, checkboxStates: Object.values(labels).map(label => ({ label, checked: label === labels.protocol })) }
    expect(() => verifyPermissionExtensionPromptScope(step, prompt)).not.toThrow()
    prompt.checkboxStates[3].label = 'Unrelated certificate permission'
    expect(() => verifyPermissionExtensionPromptScope(step, prompt)).toThrow()
  })
  it('binds recipient amount and action reason on spending prompts', () => {
    const step: any = { id: 'overcap-deny', origin: 'https://permission-extension-overcap.itcve.test', method: 'createAction', args: { description: 'One exact request', outputs: [{ satoshis: 101, outputDescription: 'One exact recipient' }] } }, prompt: any = { body: 'Spending Authorization\nOrigin\npermission-extension-overcap.itcve.test\nReason\nOne exact request\nAmount\n124 satoshis\nOne exact recipient (101 satoshis)', checkboxStates: [] }
    expect(() => verifyPermissionExtensionPromptScope(step, prompt)).not.toThrow()
    prompt.body = prompt.body.replace('(101 satoshis)', '(100 satoshis)')
    expect(() => verifyPermissionExtensionPromptScope(step, prompt)).toThrow()
  })
  it('accepts signature completion while rejecting changed prepared intent and BEEF suffixes', async () => {
    const { tx } = payment(); tx.inputs[0]!.unlockingScript = UnlockingScript.fromHex('')
    const prepared = tx.toAtomicBEEF(); await tx.sign(); const signed = tx.toAtomicBEEF()
    expect(() => verifyPermissionExtensionStaging(prepared, signed)).not.toThrow()
    for (const change of ['lockTime', 'version', 'sequence', 'output', 'extra-output'] as const) {
      const altered = Transaction.fromAtomicBEEF(signed)
      const replacement = new Transaction(change === 'version' ? altered.version + 1 : altered.version,
        altered.inputs.map(i => ({ ...i, ...(change === 'sequence' ? { sequence: 0 } : {}) })),
        [...altered.outputs.map(o => ({ ...o, ...(change === 'output' ? { satoshis: o.satoshis! - 1 } : {}) })), ...(change === 'extra-output' ? [{ satoshis: 0, lockingScript: Script.fromHex('006a') }] : [])],
        change === 'lockTime' ? altered.lockTime + 1 : altered.lockTime)
      expect(() => verifyPermissionExtensionStaging(prepared, replacement.toAtomicBEEF())).toThrow()
    }
    expect(() => verifyPermissionExtensionStaging([...prepared, 0], signed)).toThrow()
    expect(() => decodePermissionExtensionAtomic([...prepared, 0])).toThrow()
    const sparse = [...prepared]; delete sparse[5]; expect(() => decodePermissionExtensionAtomic(sparse)).toThrow('dense')
    expect(() => verifyPermissionExtensionStaging(prepared, [...signed, 0])).toThrow()
  })
})

// Real mined/script-valid reference ancestry with deliberately constructed
// observer records. These are LAB_SELF_TEST_ONLY, never native UI qualification.
function controlledRejectionFixture() {
  const p = permissionExtensionPolicy(), c = p.configuration
  const funding = JSON.parse(fs.readFileSync(new URL('../../fixtures/teranode/wab-funding-v1.json', import.meta.url), 'utf8'))
  const reference = JSON.parse(fs.readFileSync(new URL('../../fixtures/native-transaction-states/reference-20261111/report.json', import.meta.url), 'utf8'))
  const source = Transaction.fromAtomicBEEF(reference.trace.find((row: any) => row.id === 'fanout').result.tx)
  const tx = new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: 15, sequence: 0xffffffff, unlockingScript: UnlockingScript.fromHex('51') }], [
    { satoshis: c.accountingAmount, lockingScript: LockingScript.fromHex(coveragePaymentScript) }, { satoshis: 99 - c.accountingAmount, lockingScript: LockingScript.fromHex('51') }
  ], 0)
  const receipt = (target: Transaction) => ({ txid: target.id('hex'), verdict: 'REJECTED', beefHex: Buffer.from(target.toAtomicBEEF()).toString('hex') })
  const step: any = { id: 'rejection-create', origin: c.rejection, pageUrl: `${c.rejection}/`, method: 'createAction', args: extensionPaymentArgs('rejection-create', c.accountingAmount), requestNonce: '11111111-1111-4111-8111-111111111111', startedAt: '2026-11-12T00:00:01Z', endedAt: '2026-11-12T00:00:03Z', submissionStart: 0, submissionEnd: 1, prompts: [], outcome: { status: 'rejected', requestNonce: '11111111-1111-4111-8111-111111111111', settledAt: '2026-11-12T00:00:02Z', error: { status: 'error', name: 'WERR_REVIEW_ACTIONS', code: 'WERR_REVIEW_ACTIONS', message: 'Undelayed createAction or signAction results require review.', txid: tx.id('hex'), tx: tx.toAtomicBEEF() } } }
  const identity = PrivateKey.fromHex('1'.padStart(64, '0')).toPublicKey().toString()
  const report: any = { schema: 'tpnil-native-permission-extension@1.0.0', oracle: p.oracle, policySha256: p.sha256, identity, claim: 'ENGINEERING_OBSERVATION_ONLY', completeBRC100Conformance: false, startedAt: '2026-11-12T00:00:00Z', endedAt: '2026-11-12T00:00:10Z', steps: [step], cleanup: {}, submissions: [receipt(tx)], submissionWindow: { startIndex: 0, endIndex: 1 }, assertions: [{ id: 'permission-extension.allowance-boundaries.rejection-accounting', result: 'FAIL', detail: 'Later recovery deliberately absent in this self-test.' }] }
  const graph = new Map<string, Transaction>(), remember = (t: Transaction) => { if (graph.has(t.id('hex'))) return; graph.set(t.id('hex'), t); for (const input of t.inputs) if (input.sourceTransaction) remember(input.sourceTransaction) }; remember(tx)
  const binding: any = { identity, globalSubmissions: structuredClone(report.submissions), finalSubmissions: structuredClone(report.submissions), storageTransactions: new Map([[tx.id('hex'), Transaction.fromHex(tx.toHex())]]), declaredNativePayments: [`${source.id('hex')}.15`], graph: { resolvedTransactions: graph, requireResolvedAncestors: true, trustedMinedRoot: { txid: funding.txid, rawHex: funding.rawHex } } }
  const replaceTarget = (target: Transaction) => { report.submissions = [receipt(target)]; binding.globalSubmissions = structuredClone(report.submissions); binding.finalSubmissions = structuredClone(report.submissions); binding.storageTransactions = new Map([[target.id('hex'), Transaction.fromHex(target.toHex())]]); remember(target); step.outcome.error.txid = target.id('hex'); step.outcome.error.tx = target.toAtomicBEEF() }
  return { report, binding, step, tx, source, receipt, replaceTarget }
}
describe('narrow controlled rejection parent exception', () => {
  it('retains a valid rejected target independently of a later recovery FAIL', async () => {
    const f = controlledRejectionFixture(), r = await verifyPermissionExtensionControlledRejection(f.report, f.binding)
    expect(r.verified).toBe(true); expect(r.transaction.id('hex')).toBe(f.tx.id('hex')); expect(r.fee).toBe(1); expect(f.report.assertions[0].result).toBe('FAIL')
  })
  it.each(['scope', 'args', 'method', 'nonce', 'timing', 'success-and-error', 'generic-error', 'timeout', 'prompt', 'extra-window', 'accepted', 'missing-storage', 'storage-body', 'wrong-root', 'unresolved-root', 'trailing-bytes', 'public-payload', 'removed-fault', 'policy', 'identity'] as const)('rejects %s substitution after an actual positive control', async mode => {
    const f = controlledRejectionFixture(); expect((await verifyPermissionExtensionControlledRejection(f.report, f.binding)).verified).toBe(true)
    if (mode === 'scope') f.step.origin = 'https://other.itcve.test'
    if (mode === 'args') f.step.args.outputs[0].satoshis++
    if (mode === 'method') f.step.method = 'signAction'
    if (mode === 'nonce') f.step.outcome.requestNonce = '22222222-2222-4222-8222-222222222222'
    if (mode === 'timing') f.step.outcome.settledAt = '2026-11-12T00:00:00Z'
    if (mode === 'success-and-error') f.step.outcome.value = { txid: f.tx.id('hex') }
    if (mode === 'generic-error') f.step.outcome.error.name = 'Error'
    if (mode === 'timeout') f.step.outcome.error.message += ' network timeout'
    if (mode === 'prompt') f.step.prompts.push({})
    if (mode === 'extra-window') f.step.submissionEnd = 2
    if (mode === 'accepted') { f.report.submissions[0].verdict = 'ACCEPTED_BY_NETWORK'; f.binding.globalSubmissions = structuredClone(f.report.submissions); f.binding.finalSubmissions = structuredClone(f.report.submissions) }
    if (mode === 'missing-storage') f.binding.storageTransactions.clear()
    if (mode === 'storage-body') f.binding.storageTransactions.set(f.tx.id('hex'), f.source)
    if (mode === 'wrong-root') f.binding.declaredNativePayments = [`${f.source.id('hex')}.14`]
    if (mode === 'unresolved-root') { const raw = Transaction.fromHex(f.tx.toHex()); f.binding.graph.resolvedTransactions = new Map([[raw.id('hex'), raw]]); f.report.submissions[0].beefHex = raw.toHex(); f.binding.globalSubmissions = structuredClone(f.report.submissions); f.binding.finalSubmissions = structuredClone(f.report.submissions) }
    if (mode === 'trailing-bytes') { f.report.submissions[0].beefHex += '00'; f.binding.globalSubmissions = structuredClone(f.report.submissions); f.binding.finalSubmissions = structuredClone(f.report.submissions) }
    if (mode === 'public-payload') f.step.outcome.error.tx.push(0)
    if (mode === 'removed-fault') f.report.cleanup.rejectedVerdictRemoved = true
    if (mode === 'policy') f.report.policySha256 = '00'.repeat(32)
    if (mode === 'identity') f.binding.identity = PrivateKey.fromHex('2'.padStart(64, '0')).toPublicKey().toString()
    await expect(verifyPermissionExtensionControlledRejection(f.report, f.binding)).rejects.toThrow()
  }, 30000)
  it.each(['wrong-amount', 'wrong-recipient', 'additional-recipient', 'invalid-script', 'unrelated-funded-target'] as const)('rejects a fully rebound %s target', async mode => {
    const f = controlledRejectionFixture(); expect((await verifyPermissionExtensionControlledRejection(f.report, f.binding)).verified).toBe(true)
    const target = Transaction.fromAtomicBEEF(f.tx.toAtomicBEEF())
    if (mode === 'wrong-amount') target.outputs[0]!.satoshis!++
    if (mode === 'wrong-recipient') target.outputs[0]!.lockingScript = LockingScript.fromHex('51')
    if (mode === 'additional-recipient') target.outputs.push({ satoshis: 1, lockingScript: LockingScript.fromHex(coveragePaymentScript) })
    if (mode === 'invalid-script') target.inputs[0]!.unlockingScript = UnlockingScript.fromHex('')
    if (mode === 'unrelated-funded-target') target.inputs[0]!.sourceOutputIndex = 14
    f.replaceTarget(target); await expect(verifyPermissionExtensionControlledRejection(f.report, f.binding)).rejects.toThrow()
  }, 30000)
  it.each(['target', 'ancestor'] as const)('rejects the controlled rejection as a later %s even on a rejected provider', async mode => {
    const f = controlledRejectionFixture(); expect((await verifyPermissionExtensionControlledRejection(f.report, f.binding)).verified).toBe(true)
    const tx = mode === 'target' ? f.tx : new Transaction(1, [{ sourceTransaction: f.tx, sourceOutputIndex: 1, sequence: 0xffffffff, unlockingScript: UnlockingScript.fromHex('') }], [{ satoshis: 87, lockingScript: LockingScript.fromHex('51') }], 0)
    f.binding.finalSubmissions.push(f.receipt(tx)); await expect(verifyPermissionExtensionControlledRejection(f.report, f.binding)).rejects.toThrow('replayed or appears in later ancestry')
  }, 30000)
})

function permissionReceiptTimeline(): any {
  const iso = (n: number) => new Date(Date.UTC(2026, 10, 12) + n).toISOString()
  const steps: any[] = permissionExtensionStepIds.map((id, i) => ({ id, startedAt: iso(i * 10000 + 1000), endedAt: iso(i * 10000 + 2000), prompts: [] }))
  const step = (id: string) => steps.find(s => s.id === id), instant = (s: string) => Date.parse(s) - Date.UTC(2026, 10, 12)
  step('concurrent-b').startedAt = iso(instant(step('concurrent-a').startedAt) + 500); step('concurrent-b').endedAt = iso(instant(step('concurrent-a').endedAt) + 500)
  const report: any = { steps, startedAt: iso(0), endedAt: iso(steps.length * 10000 + 10000), concurrent: { startedAt: iso(instant(step('concurrent-a').startedAt) - 100), endedAt: iso(instant(step('concurrent-b').endedAt) + 100) } }
  report.ui = [['lock', 'before-lock-auth', 'locked-auth'], ['unlock', 'locked-auth', 'unlocked-auth'], ['single-revoke', 'certificate-after-lock-alternate-deny', 'protocol-after-single-revoke']].map(([id, before, after]) => ({ id, nonce: id, startedAt: iso(instant(step(before!).endedAt) + 100), endedAt: iso(instant(step(after!).startedAt) - 100), before: { name: `conformance/extension-ui-${id}-before.png` }, after: { name: `conformance/extension-ui-${id}-after.png` } }))
  report.settings = permissionExtensionSettingsOrder.map(([id, before, after]) => {
    const lower = id === 'concurrent-after' ? instant(report.concurrent.endedAt) : instant(step(before).endedAt)
    const upper = id === 'concurrent-before' ? instant(report.concurrent.startedAt) : after ? instant(step(after).startedAt) : instant(report.endedAt)
    return { id, at: iso(Math.floor((lower + upper) / 2)), image: { name: `conformance/extension-settings-${id}.png` } }
  })
  return report
}
describe('public call and auxiliary UI receipt sequence', () => {
  it('permits the two real overlapping concurrent requests in either completion order', () => {
    const r = permissionReceiptTimeline(); expect(() => verifyPermissionExtensionReceiptSequence(r)).not.toThrow()
    const i = r.steps.findIndex((s: any) => s.id === 'concurrent-a'); [r.steps[i], r.steps[i + 1]] = [r.steps[i + 1], r.steps[i]]
    expect(() => verifyPermissionExtensionReceiptSequence(r)).not.toThrow()
  })
  it.each(['stale-usage', 'future-usage', 'usage-image', 'usage-omission', 'usage-reorder', 'prompt-image', 'control-phase-image', 'duplicate-control-nonce', 'extra-control', 'early-revoke', 'late-revoke', 'public-call-reorder', 'sequential-overlap', 'concurrent-overrun'] as const)('rejects %s after exact positive control', mode => {
    const r = permissionReceiptTimeline(); expect(() => verifyPermissionExtensionReceiptSequence(r)).not.toThrow()
    if (mode === 'stale-usage') r.settings[0].at = r.startedAt
    if (mode === 'future-usage') r.settings[0].at = r.endedAt
    if (mode === 'usage-image') r.settings[0].image.name = r.settings[1].image.name
    if (mode === 'usage-omission') r.settings.pop()
    if (mode === 'usage-reorder') [r.settings[0], r.settings[1]] = [r.settings[1], r.settings[0]]
    if (mode === 'prompt-image') r.steps[1].prompts.push({ screenshot: { name: 'conformance/extension-other-0.png' } })
    if (mode === 'control-phase-image') r.ui[0].before.name = r.ui[0].after.name
    if (mode === 'duplicate-control-nonce') r.ui[1].nonce = r.ui[0].nonce
    if (mode === 'extra-control') r.ui.push(structuredClone(r.ui[0]))
    if (mode === 'early-revoke') r.ui[2].startedAt = r.startedAt
    if (mode === 'late-revoke') r.ui[2].endedAt = r.endedAt
    if (mode === 'public-call-reorder') [r.steps[1], r.steps[2]] = [r.steps[2], r.steps[1]]
    if (mode === 'sequential-overlap') r.steps[0].endedAt = r.steps[2].startedAt
    if (mode === 'concurrent-overrun') r.steps.find((s: any) => s.id === 'concurrent-a').endedAt = r.steps.find((s: any) => s.id === 'abort-stage').startedAt
    expect(() => verifyPermissionExtensionReceiptSequence(r)).toThrow()
  })
  it.each(['reverse-delivery', 'before-request', 'after-click'] as const)('rejects checkbox %s timing', mode => {
    const time = (n: number) => new Date(Date.UTC(2026, 10, 12, 0, 0, n)).toISOString()
    const selection: any = { startedAt: time(1), endedAt: time(4), dispatch: { dispatchedAt: time(2), receivedAt: time(3) } }, step: any = { startedAt: time(0), endedAt: time(6) }, prompt: any = { clickedAt: time(5) }
    expect(() => verifyPermissionExtensionCheckboxTiming(selection, step, prompt)).not.toThrow()
    if (mode === 'reverse-delivery') selection.dispatch.receivedAt = time(1)
    if (mode === 'before-request') step.startedAt = time(2)
    if (mode === 'after-click') selection.endedAt = time(6)
    expect(() => verifyPermissionExtensionCheckboxTiming(selection, step, prompt)).toThrow()
  })
})

it('binds the specific-linkage scope and authenticated type0 no-proof marker', async () => {
  const wallet = new ProtoWallet(PrivateKey.fromHex('43'.repeat(32))), identity = (await wallet.getPublicKey({ identityKey: true })).publicKey
  const args = extensionLinkageArgs(), value = await wallet.revealSpecificKeyLinkage(args)
  await expect(verifyPermissionExtensionLinkage(value, identity)).resolves.toBeUndefined()
  for (const field of ['protocolID', 'keyID', 'proofType', 'encryptedLinkageProof', 'encryptedLinkage'] as const) {
    const altered: any = structuredClone(value)
    if (field === 'protocolID') altered[field] = [2, 'wrong protocol']
    else if (field === 'keyID') altered[field] = 'wrong key'
    else if (field === 'proofType') altered[field] = 1
    else altered[field][altered[field].length - 1] ^= 1
    await expect(verifyPermissionExtensionLinkage(altered, identity)).rejects.toThrow()
  }
  const marker = await wallet.encrypt({ protocolID: [2, `specific linkage revelation ${args.protocolID[0]} ${args.protocolID[1]}`], keyID: args.keyID, counterparty: args.verifier, plaintext: [1] })
  await expect(verifyPermissionExtensionLinkage({ ...value, encryptedLinkageProof: marker.ciphertext }, identity)).rejects.toThrow()
})
