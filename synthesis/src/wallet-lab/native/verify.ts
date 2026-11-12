import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Beef, LockingScript, P2PKH, PrivateKey, ProtoWallet, PublicKey, PushDrop, Transaction, Utils } from '@bsv/sdk'
import { canonicalJson, sha256Hex } from '../../determinism.js'
import { aggregateOutcome, type VectorResult } from '../model.js'
import { verifyEvidenceBundle } from '../evidence.js'
import { controlledHeaderFixture, controlledHeaderPolicyPath, getControlledHeaderFixture } from './controlled-header-fixture.js'

/** Bind both independent public header probes to the explicitly selected fixture.
 * A returned error stays an observation; the boundary oracle scores the result. */
export function verifyNativeControlledHeaderEvidence(plan: any, boundary: any, inventory: any): void {
  const fixture = getControlledHeaderFixture(controlledHeaderFixture)
  assert.equal(plan.headerFixture, fixture.id)
  assert.equal(plan.headerFixturePolicy, controlledHeaderPolicyPath)
  assert.equal(plan.headerFixturePolicySha256, fixture.policySha256)
  for (const report of [boundary, inventory]) {
    assert.equal(report.headerFixture, fixture.id)
    assert.equal(report.headerFixturePolicySha256, fixture.policySha256)
    assert.equal(report.headerFundingFixtureSha256, fixture.fixtureSha256)
  }
  assert.deepEqual(inventory.safeBoundary.headerRequest, { height: fixture.height })
  assert.notEqual(Object.hasOwn(inventory.safeBoundary, 'header'), Object.hasOwn(inventory.safeBoundary, 'headerError'))
}

export function verifyHostReceipt(observation: Record<string, any>, image: string): void {
  assert.equal(observation.image, image); assert.equal(observation.networkMode, 'none'); assert.equal(observation.privileged, false)
  assert.equal(observation.readonly, true); assert.equal(observation.init, true); assert.equal(observation.pidMode, '')
  assert.deepEqual(observation.capDrop, ['ALL']); assert.ok(!observation.capAdd?.length)
  assert.match(observation.user, /^[1-9]\d*:[1-9]\d*$/)
  assert.deepEqual(observation.mounts.filter((mount: { type: string }) => mount.type === 'bind').map((mount: { destination: string }) => mount.destination), ['/evidence'])
  assert.ok(Object.keys(observation.networks).every(name => name === 'none'))
}

/** Compare the complete projections returned by independent child verification,
 * including each assertion identity and outcome rather than vector totals. */
export function verifyConformanceRepetitionAgreement(semanticProjections: readonly string[]): void {
  assert.equal(semanticProjections.length, 2, 'Conformance requires two independently verified semantic projections')
  assert.ok(semanticProjections.every(projection => typeof projection === 'string' && projection.length > 0))
  assert.equal(semanticProjections[0], semanticProjections[1], 'Conformance repetitions differ in per-assertion identities or outcomes')
}

/** Bind BRC153 annotations to a separately captured, authenticated storage snapshot.
 * This evidence is observer-side and never substitutes for a public wallet call. */
export function verifyNativeActionReferenceBinding(conditional: any, finalReferences: any, walletIdentity: string): void {
  assert.equal(finalReferences.identity, conditional.identity)
  assert.equal(finalReferences.identity, walletIdentity)
  const validateRows = (rows: any): Map<string, string> => {
    assert.ok(Array.isArray(rows) && rows.length <= 2048)
    const byTxid = new Map<string, string>()
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['reference', 'txid'])
      assert.match(row.txid, /^[0-9a-f]{64}$/)
      assert.equal(typeof row.reference, 'string'); assert.ok(row.reference.length > 0 && row.reference.length <= 300)
      assert.equal(Buffer.from(row.reference, 'base64').toString('base64'), row.reference)
      assert.ok(!byTxid.has(row.txid), 'Duplicate stored action reference')
      byTxid.set(row.txid, row.reference)
    }
    return byTxid
  }
  const final = validateRows(finalReferences.references)
  for (const [txid, reference] of validateRows(conditional.actionReferences)) assert.equal(final.get(txid), reference, 'Conditional reference differs from final identity-scoped storage snapshot')
}

export async function verifyNativeWallet(directory: string) {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
  const lock = read('run-lock.json'), plan = lock.plan
  assert.equal(lock.schema, 'tpnil-native-wallet-run-lock@1.0.0')
  const completion = lock.executionVariant === 'integrated-native-conformance-pr368-coverage-3'
  const recovery = lock.executionVariant === 'integrated-native-conformance-pr368-coverage-2'
  const expanded = completion || recovery || lock.executionVariant === 'integrated-native-conformance-pr368-coverage-1'
  const candidate = ['ITCVE-1@4.1.0', 'ITCVE-1@4.2.0', 'ITCVE-1@4.3.0', 'ITCVE-1@4.4.0', 'ITCVE-1@4.5.0'].includes(plan.itcve)
  const observer3 = lock.executionVariant === 'integrated-native-conformance-pr368-cb3c2f2-observer-3'
  const observer2 = lock.executionVariant === 'integrated-native-conformance-5.1.1-observer-2'
  if (completion) { assert.equal(plan.admissionState, 'FROZEN'); assert.equal(plan.observationEncoding, 'tpnil-coverage-observation@1.0.0'); assert.equal(plan.browserContexts, 9); assert.equal(plan.portabilityOracle, 'tpnil-native-portability-oracle@4.0.0') }
  if (expanded) { assert.equal(plan.itcve, completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' : 'ITCVE-1@4.3.0'); assert.equal(plan.observerRevision, 3); assert.equal(plan.coverageRevision, completion ? 3 : recovery ? 2 : 1); assert.equal(plan.permissionFixture, 'fresh-managed-funding-v1') }
  else if (observer3) { assert.equal(plan.itcve, 'ITCVE-1@4.2.0'); assert.equal(plan.observerRevision, 3) }
  else if (observer2) { assert.equal(plan.itcve, 'ITCVE-1@4.0.0'); assert.equal(plan.observerRevision, 2) }
  else assert.equal(plan.observerRevision, undefined)
  const fixtureRevision = candidate || observer2 ? 2 : 1
  const wallet511 = candidate || plan.itcve === 'ITCVE-1@4.0.0'
  const closure = wallet511 || plan.itcve === 'ITCVE-1@2.0.0'
  const coverage = closure || plan.itcve === 'ITCVE-1@1.5.0'
  const conformance = coverage || plan.itcve === 'ITCVE-1@1.4.0'
  if (conformance) assert.equal(plan.clauseOracle, completion ? 'tpnil-brc100-clause-oracle@7.0.0' : wallet511 ? fixtureRevision === 2 ? 'tpnil-brc100-clause-oracle@6.0.0' : 'tpnil-brc100-clause-oracle@5.0.0' : coverage ? 'tpnil-brc100-clause-oracle@4.0.0' : 'tpnil-brc100-clause-oracle@3.0.0')
  if (coverage) {
    assert.equal(plan.permissionOracle, closure ? 'tpnil-native-permission-oracle@2.0.0' : undefined)
    assert.equal(plan.permissionLifecycleOracle, closure ? 'tpnil-native-permission-lifecycle-oracle@2.0.0' : 'tpnil-native-permission-lifecycle-oracle@1.0.0')
    if (closure) assert.equal(plan.shutdownSubmissionPolicy, wallet511 ? 'tpnil-native-shutdown-submissions@2.0.0' : 'tpnil-native-shutdown-submissions@1.0.0')
  }
  const trustedIdentity = conformance || plan.id === 'YOURS-5.1.0-GO-ITCVE-1.3.0-TRUSTED-IDENTITY'
  const integrated = trustedIdentity || plan.id === 'YOURS-5.1.0-GO-ITCVE-1.3.0'
  const frozen = JSON.parse(fs.readFileSync(fileURLToPath(new URL(completion ? '../../../../infra/native/conformance/plan-pr368-coverage-3-source-3.json' : recovery ? '../../../../infra/native/conformance/plan-pr368-coverage-2.json' : expanded ? '../../../../infra/native/conformance/plan-pr368-coverage-1.json' : observer3 ? '../../../../infra/native/conformance/plan-pr368-cb3c2f2-observer-3.json' : candidate ? '../../../../infra/native/conformance/plan-pr368-7e39006.json' : observer2 ? '../../../../infra/native/conformance/plan-5.1.1-observer-2.json' : wallet511 ? '../../../../infra/native/conformance/plan-5.1.1.json' : closure ? '../../../../infra/native/conformance/plan-coverage-closure.json' : coverage ? '../../../../infra/native/conformance/plan-coverage.json' : conformance ? '../../../../infra/native/conformance/plan.json' : trustedIdentity ? '../../../../infra/native/integrated/plan-trusted.json' : integrated ? '../../../../infra/native/integrated/plan.json' : '../../../../infra/native/yours-go/plan.json', import.meta.url)), 'utf8'))
  assert.equal(canonicalJson(plan), canonicalJson(frozen))
  assert.equal(plan.id, conformance ? frozen.id : trustedIdentity ? 'YOURS-5.1.0-GO-ITCVE-1.3.0-TRUSTED-IDENTITY' : integrated ? 'YOURS-5.1.0-GO-ITCVE-1.3.0' : 'YOURS-5.1.0-GO-ITCVE-1.2.0')
  if (integrated) {
    const root = path.resolve(import.meta.dirname, '../../../..')
    if (conformance) for (const [name, digest] of Object.entries(plan.conformanceInputs as Record<string, string>)) assert.equal(sha256Hex(fs.readFileSync(path.join(root, name))), digest, `Conformance input differs: ${name}`)
    if (trustedIdentity) {
      assert.equal(plan.identityTrust, 'public-settings-token')
      assert.equal(sha256Hex(fs.readFileSync(path.join(root, plan.identityTrustProfile))), plan.identityTrustProfileSha256)
    }
    assert.equal(sha256Hex(fs.readFileSync(path.join(root, plan.compatibilityPatch))), plan.compatibilityPatchSha256)
    assert.equal(sha256Hex(fs.readFileSync(path.join(root, plan.boundaryProfile))), plan.boundaryProfileSha256)
  }
  assert.equal(sha256Hex(Buffer.from(JSON.stringify(plan, null, 2) + '\n')), lock.planSha256)
  assert.equal(lock.image.os, 'linux'); assert.equal(lock.image.architecture, 'amd64')
  assert.equal(lock.runner.platform, 'linux'); assert.equal(lock.runner.architecture, 'x64')
  assert.match(lock.source, /^[a-f0-9]{40}$/)
  const userns = read('host-userns.json')
  assert.equal(userns.active, '0'); assert.equal(userns.restored, userns.before); assert.equal(userns.restoredSuccessfully, true)
  const results = []
  const conformanceSemanticProjections: string[] = []
  const containers = new Set<string>()
  for (let index = 1; index <= 2; index++) {
    const before = read(`host-repetition-${index}-before.json`), after = read(`host-repetition-${index}-after.json`), cleanup = read(`host-repetition-${index}-cleanup.json`)
    assert.equal(before.id, after.id); assert.equal(before.id, cleanup.id); assert.ok(!containers.has(before.id)); containers.add(before.id)
    for (const observation of [before, after]) {
      verifyHostReceipt(observation, lock.image.id)
    }
    assert.equal(after.state.Running, false); assert.equal(after.state.Status, 'exited'); assert.equal(after.state.Pid, 0)
    assert.equal(after.state.ExitCode, 0); assert.equal(after.state.OOMKilled, false); assert.equal(cleanup.removed, true)
    const rep = path.join(directory, `repetition-${index}`)
    const record = verifyEvidenceBundle(rep)
    assert.equal(record.itcve, completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' : expanded ? 'ITCVE-1@4.3.0' : observer3 ? 'ITCVE-1@4.2.0' : candidate ? 'ITCVE-1@4.1.0' : wallet511 ? 'ITCVE-1@4.0.0' : closure ? 'ITCVE-1@2.0.0' : coverage ? 'ITCVE-1@1.5.0' : conformance ? 'ITCVE-1@1.4.0' : integrated ? 'ITCVE-1@1.3.0' : 'ITCVE-1@1.1.0')
    const evidence = (name: string) => JSON.parse(fs.readFileSync(path.join(rep, 'evidence', name), 'utf8'))
    const installed = read(`repetition-${index}/installed-artifacts.json`)
    assert.equal(installed.exactArchiveContents, true)
    assert.match(installed.walletDirectorySha256, /^[a-f0-9]{64}$/); assert.match(installed.applicationDirectorySha256, /^[a-f0-9]{64}$/)
    if (candidate) { assert.equal(plan.walletCandidate.officialRelease, false); assert.deepEqual(record.walletCandidate, plan.walletCandidate); assert.equal(record.claim, 'ENGINEERING_OBSERVATION_ONLY') }
    assert.deepEqual(record.artifacts.wallet, plan.wallet); assert.deepEqual(record.artifacts.application, plan.application)
    assert.deepEqual(record.configuration.serviceComponents?.components, plan.components)
    assert.deepEqual(record.vectors.map(vector => vector.id), Array.from({ length: 8 }, (_, i) => `ISI-4-V00${i+1}`))
    for (const vector of record.vectors) assert.equal(record.semanticProjection[vector.id.toLowerCase().replace('isi-4-', '')], vector.outcome)
    assert.equal(record.runner.architecture, 'x64')
    if (wallet511) {
      assert.deepEqual(record.configuration.controlledDestinations, plan.controlledDestinations)
      assert.deepEqual(evidence('routes.json'), record.observations.routes)
      for (const route of record.observations.routes) {
        assert.ok(['controlled-wallet-storage', 'controlled-service', 'controlled-application', 'blocked-egress'].includes(route.disposition))
        if (route.disposition !== 'blocked-egress') assert.ok(plan.controlledDestinations.includes(route.host), `Undeclared controlled destination: ${route.host}`)
      }
      assert.equal(plan.conditionalOracle, `tpnil-native-conditional-oracle@${fixtureRevision}.0.0`)
      assert.equal(evidence('conformance/conditional.json').oracle, plan.conditionalOracle)
      assert.equal(evidence('integrated/boundary.json').fixtureRevision, fixtureRevision === 2 ? 2 : undefined)
      if (observer3 || expanded) {
        const { identityTrustOracle2Id, getIdentityTrustOracle2Policy } = await import('./identity-trust-oracle2.js')
        const trustPolicy = getIdentityTrustOracle2Policy()
        assert.equal(plan.identityTrustOracle, identityTrustOracle2Id)
        assert.equal(plan.identityTrustOraclePolicy, 'infra/native/integrated/identity-trust-oracle-2.0.0.json')
        assert.equal(plan.identityTrustOraclePolicySha256, trustPolicy.policySha256)
        const { verifyNativeTrust } = await import('./verify-identity-trust.js')
        await verifyNativeTrust(evidence('integrated/identity-trust.json'), evidence('integrated/boundary.json'), { oracle: identityTrustOracle2Id })
        verifyNativeControlledHeaderEvidence(plan, evidence('integrated/boundary.json'), evidence('method-inventory.json'))
        const { verifyBoundaryCorpus } = await import('../verify-boundary.js')
        await verifyBoundaryCorpus(evidence('integrated/boundary.json'), evidence('integrated/boundary-publication.json'), controlledHeaderFixture)
      } else {
        assert.equal(plan.headerFixture, undefined)
        assert.equal(evidence('integrated/boundary.json').headerFixture, undefined)
      }
      assert.equal(plan.permissionCoverageOracle, `tpnil-native-permission-coverage-oracle@${expanded ? 5 : fixtureRevision === 2 ? 3 : 1}.0.0`)
      assert.equal(evidence('conformance/permission-coverage.json').oracle, plan.permissionCoverageOracle)
      if (fixtureRevision === 2) {
        completion ? assert.equal(plan.expectedObservations, 698) : assert.equal(plan.expectedObservations, expanded ? 535 : 426)
        assert.equal(record.vectors.reduce((count, vector) => count + vector.assertions.length, 0), plan.expectedObservations)
        assert.equal(plan.transactionStateOracle, observer3 || expanded ? 'tpnil-native-transaction-states-oracle@2.0.0' : 'tpnil-native-transaction-states-oracle@1.0.0')
        assert.equal(plan.certificateStateOracle, 'tpnil-native-certificate-states-oracle@1.0.0')
        assert.equal(evidence('conformance/transaction-states.json').oracle, plan.transactionStateOracle)
        assert.equal(evidence('conformance/certificate-states.json').oracle, plan.certificateStateOracle)
      }
    }
    assert.equal(record.observations.walletVersion, wallet511 ? 'yours-wallet-5.1.1' : 'yours-wallet-5.1.0'); assert.equal(record.observations.walletNetwork, 'mainnet'); assert.equal(record.observations.authenticated, true)
    assert.match(fs.readFileSync(path.join(rep, 'browser-version.txt'), 'utf8'), /151\.0\.7922\.34/)
    const worker = read(`repetition-${index}/worker.json`)
    const mongoCleanup = read(`repetition-${index}/mongo-cleanup.json`)
    assert.equal(mongoCleanup.clean, true); assert.equal(mongoCleanup.forced, false); assert.equal(mongoCleanup.code, 0)
    assert.equal(worker.completed, true); assert.equal(worker.cleanWalletAndServiceShutdown, true)
    assert.equal(worker.recordSha256, sha256Hex(fs.readFileSync(path.join(rep, 'record.json'))))
    assert.equal(worker.planSha256, lock.planSha256)
    for (const phase of ['before', 'after']) {
      const network = read(`repetition-${index}/network-${phase}.json`)
      assert.ok(Object.values(network.interfaces as Record<string, Array<{ internal: boolean }>>).flat().every(address => address.internal))
      assert.match(network.capabilities, /^CapEff:\s+0+$/)
      assert.equal(network.probes.length, 2)
      assert.ok(network.probes.every((probe: { code: string }) => ['ENETUNREACH', 'EHOSTUNREACH', 'EPERM', 'EACCES'].includes(probe.code)))
    }
    const sandbox = fs.readFileSync(path.join(rep, 'evidence/native-sandbox.txt'), 'utf8')
    assert.match(sandbox, /PID namespaces\s+Yes/); assert.match(sandbox, /Seccomp-BPF sandbox\s+Yes/)
    assert.equal(sha256Hex(Buffer.from(sandbox)), worker.sandboxSha256)
    assert.match(fs.readFileSync(path.join(rep, 'evidence/native-trust.txt'), 'utf8'), /ITCVE controlled CA/)
    const source = evidence('mined-funding-source.json'), fixture = source.fixture
    const header = Buffer.from(fixture.blockHeaderHex, 'hex')
    assert.equal(header.length, 80)
    assert.equal(createHash('sha256').update(createHash('sha256').update(header).digest()).digest().reverse().toString('hex'), fixture.fundingBlockHash)
    assert.equal(Buffer.from(header.subarray(36, 68)).reverse().toString('hex'), fixture.merkleRoot)
    assert.equal(sha256Hex(Buffer.from(canonicalJson(fixture))), plan.fundingFixtureCanonicalSha256)
    const ancestor = Transaction.fromAtomicBEEF(Utils.toArray(fixture.atomicBeefHex, 'hex'))
    assert.equal(ancestor.id('hex'), fixture.txid); assert.equal(ancestor.toHex(), fixture.rawHex)
    assert.equal(sha256Hex(Buffer.from(fixture.atomicBeefHex, 'hex')), fixture.atomicBeefSha256)
    assert.ok(fixture.maturityDepth >= 100)
    const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
    assert.ok(await ancestor.verify(tracker))
    const funding = Transaction.fromAtomicBEEF([...fs.readFileSync(path.join(rep, 'evidence/funding.atomicbeef'))])
    const transactions = new Map<string, Transaction>()
    function add(tx: Transaction, depth = 0) { assert.ok(depth < 32); if (transactions.has(tx.id('hex'))) return; transactions.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) add(input.sourceTransaction, depth + 1) }
    add(funding)
    const reserveReport = conformance ? evidence('conformance/funding-reserves.json') : undefined
    if (reserveReport) for (const payment of reserveReport.payments) add(Transaction.fromAtomicBEEF(payment.beef))
    const created = evidence('created-output.json')
    const create = Transaction.fromAtomicBEEF(Beef.fromBinary([...fs.readFileSync(path.join(rep, 'evidence/create.beef'))]).toBinaryAtomic(record.observations.createTxid!)); add(create)
    const storageTransactions = new Map<string, Transaction>()
    for (const item of evidence('native-transactions.json')) { const tx = Transaction.fromHex(item.rawTxHex); assert.equal(tx.id('hex'), item.txid); storageTransactions.set(item.txid, tx); if (!transactions.has(item.txid)) transactions.set(item.txid, tx); else assert.equal(transactions.get(item.txid)!.toHex(), tx.toHex()) }
    for (const tx of transactions.values()) for (const input of tx.inputs) if (!input.sourceTransaction) input.sourceTransaction = transactions.get(input.sourceTXID!)
    function ancestry(tx: Transaction, target: string, depth = 0): boolean { assert.ok(depth < 32); return tx.inputs.some(input => input.sourceTXID === target || (input.sourceTransaction !== undefined && ancestry(input.sourceTransaction, target, depth + 1))) }
    const nativeFundingRoots = [funding.id('hex')]
    if (conformance) {
      const { verifyConformanceReserves } = await import('./verify-conformance-reserves.js')
      const identity = evidence('integrated/result.json').walletIdentity
      assert.equal(reserveReport.storageSnapshot.implementation, plan.components.storage)
      const scenario = evidence('conformance/scenario-start.json')
      assert.equal(scenario.stage, 'before-all-customer-scenarios')
      const reserves = await verifyConformanceReserves(reserveReport, { policy: plan.fundingReserves, identity, initialFundingTxid: funding.id('hex'),
        scenarioStartedAt: scenario.startedAt, workerStartedAt: worker.startedAt, submissions: evidence('native-submissions.json'),
        firstCustomerTxid: expanded ? evidence('conformance/permission-coverage.json').steps.find((row: any) => row.id === 'setup-basket').outcome.value.txid : create.id('hex'), transactions, storageTransactions, fixture })
      nativeFundingRoots.push(...reserves.roots)
      const sender = new ProtoWallet(PrivateKey.fromHex('22'.repeat(32)))
      const expectedKey = await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${Buffer.from('tpnil-wallet-lab').toString('base64')} ${Buffer.from('funding-001').toString('base64')}`, counterparty: identity, forSelf: false })
      assert.equal(source.publicKey, expectedKey.publicKey, 'Initial funding payment belongs to another native identity')
    }
    const { spendsOnlyDeclaredNativePayments, verifyBoundaryFundingRoot } = await import('./verify-conformance-reserves.js')
    const nativeFundingOutpoints = nativeFundingRoots.map(txid => `${txid}.0`)
    assert.ok(ancestry(funding, fixture.txid)); assert.ok(conformance ? spendsOnlyDeclaredNativePayments(create, nativeFundingOutpoints) : ancestry(create, funding.id('hex')))
    assert.ok(await funding.verify(tracker)); assert.ok(await create.verify(tracker))
    const script = new P2PKH().lock(PublicKey.fromString(source.publicKey).toAddress())
    assert.equal(funding.outputs[0]?.lockingScript.toHex(), script.toHex()); assert.equal(funding.outputs[0]?.satoshis, 10000)
    const outputIndex = Number(String(created.created.outputs.find((output: { outpoint: string }) => output.outpoint.startsWith(create.id('hex'))).outpoint).split(/[._]/)[1])
    const output = create.outputs[outputIndex]!
    assert.equal(output.satoshis, plan.amount)
    assert.equal(output.lockingScript.toHex(), created.lockingScript)
    assert.equal(Utils.toUTF8(PushDrop.decode(LockingScript.fromHex(output.lockingScript.toHex())).fields[0]!), '1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG')
    assert.equal(created.plaintext, plan.task)
    const reload = evidence('cold-reload.json'); assert.equal(reload.localStorageCleared, true); assert.equal(reload.taskVisible, true)
    const outpoint = `${create.id('hex')}.${outputIndex}`
    assert.ok(reload.afterReload.outputs.some((item: { outpoint: string }) => item.outpoint.replace('_', '.') === outpoint))
    const redeem = evidence('redeem.json')
    assert.ok(!redeem.afterRedeem.outputs.some((item: { outpoint: string }) => item.outpoint.replace('_', '.') === outpoint))
    const spend = [...transactions.values()].find(tx => tx.inputs.some(input => input.sourceTXID === create.id('hex') && input.sourceOutputIndex === outputIndex))
    assert.ok(spend, 'serialized redemption spend absent from Go storage')
    assert.ok(await spend.verify(tracker))
    let inputs = 0; for (const input of spend.inputs) { const sourceOutput = input.sourceTransaction?.outputs[input.sourceOutputIndex!]; assert.ok(sourceOutput?.satoshis !== undefined); inputs += sourceOutput.satoshis }
    const outputs = spend.outputs.reduce((sum, item) => sum + (item.satoshis ?? 0), 0); assert.ok(inputs >= outputs)
    let vectors: VectorResult[] = structuredClone(conformance ? evidence('conformance/baseline-vectors.json') : record.vectors)
    if (conformance) { assert.equal(record.program, completion ? 'ISI-4@5.5.0' : recovery ? 'ISI-4@5.4.0' : expanded ? 'ISI-4@5.3.0' : observer3 ? 'ISI-4@5.2.0' : candidate ? 'ISI-4@5.1.0' : wallet511 ? 'ISI-4@5.0.0' : closure ? 'ISI-4@4.0.0' : coverage ? 'ISI-4@3.0.0' : 'ISI-4@2.0.0'); assert.equal(record.profile, candidate ? 'candidate-wallet-native-engineering' : 'production-wallet-native-conformance') }
    for (const vector of vectors.slice(0, 4)) assert.equal(vector.outcome, 'PASS')
    const permission = evidence('permissions.json')
    const explicitDenial = (value: { rejected?: boolean; independentlyPrompted?: boolean; message?: string }) =>
      (value.rejected === true || value.independentlyPrompted === true) && /permission|denied|user reject|not authori[sz]ed/i.test(value.message ?? '') && !/timeout|network error|fetch failed|500|502|503/i.test(value.message ?? '')
    const deniedPrompt = (origin: string) => permission.permissions.some((item: { origin: string; decision: string }) => item.origin.includes(origin) && item.decision === 'deny')
    vectors[4]!.outcome = explicitDenial(permission.denial) && explicitDenial(permission.crossOrigin) && deniedPrompt('deny.itcve.test') && deniedPrompt('alternate.itcve.test') ? 'PASS' : 'FAIL'
    const lifecycle = evidence('broadcast-lifecycle.json')
    if (conformance) {
      const { verifyTodoSubmissionBinding } = await import('./verify-todo-submission-binding.js')
      const { verifyLifecycleSubmissionBinding } = await import('./lifecycle-submission-binding.js')
      assert.equal(plan.todoSubmissionBinding, 'tpnil-native-todo-submission-binding@1.0.0')
      const selected = verifyTodoSubmissionBinding(lifecycle, evidence('native-submissions.json'), plan.task)
      verifyLifecycleSubmissionBinding(evidence('conformance/lifecycle.json'), evidence('native-submissions.json'))
      for (const txid of selected) {
        const tx = transactions.get(txid)
        assert.ok(tx, 'Selected ToDo lifecycle transaction is absent from retained storage')
        assert.equal(storageTransactions.get(txid)?.toHex(), tx.toHex())
        assert.ok(spendsOnlyDeclaredNativePayments(tx, nativeFundingOutpoints), 'ToDo lifecycle transaction spends outside the declared upfront funding')
        assert.ok(await tx.verify(tracker), 'Selected ToDo lifecycle transaction signature or mined proof is invalid')
      }
    }
    let completionObserverBindings: ReturnType<typeof import('./completion-observer-ledger.js').verifyCompletionInventoryClosure> | undefined
    let controlAncestryBindings: Awaited<ReturnType<typeof import('./coverage-control-ancestry.js').hydrateCoverageControlAncestry>> | undefined
    let completionFundingRootBindings: Awaited<ReturnType<typeof import('./coverage-completion/funding-roots.js').deriveCompletionNativeFundingRoots>> | undefined
    let completionFixtureBindings: Awaited<ReturnType<typeof import('./coverage-completion/transaction-known-source.js').hydrateTransactionCompletionFixture>> | undefined
    let conditionalTransactionBindings: Awaited<ReturnType<typeof import('./verify-conditional-transaction-bindings.js').verifyConditionalTransactionBindings>> | undefined
    let transactionStateBindings: Awaited<ReturnType<typeof import('./verify-transaction-state-bindings.js').verifyNativeTransactionStateBindings>> | undefined
    let submissionAncestryBindings: Awaited<ReturnType<typeof import('./verify-submission-ancestry.js').verifyFinalPermissionSubmissionAncestry>> | undefined
    let coverageSuiteBindings: Awaited<ReturnType<typeof import('./verify-coverage-suite.js').verifyNativeCoverageSuite>> | undefined
    const acceptedCount = lifecycle.accepted.outputs?.totalOutputs
    const accepted = lifecycle.accepted.submission?.verdict === 'ACCEPTED_BY_NETWORK' && lifecycle.accepted.body.includes('Task successfully created!')
    const rejected = lifecycle.rejected.submission?.verdict === 'REJECTED' && acceptedCount !== undefined && lifecycle.rejected.outputs?.totalOutputs === acceptedCount
    const recovered = lifecycle.recovered.submission?.verdict === 'ACCEPTED_BY_NETWORK' && acceptedCount !== undefined && lifecycle.recovered.outputs?.totalOutputs === acceptedCount + 1
    vectors[5]!.outcome = accepted && rejected && recovered ? 'PASS' : 'FAIL'
    if (conformance) {
      assert.deepEqual(vectors[5]!.assertions.map(row => row.id), ['accepted-service-verdict-observed', 'rejection-preserves-wallet-state', 'post-rejection-recovery'])
      for (const [index, passed] of [accepted, rejected, recovered].entries()) vectors[5]!.assertions[index]!.outcome = passed ? 'PASS' : 'FAIL'
    }
    assert.equal(vectors[6]!.outcome, 'BLOCKED'); assert.equal(vectors[7]!.outcome, 'BLOCKED')
    if (conformance) {
      const clauses = evidence('conformance/clauses.json')
      const metadata = clauses.trace.find((row: any) => row.id === 'setup.metadata')
      assert.ok(metadata, 'Clause metadata creation observation is absent')
      assert.equal(clauses.metadataTxid, metadata.result?.txid)
      let corpusPayment: string | undefined
      if (typeof metadata.result?.txid === 'string') {
        const transaction = transactions.get(metadata.result.txid)
        assert.ok(transaction, 'Native storage omitted the clause metadata transaction')
        corpusPayment = await verifyBoundaryFundingRoot(evidence('integrated/boundary.json'), { identity: evidence('integrated/result.json').walletIdentity, fixture, storageTransactions, submissions: evidence('native-submissions.json'), metadataTxid: transaction.id('hex') })
        assert.ok(spendsOnlyDeclaredNativePayments(transaction, [...nativeFundingOutpoints, ...(corpusPayment ? [corpusPayment] : [])]), 'Clause metadata has an input outside the exact initial reserves or independently verified method-corpus payment')
        assert.ok(await transaction.verify(tracker), 'Clause metadata signature or mined ancestry is invalid')
        for (const [index, satoshis] of [2, 3, 4].entries()) {
          assert.equal(transaction.outputs[index]?.satoshis, satoshis)
          assert.equal(transaction.outputs[index]?.lockingScript.toHex(), '51')
        }
      }
      if (coverage) {
        const permissionLifecycle = evidence('conformance/permission-lifecycle.json')
        const window = permissionLifecycle.submissionWindow, submissions = evidence('native-submissions.json')
        assert.ok(Number.isSafeInteger(window.startIndex) && window.startIndex >= 0 && Number.isSafeInteger(window.endIndex) && window.endIndex >= window.startIndex && window.endIndex <= submissions.length)
        assert.deepEqual(window.entries, submissions.slice(window.startIndex, window.endIndex).map((row: any, offset: number) => ({ index: window.startIndex + offset, txid: row.txid, verdict: row.verdict, serializedHex: row.beefHex })), 'Permission lifecycle window differs from the complete global receipt ledger')
        assert.ok(Array.isArray(permissionLifecycle.transactions))
        const rows = [...permissionLifecycle.transactions]
        if (wallet511) {
          const conditional = evidence('conformance/conditional.json'), permissionCoverage = evidence('conformance/permission-coverage.json')
          if (fixtureRevision === 2) verifyNativeActionReferenceBinding(conditional, evidence('native-action-references.json'), evidence('integrated/result.json').walletIdentity)
          assert.deepEqual(conditional.submissions, submissions.slice(0, conditional.submissions.length).map((row: any, index: number) => ({ index, txid: row.txid, serializedHex: row.beefHex, verdict: row.verdict })), 'Conditional module ledger differs from the global receipt prefix')
          assert.deepEqual(permissionCoverage.submissions, submissions.slice(0, permissionCoverage.submissions.length), 'Permission coverage ledger differs from the global receipt prefix')
          const { verifyConditionalTransactionBindings } = await import('./verify-conditional-transaction-bindings.js')
          conditionalTransactionBindings = await verifyConditionalTransactionBindings(conditional, { storageTransactions, declaredNativePayments: [...nativeFundingOutpoints, ...(corpusPayment ? [corpusPayment] : [])], fixture })
          rows.push(...permissionCoverage.transactions.map((row: any) => ({ ...row, role: `permission-coverage/${row.role}` })))
        }
        const anchor = clauses.trace.find((row: any) => row.id === 'setup.input.createAction.options.noSendChange.0')
        if (Array.isArray(anchor?.result?.tx) && typeof anchor.result.txid === 'string') rows.push({ role: 'clause-nosend-anchor', txid: anchor.result.txid, atomicBeef: anchor.result.tx })
        const { verifyCoverageNativeTransactions } = await import('./verify-conformance-coverage-transactions.js')
        await verifyCoverageNativeTransactions(rows, { storageTransactions, declaredNativePayments: [...nativeFundingOutpoints, ...(corpusPayment ? [corpusPayment] : [])], fixture })
        if (closure) {
          const { verifyNativeShutdownSubmissions } = await import('./verify-shutdown-submissions.js')
          await verifyNativeShutdownSubmissions(fs.readFileSync(path.join(rep, 'shutdown-submissions.json')), {
            worker, recordBytes: fs.readFileSync(path.join(rep, 'record.json')),
            globalSubmissionsBytes: fs.readFileSync(path.join(rep, 'evidence/native-submissions.json')),
            permissionReportBytes: fs.readFileSync(path.join(rep, 'evidence/conformance/permission-lifecycle.json')),
            ...(wallet511 ? { permissionCoverageReportBytes: fs.readFileSync(path.join(rep, 'evidence/conformance/permission-coverage.json')) } : {}),
            counterpartsBytes: fs.readFileSync(path.join(rep, 'evidence/conformance/service-counterparts.json')),
            expectedIdentity: evidence('integrated/result.json').walletIdentity,
            readEvidence: (name: string) => fs.readFileSync(path.join(rep, 'evidence', name)), storageTransactions
          })
          if (fixtureRevision === 2) {
            const { verifyNativeTransactionStateBindings } = await import('./verify-transaction-state-bindings.js')
            const shutdown = JSON.parse(fs.readFileSync(path.join(rep, 'shutdown-submissions.json'), 'utf8'))
            if (plan.itcve === 'ITCVE-1@4.5.0') {
              const { verifyCompletionInventoryClosure, completionInventoryLedgerFile, completionInventoryClosureFile } = await import('./completion-observer-ledger.js')
              const inventoryClosureBytes = fs.readFileSync(path.join(rep, completionInventoryClosureFile))
              assert.equal(worker.completionInventoryClosureSha256, sha256Hex(inventoryClosureBytes))
              assert.ok(Date.parse(JSON.parse(inventoryClosureBytes.toString()).capturedAt) <= Date.parse(worker.endedAt))
              completionObserverBindings = verifyCompletionInventoryClosure({
                initialBytes: fs.readFileSync(path.join(rep, 'evidence', completionInventoryLedgerFile)),
                closureBytes: inventoryClosureBytes,
                recordBytes: fs.readFileSync(path.join(rep, 'record.json')), shutdownBytes: fs.readFileSync(path.join(rep, 'shutdown-submissions.json')),
                identity: evidence('integrated/result.json').walletIdentity, readEvidence: name => fs.readFileSync(path.join(rep, 'evidence', name))
              })
              const { hydrateCoverageControlAncestry } = await import('./coverage-control-ancestry.js')
              controlAncestryBindings = await hydrateCoverageControlAncestry(evidence('conformance/coverage-transactions.json'), { profile: plan.itcve, identity: evidence('integrated/result.json').walletIdentity, fixture, storageTransactions, resolvedTransactions: transactions })
              const { deriveCompletionNativeFundingRoots } = await import('./coverage-completion/funding-roots.js')
              const { hydrateTransactionCompletionFixture } = await import('./coverage-completion/transaction-known-source.js')
              const { coverageObservationEncoding, decodeCoverageObservation } = await import('./coverage-observation.js')
              const fixtureBinding = { profile: 'ITCVE-1@4.5.0' as const, identity: evidence('integrated/result.json').walletIdentity,
                fixture, storageTransactions, resolvedTransactions: transactions, declaredNativePayments: [...nativeFundingOutpoints, ...(corpusPayment ? [corpusPayment] : [])],
                globalSubmissions: submissions, finalSubmissions: shutdown.submissions, readEvidence: (name: string) => fs.readFileSync(path.join(rep, 'evidence', name)) }
              // Admit only exact independently proven incoming payments before
              // resolving Q/F ancestry. Full module parents still run below.
              completionFundingRootBindings = await deriveCompletionNativeFundingRoots(fixtureBinding)
              completionFixtureBindings = await hydrateTransactionCompletionFixture(
                decodeCoverageObservation(evidence('conformance/transaction-branches.json'), coverageObservationEncoding),
                { ...fixtureBinding, declaredNativePayments: completionFundingRootBindings.declaredNativePayments })
            }
            transactionStateBindings = await verifyNativeTransactionStateBindings(evidence('conformance/transaction-states.json'), {
              storageTransactions, declaredNativePayments: [...nativeFundingOutpoints, ...(corpusPayment ? [corpusPayment] : [])], fixture,
              resolvedTransactions: transactions, submissions, finalSubmissions: shutdown.submissions, ...(expanded ? { ownershipFromIndependentGraph: true } : {}),
              identity: evidence('integrated/result.json').walletIdentity
            })
            const { verifyFinalPermissionSubmissionAncestry, finalSubmissionAncestryPolicy } = await import('./verify-submission-ancestry.js')
            assert.equal(plan.finalSubmissionAncestryPolicy, finalSubmissionAncestryPolicy)
            submissionAncestryBindings = await verifyFinalPermissionSubmissionAncestry({
              globalSubmissions: submissions, finalSubmissions: shutdown.submissions, ...(expanded ? { profile: completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' as const : 'ITCVE-1@4.3.0' as const } : {}),
              permissionReport: permissionLifecycle, coverageReport: evidence('conformance/permission-coverage.json'),
              identity: evidence('integrated/result.json').walletIdentity, storageTransactions, resolvedTransactions: transactions, trustedMinedRoot: fixture,
              readEvidence: (name: string) => fs.readFileSync(path.join(rep, 'evidence', name))
            })
            if (expanded) {
              const { verifyNativeCoverageSuite } = await import('./verify-coverage-suite.js')
              coverageSuiteBindings = await verifyNativeCoverageSuite({ ...(completion ? { completionPrerequisites: { conditionalTransactionBindings, transactionStateBindings, submissionAncestryBindings } } : {}), profile: completion ? 'ITCVE-1@4.5.0' : recovery ? 'ITCVE-1@4.4.0' : 'ITCVE-1@4.3.0', identity: evidence('integrated/result.json').walletIdentity, fixture, storageTransactions, resolvedTransactions: transactions, declaredNativePayments: [...nativeFundingOutpoints, ...(corpusPayment ? [corpusPayment] : [])], globalSubmissions: submissions, finalSubmissions: shutdown.submissions, readEvidence: name => fs.readFileSync(path.join(rep, 'evidence', name)) })
            }
          }
        }
      }
      const { verifyNativeConformance } = await import('./verify-conformance.js')
      const prospective = await verifyNativeConformance(path.join(rep, 'evidence'), vectors, plan.lifecycleOracle, plan.portabilityOracle, plan.clauseOracle, plan.itcve)
      assert.deepEqual(record.vectors, prospective.vectors)
      vectors = prospective.vectors
      conformanceSemanticProjections.push(prospective.semanticProjection)
    }
    results.push({ record, vectors, recordSha256: worker.recordSha256, independent: { ...(completionFundingRootBindings ? { completionFundingRootBindings } : {}), ...(completionFixtureBindings ? { completionFixtureBindings } : {}), ...(completionObserverBindings ? { completionObserverBindings } : {}), ...(controlAncestryBindings ? { controlAncestryBindings } : {}), ...(coverageSuiteBindings ? { coverageSuiteBindings } : {}), ...(conditionalTransactionBindings ? { conditionalTransactionBindings } : {}), ...(transactionStateBindings ? { transactionStateBindings } : {}), ...(submissionAncestryBindings ? { submissionAncestryBindings } : {}), funding: funding.id('hex'), ...(conformance ? { preScenarioReserves: nativeFundingRoots.slice(1), recoveryScope: 'unaffected-preexisting-funds' } : {}), create: create.id('hex'), redemption: spend.id('hex'), valueConserved: true, fee: inputs - outputs } })
  }
  assert.equal(canonicalJson(results[0]!.vectors.map(vector => vector.outcome)), canonicalJson(results[1]!.vectors.map(vector => vector.outcome)))
  assert.equal(canonicalJson(results[0]!.record.semanticProjection), canonicalJson(results[1]!.record.semanticProjection))
  if (conformance) verifyConformanceRepetitionAgreement(conformanceSemanticProjections)
  return { schema: conformance ? 'tpnil-native-wallet-qualification@2.0.0' : 'tpnil-native-wallet-qualification@1.0.0', claim: candidate ? 'ENGINEERING_OBSERVATION_ONLY' : 'EXPERIMENTAL_CONFORMANCE_RESULT', ...(candidate ? { walletCandidate: plan.walletCandidate } : {}), itcve: plan.itcve, program: plan.program, lane: plan.lane, planSha256: lock.planSha256, source: lock.source, image: lock.image, qualifiedEnvironment: true, artifact: plan.wallet, vectors: results[0]!.vectors, outcome: aggregateOutcome(results[0]!.vectors), repetitionMatch: true, repetitions: results.map((result, index) => ({ runId: `repetition-${index + 1}`, recordSha256: result.recordSha256, independent: result.independent })) }
}
if (process.argv[1]?.endsWith('/native/verify.ts')) {
  const directory = path.resolve(process.argv[2] ?? '')
  const result = await verifyNativeWallet(directory)
  const target = path.join(directory, 'qualification.json')
  if (fs.existsSync(target)) assert.equal(canonicalJson(JSON.parse(fs.readFileSync(target, 'utf8'))), canonicalJson(result))
  else fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify({ verified: true, qualifiedEnvironment: true, claim: result.claim, outcome: result.outcome, vectors: result.vectors.map(vector => ({ id: vector.id, outcome: vector.outcome })) }) + '\n')
}
