// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Beef, PrivateKey, Transaction } from '@bsv/sdk'
import { serializeHeader, type ControlledWalletServices } from '../../services.js'
import { strictBeef, verifyTransactionBranchProof } from './transaction-branches-oracle.js'
import { assertTransactionKnowledgeProvider } from '../../native-transaction-knowledge-inventory.js'
import { nativeCompletionProviders } from './providers.js'
import { spendsOnlyDeclaredNativePayments } from '../verify-conformance-reserves.js'

export const knownSourcePolicy = { schema: 'tpnil-isolated-caller-known-source@1.0.0', initialAmount: 5000, parentAmount: 2000,
  sourceAmount: 500, sourceOutputs: 3, maxCalls: 5, maximumFee: 1000, key: '79'.repeat(32), script: '7551' } as const
const now = () => new Date().toISOString()
const options = { noSend: true, randomizeOutputs: false, acceptDelayedBroadcast: false }
const sourceOutput = (satoshis: number) => ({ satoshis, lockingScript: knownSourcePolicy.script, outputDescription: 'Isolated caller-known source' })
export function knownSourceRequests(nonce: string, p?: any, q?: any, f?: any) {
  assert.match(nonce, /^[0-9a-f]{64}$/)
  return {
    p: { description: 'Held caller-known fixture allocation', outputs: [sourceOutput(knownSourcePolicy.initialAmount)], options: { ...options } },
    q: { description: 'Held isolated nonce parent', inputBEEF: p?.tx, inputs: [{ outpoint: `${p?.txid}.0`, unlockingScript: '51', inputDescription: 'Declared external allocation' }],
      outputs: [sourceOutput(knownSourcePolicy.parentAmount), { satoshis: 0, lockingScript: `006a20${nonce}`, outputDescription: 'Fresh isolated fixture commitment' }], options: { ...options } },
    f: { description: 'Held isolated caller-known input', inputBEEF: q?.tx, inputs: [{ outpoint: `${q?.txid}.0`, unlockingScript: '51', inputDescription: 'Private fixture parent' }],
      outputs: Array.from({ length: knownSourcePolicy.sourceOutputs }, () => sourceOutput(knownSourcePolicy.sourceAmount)), options: { ...options } },
    releaseP: { description: 'Release declared fixture allocation', outputs: [], options: { randomizeOutputs: false, acceptDelayedBroadcast: false, sendWith: [p?.txid] } },
    releaseQF: { description: 'Release isolated fixture proof', outputs: [], options: { randomizeOutputs: false, acceptDelayedBroadcast: false, sendWith: [q?.txid, f?.txid] } }
  }
}

/** A local fixture provider, never a native wallet provider or listener. Its
 * only allocation is an explicit owned-funder output, so it cannot double-spend
 * the already consumed pinned root or secretly refill the native wallet. */
export async function createIsolatedKnownSource(services: ControlledWalletServices, funder: any) {
  const { Setup } = await import('@bsv/wallet-toolbox')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-isolated-known-source-')), filePath = path.join(directory, 'fixture.sqlite')
  const identity = PrivateKey.fromHex(knownSourcePolicy.key).toPublicKey().toString()
  const external = await Setup.createWalletSQLite({ env: { chain: 'main', identityKey: identity, identityKey2: identity, filePath,
    taalApiKey: 'controlled-fixture-no-key', devKeys: { [identity]: knownSourcePolicy.key }, mySQLConnection: '{}' }, rootKeyHex: knownSourcePolicy.key,
    filePath, databaseName: 'tpnil-isolated-caller-known-source' })
  const report: any = { schema: knownSourcePolicy.schema, claim: 'ENGINEERING_OBSERVATION_ONLY', policy: knownSourcePolicy,
    fixtureRole: 'ISOLATED_TYPESCRIPT_SQLITE_NO_LISTENER', providerIdentity: identity, nonce: randomBytes(32).toString('hex'),
    startedAt: now(), endedAt: '', trace: [], cuts: [], outboundAttempts: [], storage: [], cleanup: { closed: false },
    frontendCacheClaim: 'FRESH_CAUSAL_SOURCE_REQUIRES_COMPLETE_PARENT_JOIN', finalSubmissionCount: 0 }
  const deny = (method: string) => async (..._args: any[]) => { report.outboundAttempts.push({ method, at: now() }); throw Error(`Unregistered isolated fixture network method ${method}`) }
  const dependency: any = external.services
  dependency.options.chainTracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => services.headers.get(height)?.merkleRoot === root }
  dependency.getHeight = async () => 900100
  dependency.getHeaderForHeight = async (height: number) => { const header = services.headers.get(height); assert.ok(header); return [...serializeHeader(header)] }
  for (const method of ['getRawTx', 'getMerklePath', 'getBeef']) dependency[method] = deny(method)
  dependency.postBeef = async (beef: any, txids: string[]) => txids.map(txid => {
    const bytes = Uint8Array.from(beef.toBinaryAtomic(txid))
    services.recordSubmission({ txid, bytes, verdict: 'ACCEPTED_BY_NETWORK' })
    return { name: 'tpnil-controlled-isolated-fixture', status: 'success', txidResults: [{ txid, status: 'success' }] }
  })
  const call = async (id: string, actor: 'shared-funder' | 'isolated-funder', args: any) => {
    assert.ok(report.trace.length < knownSourcePolicy.maxCalls)
    const row: any = { id, actor, method: 'createAction', args: structuredClone(args), startedAt: now(), endedAt: '',
      submissionStart: services.submissions.length, submissionEnd: services.submissions.length }
    report.trace.push(row)
    try { row.result = structuredClone(await (actor === 'shared-funder' ? funder : external.wallet).createAction(structuredClone(args))); return row.result }
    catch (error: any) { row.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error) }; throw error }
    finally { row.endedAt = now(); row.submissionEnd = services.submissions.length }
  }
  const cut = async (id: string) => {
    const sequence = services.nativeTransactionKnowledgeInventoryObservations.length
    const row: any = { id, startedAt: now(), endedAt: '', routeStart: services.routes.length, routeEnd: services.routes.length,
      submissionIndex: services.submissions.length, sequence }
    report.cuts.push(row)
    try { await services.nativeTransactionKnowledgeInventories() }
    finally { row.observation = services.nativeTransactionKnowledgeInventoryObservations[sequence]; row.endedAt = now(); row.routeEnd = services.routes.length }
  }
  let p: any, q: any, f: any
  return {
    report,
    async prepare() {
      assert.equal(report.trace.length, 0); await cut('before-creation')
      p = await call('isolated-allocation', 'shared-funder', knownSourceRequests(report.nonce).p)
      q = await call('isolated-parent', 'isolated-funder', knownSourceRequests(report.nonce, p).q)
      f = await call('isolated-source', 'isolated-funder', knownSourceRequests(report.nonce, p, q).f)
      strictBeef(f.tx); const source = Transaction.fromAtomicBEEF(f.tx); assert.equal(source.id('hex'), f.txid)
      const trimmed = new Beef(); trimmed.mergeRawTx(source.toBinary())
      report.sourceTxid = f.txid; report.parentTxid = q.txid
      return { report, inputBEEF: trimmed.toBinary(), outpoint: `${f.txid}.0`, sourceTxid: f.txid }
    },
    async beforeTarget() { await cut('before-target') },
    async afterTarget(row: any) { report.target = structuredClone(row); await cut('after-target') },
    async release() {
      await call('release-allocation', 'shared-funder', knownSourceRequests(report.nonce, p, q, f).releaseP)
      await call('release-isolated-proof', 'isolated-funder', knownSourceRequests(report.nonce, p, q, f).releaseQF)
    },
    async close() {
      let primary: unknown
      try {
        report.storage = (await external.activeStorage.findProvenTxReqs({ partial: {} })).map(row => ({ txid: row.txid, status: row.status,
          rawTxHex: row.rawTx == null ? null : Buffer.from(row.rawTx).toString('hex'), inputBEEFHex: row.inputBEEF == null ? null : Buffer.from(row.inputBEEF).toString('hex') }))
        assert.ok(report.storage.length <= 32)
      } catch (error) { primary = error }
      try { await external.wallet.destroy(); await external.activeStorage.destroy(); report.cleanup.closed = true }
      catch (error) { primary = primary ? new AggregateError([primary, error], 'Isolated fixture cleanup failed', { cause: primary }) : error }
      report.endedAt = now(); report.finalSubmissionCount = services.submissions.length
      fs.rmSync(directory, { recursive: true, force: true })
      if (primary) throw primary
    }
  }
}

/** Admit only the exact public Q/F bodies after independent proof, intent and
 * local-storage joins. This never inserts a fixture into observed Go storage. */
export async function hydrateTransactionCompletionFixture(report: any, binding: {
  profile: string; identity: string; fixture: any; storageTransactions: ReadonlyMap<string, Transaction>; resolvedTransactions: Map<string, Transaction>;
  globalSubmissions: any[]; declaredNativePayments: string[]; readEvidence(name: string): Buffer
}) {
  assert.ok(['ITCVE-1@4.5.0', 'ITCVE-1@4.6.0'].includes(binding.profile)); assert.equal(report.identity, binding.identity)
  const isolated = report.unknownSource
  if (!isolated) return { verified: true as const, admitted: [], unavailable: 'Isolated source preparation unavailable' }
  assert.equal(isolated.schema, knownSourcePolicy.schema); assert.deepEqual(isolated.policy, knownSourcePolicy)
  assert.equal(isolated.fixtureRole, 'ISOLATED_TYPESCRIPT_SQLITE_NO_LISTENER'); assert.equal(isolated.providerIdentity, PrivateKey.fromHex(knownSourcePolicy.key).toPublicKey().toString())
  assert.deepEqual(isolated.outboundAttempts, []); assert.equal(isolated.cleanup.closed, true)
  assert.deepEqual(isolated.trace.map((row: any) => [row.id, row.actor, row.method]), [
    ['isolated-allocation', 'shared-funder', 'createAction'], ['isolated-parent', 'isolated-funder', 'createAction'], ['isolated-source', 'isolated-funder', 'createAction'],
    ['release-allocation', 'shared-funder', 'createAction'], ['release-isolated-proof', 'isolated-funder', 'createAction'] ])
  const [p, q, f] = isolated.trace.map((row: any) => row.result), requests = knownSourceRequests(isolated.nonce, p, q, f)
  const tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  const graphs = new Map<string, Transaction>(), parsed: Transaction[] = []
  let fees = 0
  for (const [index, key] of ['p', 'q', 'f'].entries()) {
    const row = isolated.trace[index]; assert.equal(row.error, undefined); assert.deepEqual(row.args, requests[key as 'p' | 'q' | 'f'])
    assert.equal(row.submissionStart, row.submissionEnd)
    const graph = await verifyTransactionBranchProof(row.result.tx, tracker), tx = Transaction.fromAtomicBEEF(row.result.tx)
    assert.equal(tx.id('hex'), row.result.txid); assert.equal(graph.atomicTxid, row.result.txid)
    assert.equal(graph.findTxid(binding.fixture.txid)?.tx?.toHex(), binding.fixture.rawHex)
    assert.ok(await graph.verify(tracker, false)); assert.ok(await tx.verify(tracker))
    assert.ok(tx.outputs.length >= row.args.outputs.length)
    for (const [i, output] of row.args.outputs.entries()) { assert.equal(tx.outputs[i]?.satoshis, output.satoshis); assert.equal(tx.outputs[i]?.lockingScript.toHex(), output.lockingScript) }
    if (index === 0) {
      assert.equal(binding.storageTransactions.get(row.result.txid)?.toHex(), tx.toHex(), 'Allocation differs from independently observed owned storage')
      assert.ok(spendsOnlyDeclaredNativePayments(tx, [`${binding.fixture.txid}.${binding.fixture.outputIndex}`]))
      const native = new Set(binding.declaredNativePayments), pending = [tx], seen = new Set<string>()
      while (pending.length) {
        const current = pending.pop()!, id = current.id('hex'); if (seen.has(id)) continue; seen.add(id)
        for (const input of current.inputs) {
          assert.ok(!native.has(`${input.sourceTXID ?? input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`), 'Isolated allocation spent native-owned funding')
          if (input.sourceTransaction) pending.push(input.sourceTransaction)
        }
      }
    }
    else {
      const source = parsed[index - 1]!
      assert.equal(tx.inputs.length, 1); assert.equal(tx.inputs[0]?.sourceTXID ?? tx.inputs[0]?.sourceTransaction?.id('hex'), source.id('hex')); assert.equal(tx.inputs[0]?.sourceOutputIndex, 0); assert.equal(tx.inputs[0]?.unlockingScript?.toHex(), '51')
      const retained = isolated.storage.filter((r: any) => r.txid === tx.id('hex')); assert.equal(retained.length, 1); assert.equal(retained[0].rawTxHex, tx.toHex())
    }
    fees += tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0)
    parsed.push(tx)
    const collect = (value: Transaction, depth = 0) => {
      assert.ok(depth < 32); const txid = value.id('hex'), existing = graphs.get(txid) ?? binding.resolvedTransactions.get(txid)
      if (existing) assert.equal(existing.toHex(), value.toHex())
      if (graphs.has(txid)) return; graphs.set(txid, value)
      for (const input of value.inputs) if (input.sourceTransaction) collect(input.sourceTransaction, depth + 1)
    }
    collect(tx)
  }
  assert.ok(Number.isSafeInteger(fees) && fees >= 0 && fees <= knownSourcePolicy.maximumFee)
  assert.equal(isolated.sourceTxid, f.txid); assert.equal(isolated.parentTxid, q.txid)
  for (const [offset, key] of ['releaseP', 'releaseQF'].entries()) {
    const row = isolated.trace[3 + offset]; assert.equal(row.error, undefined); assert.deepEqual(row.args, requests[key as 'releaseP' | 'releaseQF'])
    assert.deepEqual(row.result.sendWithResults.map((r: any) => r.txid), offset === 0 ? [p.txid] : [q.txid, f.txid])
    assert.ok(row.result.sendWithResults.every((r: any) => r.status === 'unproven'))
    const expected = offset === 0 ? [p.txid] : [q.txid, f.txid]
    const actual = binding.globalSubmissions.slice(row.submissionStart, row.submissionEnd)
    assert.deepEqual(actual.map((r: any) => r.txid), expected)
    for (const submission of actual) {
      assert.equal(submission.verdict, 'ACCEPTED_BY_NETWORK')
      const bytes = [...Buffer.from(submission.beefHex, 'hex')]
      let tx: Transaction
      if (submission.beefHex.startsWith('01010101')) {
        const graph = await verifyTransactionBranchProof(bytes, tracker); assert.equal(graph.atomicTxid, submission.txid)
        tx = Transaction.fromAtomicBEEF(bytes)
      } else { tx = Transaction.fromBinary(bytes); assert.deepEqual(tx.toBinary(), bytes) }
      assert.equal(tx.id('hex'), submission.txid); assert.equal(tx.toHex(), graphs.get(submission.txid)?.toHex())
      assert.ok(await graphs.get(submission.txid)!.verify(tracker))
    }
    for (const txid of expected) assert.ok(!binding.globalSubmissions.slice(0, row.submissionStart).some((r: any) => r.txid === txid), 'Held fixture was submitted before its named release')
  }
  const instant = (value: string) => { const n = Date.parse(value); assert.equal(new Date(n).toISOString(), value); return n }
  const target = report.trace.filter((row: any) => row.id === 'explicit-known-source'); assert.equal(target.length, 1)
  assert.deepEqual(isolated.target, target[0]); assert.equal(target[0].actor, 'wallet'); assert.equal(target[0].method, 'createAction')
  assert.deepEqual(target[0].args.inputs, [{ outpoint: `${f.txid}.0`, unlockingScript: '51', inputDescription: 'Isolated caller-known source' }])
  assert.equal(target[0].args.options.trustSelf, 'known'); assert.deepEqual(target[0].args.options.knownTxids, [f.txid])
  const supplied = strictBeef(target[0].args.inputBEEF); assert.equal(supplied.bumps.length, 0); assert.equal(supplied.txs.length, 1)
  assert.equal(supplied.txs[0]!.tx?.toHex(), parsed[2]!.toHex())
  for (const [index, row] of isolated.trace.entries()) {
    assert.ok(instant(row.startedAt) <= instant(row.endedAt))
    if (index) assert.ok(instant(isolated.trace[index - 1].endedAt) <= instant(row.startedAt))
    assert.ok(Number.isSafeInteger(row.submissionStart) && Number.isSafeInteger(row.submissionEnd) && row.submissionStart >= 0 && row.submissionEnd >= row.submissionStart && row.submissionEnd <= binding.globalSubmissions.length)
  }
  const [creation, before, after] = isolated.cuts
  assert.ok(instant(creation.endedAt) <= instant(isolated.trace[0].startedAt) && instant(isolated.trace[2].endedAt) <= instant(before.startedAt))
  assert.ok(instant(before.endedAt) <= instant(target[0].startedAt) && instant(target[0].endedAt) <= instant(after.startedAt) && instant(after.endedAt) <= instant(isolated.trace[3].startedAt))
  assert.equal(creation.submissionIndex, isolated.trace[0].submissionStart); assert.equal(before.submissionIndex, target[0].submissionStart); assert.equal(after.submissionIndex, target[0].submissionEnd)
  const registry = nativeCompletionProviders(binding.readEvidence), ledger = JSON.parse(binding.readEvidence('native-completion-inventory-ledger.json').toString())
  assert.deepEqual(ledger.registry, registry)
  assert.deepEqual(isolated.cuts.map((row: any) => row.id), ['before-creation', 'before-target', 'after-target'])
  for (const cut of isolated.cuts) {
    assert.ok(instant(cut.startedAt) <= instant(cut.observation.startedAt) && instant(cut.observation.endedAt) <= instant(cut.endedAt))
    assert.deepEqual(cut.observation, ledger.transactionKnowledge[cut.sequence]); assert.deepEqual(cut.observation.registry, registry)
    assert.equal(cut.observation.error, undefined); assert.deepEqual(cut.observation.snapshots.providers.map((p: any) => p.id), registry.map(p => p.id))
    for (const provider of cut.observation.snapshots.providers) {
      const expected = registry.find(r => r.id === provider.id)!; assert.deepEqual(provider.componentIdentity, expected.componentIdentity)
      assertTransactionKnowledgeProvider(provider.snapshot, expected.identityKey)
      if (cut.id !== 'after-target') for (const txid of [q.txid, f.txid]) {
        assert.ok(!provider.snapshot.known.some((row: any) => row.txid === txid)); assert.ok(!provider.snapshot.transactions.some((row: any) => row.txid === txid))
        for (const row of [...provider.snapshot.known, ...provider.snapshot.transactions]) for (const blob of [row.rawTx, row.inputBEEF]) if (blob?.hex) {
          assert.ok(!blob.hex.includes(txid) && !blob.hex.includes(Buffer.from(txid, 'hex').reverse().toString('hex')), 'Undeclared source was already present in a provider blob')
        }
      }
    }
  }
  // The complete child additionally binds target arguments, call timing and
  // non-disclosure. Supplying valid Q/F ancestry alone cannot promote its verdict.
  for (const [txid, tx] of graphs) if (!binding.resolvedTransactions.has(txid)) binding.resolvedTransactions.set(txid, tx)
  for (const tx of binding.resolvedTransactions.values()) for (const input of tx.inputs) if (!input.sourceTransaction) input.sourceTransaction = binding.resolvedTransactions.get(input.sourceTXID!)
  return { verified: true as const, admitted: [{ role: 'isolated-parent', txid: q.txid }, { role: 'isolated-source', txid: f.txid }], actualFees: fees }
}
