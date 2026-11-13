import {nativeCompletionProfile} from './completion-profile.js'
import {nativeProofResources} from './proof-resources.js'
import type { PartialTracePrerequisites } from './coverage-completion/partial-trace-parent.js'
import { coverageObservationEncoding, decodeCoverageObservation } from './coverage-observation.js'
import { verifyCompletionParent, verifyLaterNativeOwnedSpend } from './coverage-completion/suite.js'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Beef, P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction, Utils } from '@bsv/sdk'
import { coverageAtomic } from './coverage-transactions-program.js'
import { tc } from './coverage-transactions-model.js'
import { spendsOnlyDeclaredNativePayments } from './verify-conformance-reserves.js'
import { verifyPermissionExtensionParentBindings } from './coverage-permissions-verifier.js'
import { bindForeignOwnerFixture, verifyTransactionCoverageParentBindings } from './coverage-transactions-verifier.js'
import { coverageExtensionTransactionPredicate, verifyCoverageExtensionParentBindings } from './coverage-extension-verifier.js'
import { verifyCertificateCoverageParentBindings } from './coverage-certificates-verify.js'
import { validateNativeOutputSnapshot } from '../native-output-snapshot.js'

type FundingCall = { id: string; actor?: 'wallet' | 'funder'; method: string; args: any; result?: any; error?: any }
type FundingBinding = { identity: string; fixture: any; storageTransactions: Map<string, Transaction>; resolvedTransactions: Map<string, Transaction>; declaredNativePayments: string[] }

/** Called after the module's fixed-call program is checked. Explicit caller
 * inputs authorize only the exact outpoints, never implicit faucet funding. */
export async function verifyCoverageModuleFunding(calls: readonly FundingCall[], binding: FundingBinding, counterexamples?: { assertions: readonly { id: string; result: string }[]; predicateFor(call: FundingCall): string }) {
  const roots = [...binding.declaredNativePayments], nativeOutputs = new Set(roots), references = new Map<string, FundingCall>()
  const tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  const admitted: Array<{ callId: string; actor: string; txid: string }> = []
  const sender = new ProtoWallet(PrivateKey.fromHex(tc.funderKey)), senderIdentityKey = (await sender.getPublicKey({ identityKey: true })).publicKey
  const expectedKey = (await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${tc.prefix} ${tc.suffix}`, counterparty: binding.identity, forSelf: false })).publicKey
  const paymentScript = new P2PKH().lock(PublicKey.fromString(expectedKey).toAddress()).toHex()
  const resolve = async (bytes: unknown, claimedId?: string, call?: FundingCall) => {
    let publicTx: Transaction
    try { publicTx = coverageAtomic(bytes); if (call || claimedId !== undefined) assert.equal(publicTx.id('hex'), claimedId) }
    catch (error) {
      assert.ok(call && counterexamples, `Unbound malformed transaction response: ${String(error)}`)
      assert.equal(counterexamples.assertions.find(row => row.id === counterexamples.predicateFor(call))?.result, 'FAIL', 'Malformed response lacks its independently derived predicate FAIL')
      let recovered: Transaction | undefined
      if (Array.isArray(bytes)) {
        let length = 0; while (length < bytes.length && Object.hasOwn(bytes, length) && Number.isInteger(bytes[length]) && bytes[length] >= 0 && bytes[length] <= 255) length++
        try { const graph = Beef.fromReader(new Utils.Reader(bytes.slice(0, length))); if (graph.atomicTxid) recovered = graph.findTxid(graph.atomicTxid)?.tx } catch { /* Recover the public TXID independently below. */ }
      }
      if (!recovered && typeof claimedId === 'string' && /^[a-f0-9]{64}$/.test(claimedId)) recovered = binding.storageTransactions.get(claimedId)
      assert.ok(recovered, 'Malformed response has no independently recoverable signed body')
      publicTx = recovered
    }
    const txid = publicTx.id('hex'), tx = binding.resolvedTransactions.get(txid)
    assert.ok(tx, 'Coverage transaction absent from independent ancestry graph')
    assert.equal(binding.storageTransactions.get(txid)?.toHex(), publicTx.toHex(), 'Coverage transaction absent from independent storage')
    assert.equal(tx.toHex(), publicTx.toHex())
    const graph = Beef.fromBinary(tx.toAtomicBEEF()), mined = graph.findTxid(binding.fixture.txid)
    assert.equal(mined?.tx?.toHex(), binding.fixture.rawHex); assert.ok(mined?.bumpIndex !== undefined)
    assert.ok(await graph.verify(tracker)); assert.ok(await tx.verify(tracker))
    return tx
  }
  const spendsNative = (tx: Transaction, depth = 0): boolean => {
    assert.ok(depth < nativeProofResources().maximumProofDepth)
    return tx.inputs.some(input => nativeOutputs.has(`${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`) || input.sourceTransaction !== undefined && spendsNative(input.sourceTransaction, depth + 1))
  }
  for (const call of calls) {
    if (call.result?.signableTransaction?.reference) {
      const reference = call.result.signableTransaction.reference
      assert.equal(call.method, 'createAction'); assert.equal(typeof reference, 'string'); assert.ok(!references.has(reference))
      references.set(reference, call)
    }
    if (call.method === 'internalizeAction' && call.result?.accepted === true && call.actor !== 'funder') {
      const payments = call.args.outputs?.filter((output: any) => output.protocol === 'wallet payment') ?? []
      if (payments.length) {
        assert.ok(['payment', 'both'].includes(call.id), 'Undeclared post-scenario wallet payment')
        const source = calls.find(row => row.id === 'incoming-fixture' && row.actor === 'funder')
        assert.ok(source?.result?.tx); assert.deepEqual(call.args.tx, source.result.tx)
        const tx = await resolve(call.args.tx, source.result.txid)
        assert.deepEqual(payments, [{ outputIndex: call.id === 'payment' ? 0 : 1, protocol: 'wallet payment', paymentRemittance: { derivationPrefix: tc.prefix, derivationSuffix: tc.suffix, senderIdentityKey } }])
        const index = payments[0]!.outputIndex
        assert.equal(tx.outputs[index]?.lockingScript.toHex(), paymentScript); assert.equal(tx.outputs[index]?.satoshis, 1000)
        roots.push(`${tx.id('hex')}.${index}`); nativeOutputs.add(`${tx.id('hex')}.${index}`)
      }
    }
    if (!['createAction', 'signAction'].includes(call.method)) continue
    for (const [kind, value] of [['result', call.result], ['error', call.error]] as const) {
      if (!value || !Object.hasOwn(value, 'tx') && !Object.hasOwn(value, 'txid')) continue
      const tx = await resolve(value.tx, value.txid, call), actor = call.actor ?? 'wallet'
      if (actor === 'funder') {
        assert.ok(spendsOnlyDeclaredNativePayments(tx, [`${binding.fixture.txid}.${binding.fixture.outputIndex}`]), 'Funder transaction has an undeclared funding root')
        assert.ok(!spendsNative(tx), 'Fixture actor spent native-owned funding')
      } else {
        let source = call
        if (call.method === 'signAction') {
          const prepared = references.get(call.args.reference)
          assert.ok(prepared && (prepared.actor ?? 'wallet') === actor, 'Signature response lacks its same-actor prepared action')
          source = prepared
        }
        const explicit = (source.args.inputs ?? []).map((input: any) => input.outpoint)
        assert.ok(explicit.every((point: unknown) => typeof point === 'string' && /^[0-9a-f]{64}\.(?:0|[1-9][0-9]*)$/.test(point)))
        for (const point of explicit) assert.ok(tx.inputs.some(input => `${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}` === point), 'Signed action omitted its declared caller input')
        assert.ok(spendsOnlyDeclaredNativePayments(tx, [...roots, ...explicit]), 'Native transaction uses undeclared implicit funding')
        if (kind === 'result') for (let index = 0; index < tx.outputs.length; index++) { const point = `${tx.id('hex')}.${index}`; roots.push(point); nativeOutputs.add(point) }
      }
      admitted.push({ callId: call.id, actor, txid: tx.id('hex') })
    }
  }
  return { verified: true as const, admitted, declaredNativePayments: roots }
}

export function verifyCoverageBrowserChain(value: any, identity: string, permission: any, certificate: any, read: (name: string) => Buffer) {
  assert.equal(value.schema, 'tpnil-native-browser-contexts@1'); assert.equal(value.contexts.length, 5)
  const contexts = value.contexts, initial = contexts[0]
  assert.equal(initial.sequence, 0); assert.match(initial.profileBinding, /^[a-f0-9]{64}$/); assert.match(initial.extensionId, /^[a-p]{32}$/)
  const at = (value: string) => { const time = Date.parse(value); assert.equal(new Date(time).toISOString(), value); return time }
  for (let index = 1; index < contexts.length; index++) {
    const current = contexts[index], prior = contexts[index - 1], receipt = current.restart
    assert.equal(current.sequence, index); assert.equal(receipt.sequence, index); assert.equal(receipt.schema, 'tpnil-native-browser-restart@1')
    for (const row of [current, receipt]) { assert.equal(row.profileBinding, initial.profileBinding); assert.equal(row.extensionId, initial.extensionId) }
    assert.equal(receipt.identity, identity); assert.equal(receipt.version, 'yours-wallet-5.1.1'); assert.equal(receipt.oldPagesClosed, true); assert.ok(Number.isSafeInteger(receipt.oldPageCount) && receipt.oldPageCount > 0)
    assert.equal(prior.closedAt, receipt.closedAt); assert.equal(current.openedAt, receipt.openedAt)
    const times = [prior.openedAt, receipt.startedAt, receipt.closedAt, receipt.openedAt, receipt.unlockedAt, receipt.endedAt].map(at)
    assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]!))
    if (prior.restart) assert.ok(at(prior.restart.endedAt) <= at(receipt.startedAt), 'Serial browser restarts overlap')
    assert.equal(receipt.sandboxEvidence, `native-sandbox-restart-${index}.txt`)
    const sandbox = read(receipt.sandboxEvidence).toString(); assert.match(sandbox, /PID namespaces\s+Yes/); assert.match(sandbox, /Seccomp-BPF sandbox\s+Yes/)
    assert.equal(read(`conformance/restart-${index}-unlocked.png`).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  }
  assert.deepEqual(permission.restarts, [contexts[3].restart]); assert.equal(certificate.restart.kind, 'NATIVE_BROWSER_RESTART'); assert.deepEqual(certificate.restart.receipt, contexts[4].restart)
  return { verified: true as const, contexts: 5, restarts: 4, sameProfile: true }
}

/** Join the fresh-funding prerequisite to the independent service observation,
 * exact upfront payment bodies, and the original customer execution order. */
export function verifyPermissionPrelude(binding: FundingBinding & { profile?: 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0' | 'ITCVE-1@4.8.0'; globalSubmissions: any[]; readEvidence(name: string): Buffer }) {
  const read = binding.readEvidence, json = (name: string) => JSON.parse(read(name).toString()), sha = (name: string) => createHash('sha256').update(read(name)).digest('hex')
  const prelude = json('conformance/permission-prelude.json'), completion = json('conformance/permission-prelude-completion.json')
  const coverage = json('conformance/permission-coverage.json'), permission = json('conformance/permission-extension.json')
  assert.equal(prelude.schema, 'tpnil-native-permission-prelude@1.0.0'); assert.equal(prelude.prerequisite, 'fresh-managed-funding')
  assert.equal(completion.schema, 'tpnil-native-permission-prelude-completion@1.0.0')
  assert.equal(prelude.identity, binding.identity); assert.equal(completion.identity, binding.identity)
  assert.equal(completion.initialSha256, sha('conformance/permission-prelude.json')); assert.equal(completion.coverageSha256, sha('conformance/permission-coverage.json')); assert.equal(completion.extensionSha256, sha('conformance/permission-extension.json'))
  assert.equal(prelude.outputObservationSequence, 0)
  const observation = json('native-output-snapshot-observations.json')[0], registry = json('native-output-provider-registry.json')
  assert.equal(observation.sequence, 0); assert.equal(observation.identityKey, binding.identity); assert.equal(observation.error, undefined)
  const snapshots = observation.snapshots; assert.equal(snapshots.schema, 'tpnil-native-owned-output-snapshots@1.0.0'); assert.equal(snapshots.identityKey, binding.identity); assert.equal(snapshots.providers.length, 1)
  const provider = snapshots.providers[0]; assert.equal(provider.id, 'source'); assert.equal(registry[0].id, 'source')
  assert.deepEqual(provider.componentIdentity, json('service-components.json')); assert.deepEqual(provider.componentIdentity, registry[0].componentIdentity)
  validateNativeOutputSnapshot(provider.snapshot, binding.identity, registry[0].identityKey)
  assert.deepEqual(prelude.initialOutputs, provider.snapshot.outputs); assert.equal(prelude.initialOutputs.length, 3)
  const reserves = json('conformance/funding-reserves.json'), initial = json('funding.json')
  const points = [`${initial.fundingTxid}.0`, ...reserves.payments.map((row: any) => row.outpoint)].sort()
  assert.deepEqual(prelude.initialOutputs.map((row: any) => row.outpoint).sort(), points)
  for (const row of prelude.initialOutputs) {
    assert.equal(row.spendable, true); assert.equal(row.satoshis, 10_000); assert.equal(row.basketName, 'default')
    assert.equal(binding.storageTransactions.get(row.txid)?.toHex(), row.rawTx)
    assert.ok(binding.declaredNativePayments.includes(row.outpoint))
  }
  const at = (value: string) => { const time = Date.parse(value); assert.equal(new Date(time).toISOString(), value); return time }
  const times = [json('conformance/scenario-start.json').startedAt, prelude.startedAt, observation.startedAt, observation.endedAt, prelude.endedAt, coverage.startedAt, coverage.endedAt, permission.startedAt, permission.endedAt, completion.endedAt].map(at)
  assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]!), 'Funding prelude or permission execution timestamps are out of order')
  assert.equal(completion.startedAt, prelude.endedAt)
  assert.equal(prelude.submissionStart, prelude.submissionEnd); assert.equal(prelude.submissionEnd, coverage.submissionWindow.startIndex)
  assert.equal(completion.submissionStart, prelude.submissionStart); assert.equal(completion.submissionEnd, permission.submissionWindow.endIndex)
  assert.ok(coverage.submissionWindow.endIndex <= permission.submissionWindow.startIndex)
  const setup = coverage.steps.find((row: any) => row.id === 'setup-basket')
  assert.equal(binding.globalSubmissions[prelude.submissionEnd]?.txid, setup.outcome.value.txid, 'Permission setup must be the first customer transaction')
  const firstTodo = binding.globalSubmissions.findIndex(row => row.txid === json('created-output.json').createTxid)
  assert.ok(firstTodo >= completion.submissionEnd, 'ToDo scenarios ran before the fresh-state permission prelude completed')
  return { verified: true as const, initialFundingOutpoints: points, beforeOtherCustomerTransactions: true }
}

export async function verifyNativeCoverageSuite(binding: FundingBinding & { completionPrerequisites?: Omit<PartialTracePrerequisites, 'coverageSuiteBindings'>; profile?: 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0' | 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0' | 'ITCVE-1@4.8.0'; globalSubmissions: any[]; finalSubmissions: any[]; readEvidence(name: string): Buffer }) {
  const completion = ['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile ?? '')
  const read = binding.readEvidence, json = (name: string) => decodeCoverageObservation<any>(JSON.parse(read(name).toString()), completion && ['conformance/coverage-extension.json', 'conformance/coverage-certificates.json'].includes(name) ? coverageObservationEncoding : undefined)
  const suite = json('conformance/coverage-suite.json'), permission = json('conformance/permission-extension.json'), transactions = json('conformance/coverage-transactions.json'), extension = json('conformance/coverage-extension.json'), certificates = json('conformance/coverage-certificates.json')
  assert.ok(binding.profile === undefined || ['ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile ?? '')); assert.equal(permission.identityPermission, ['ITCVE-1@4.4.0', 'ITCVE-1@4.5.0', 'ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile ?? '') ? 'explicit-allow-v1' : undefined);
  assert.equal(permission.linkagePermissionScope, ['ITCVE-1@4.6.0', 'ITCVE-1@4.7.0', 'ITCVE-1@4.8.0'].includes(binding.profile ?? '') ? 'peer-protocol-key-v2' : undefined)
  assert.equal(suite.schema, 'tpnil-native-coverage-suite@1.0.0'); assert.deepEqual(suite.modules, ['permissions', 'transactions', 'extension', 'certificates']); assert.deepEqual(suite.errors, [])
  assert.deepEqual(suite.certificateEnvironment.cleanup, { pagesClosed: true, routesClosed: true, overlayClosed: true })
  const prelude = verifyPermissionPrelude(binding)
  const contexts = json('native-browser-contexts.json'), browser = verifyCoverageBrowserChain(completion ? { ...contexts, contexts: contexts.contexts.slice(0, 5) } : contexts, binding.identity, permission, certificates, read)
  const graph = { resolvedTransactions: binding.resolvedTransactions, requireResolvedAncestors: true, trustedMinedRoot: { txid: binding.fixture.txid, rawHex: binding.fixture.rawHex } }
  const permissions = await verifyPermissionExtensionParentBindings(permission, json('conformance/permission-coverage.json'), { ...binding, graph })
  assert.equal(transactions.oracle, `tpnil-native-coverage-transactions-oracle@${completion ? nativeCompletionProfile(binding.profile!).transactionRevision : 2}.0.0`)
  const transactionFunding = await verifyCoverageModuleFunding(transactions.trace, binding)
  assert.equal(extension.oracle, `tpnil-native-coverage-extension-oracle@${completion ? nativeCompletionProfile(binding.profile!).extensionRevision : 2}.0.0`)
  const extensionBindings = await verifyCoverageExtensionParentBindings(extension, { identity: binding.identity, boundary: json('integrated/boundary.json'), clauses: json('conformance/clauses.json'), trust: json('integrated/identity-trust.json'), storage: binding.storageTransactions, submissions: binding.globalSubmissions, finalSubmissions: binding.finalSubmissions, graph,
    outputSnapshotObservations: json('native-output-snapshot-observations.json'), outputProviderRegistry: json('native-output-provider-registry.json') })
  const extensionFunding = await verifyCoverageModuleFunding(extension.trace, { ...binding, declaredNativePayments: transactionFunding.declaredNativePayments }, { assertions: extension.assertions, predicateFor: call => coverageExtensionTransactionPredicate(call.id) })
  const foreignOwnerFixture = binding.profile === 'ITCVE-1@4.8.0' ? bindForeignOwnerFixture(transactions, extension, extensionBindings, extensionFunding, binding.globalSubmissions) : undefined
  const laterNativeOwnedSpend = binding.profile === 'ITCVE-1@4.8.0' ? await verifyLaterNativeOwnedSpend({ ...binding, profile: binding.profile }) : undefined
  const transactionBindings = await verifyTransactionCoverageParentBindings(transactions, { ...binding, graph, ...(foreignOwnerFixture ? {foreignOwnerFixture} : {}), ...(laterNativeOwnedSpend ? {laterNativeOwnedSpend} : {}) })
  const certificateBindings = await verifyCertificateCoverageParentBindings(certificates, { ...binding, browserContexts: contexts.contexts, globalRoutes: json('routes.json'), trustedMinedRoot: graph.trustedMinedRoot })
  const certificateFunding = await verifyCoverageModuleFunding(certificates.trace, { ...binding, declaredNativePayments: extensionFunding.declaredNativePayments })
  assert.ok(permission.submissionWindow.endIndex <= transactions.submissionStart && transactions.submissionEnd <= extension.submissionStart && extension.submissionEnd <= certificates.submissionStart, 'Coverage module submission windows are out of order')
  const base = { verified: true as const, prelude, browser, permissions, transactions: { ...transactionBindings, funding: transactionFunding }, extension: { ...extensionBindings, transactionOwnershipAndFundingStillRequired: false, funding: extensionFunding }, certificates: { ...certificateBindings, funding: certificateFunding } }
  if (completion) assert.ok(binding.completionPrerequisites, 'Current complete native parent receipts are required')
  const completions = completion ? await verifyCompletionParent({ ...binding, profile: binding.profile as 'ITCVE-1@4.5.0' | 'ITCVE-1@4.6.0' | 'ITCVE-1@4.7.0' | 'ITCVE-1@4.8.0', declaredNativePayments: certificateFunding.declaredNativePayments }, { ...binding.completionPrerequisites!, coverageSuiteBindings: base }) : undefined
  return { ...base, ...(completions ? { completions } : {}) }
}
