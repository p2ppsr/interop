import {withTransactionProofResources} from './proof-resources.js'
import {nativeProofResources} from './proof-resources.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Beef, PrivateKey, ProtoWallet, Transaction } from '@bsv/sdk'
import { specifiedError } from './conformance-clauses-model.js'
import { observedSubmissionTransactions, type SubmissionGraphOptions } from './verify-transaction-state-bindings.js'
import { getTransactionCoveragePolicy, tc, transactionCoverageIds, type TransactionCoverageReport as Report, type TransactionCoverageCall as Call, type TransactionCoverageSubmission as Submission, type TransactionCoverageOutcome as Outcome } from './coverage-transactions-model.js'
import { coverageAtomic, coverageDuplicateControlAtomic, transactionCoverageProgram } from './coverage-transactions-program.js'
const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => fixture.fundingHeight + fixture.maturityDepth, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }
class Blocked extends Error {}
const id = (suffix: string) => transactionCoverageIds.find(x => x.endsWith(`/${suffix}`))!
function canonical(value: any): any { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])); return value }
async function inspect(report: Report) {
  const revision = report.oracle === 'tpnil-native-coverage-transactions-oracle@1.0.0' ? 1 : report.oracle === 'tpnil-native-coverage-transactions-oracle@2.0.0' ? 2 : report.oracle === 'tpnil-native-coverage-transactions-oracle@3.0.0' ? 3 : report.oracle === 'tpnil-native-coverage-transactions-oracle@4.0.0' ? 4 : undefined
  assert.ok(revision, 'Unsupported transaction coverage oracle')
  const { policy, policySha256 } = getTransactionCoveragePolicy(revision)
  assert.equal(nativeProofResources().maximumProofDepth, policy.bounds.maximumProofDepth, 'Transaction oracle resource admission differs from its frozen policy')
  assert.equal(report.schema, `tpnil-native-coverage-transactions@${revision}.0.0`); assert.equal(report.oracle, policy.oracle); assert.equal(report.policySha256, policySha256)
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(report.completeBRC100Conformance, false); assert.equal(report.finalLedgerRequired, true)
  assert.match(report.identity, /^(02|03)[a-f0-9]{64}$/); assert.ok(report.trace.length <= policy.bounds.maximumPublicCalls); assert.equal(new Set(report.trace.map(r => r.id)).size, report.trace.length)
  let index = 0
  const replay = await transactionCoverageProgram(async (id, actor, method, args) => {
    const row = report.trace[index++]; assert.ok(row, `Missing public call ${id}`); assert.deepEqual({ id: row.id, actor: row.actor, method: row.method, args: row.args }, { id, actor, method, args }, `Public call binding ${id}`)
    assert.notEqual(row.result === undefined, row.error === undefined, `Call ${id} needs exactly one result or error`); return row
  }, report.identity)
  assert.equal(index, report.trace.length, 'Extra public call'); assert.deepEqual(report.skipped, replay.skipped)
  assert.ok(Number.isSafeInteger(report.submissionStart) && report.submissionStart >= 0 && Number.isSafeInteger(report.submissionEnd) && report.submissionEnd >= report.submissionStart)
  assert.equal(report.submissionPrefix.length, report.submissionStart); assert.equal(report.submissions.length, report.submissionEnd - report.submissionStart)
  let previous = report.submissionStart
  for (const row of report.trace) { assert.ok(Number.isSafeInteger(row.submissionStart) && Number.isSafeInteger(row.submissionEnd) && row.submissionStart >= previous && row.submissionEnd >= row.submissionStart && row.submissionEnd <= report.submissionEnd); previous = row.submissionEnd }
  assert.ok(Array.isArray(report.storageTransactions) && report.storageTransactions.length <= 2048)
  const graph = new Map<string, Transaction>()
  for (const row of report.storageTransactions) {
    assert.deepEqual(Object.keys(row).sort(), ['rawTxHex', 'txid']); const tx = Transaction.fromHex(row.rawTxHex); assert.equal(tx.toHex(), row.rawTxHex); assert.equal(tx.id('hex'), row.txid); assert.ok(!graph.has(row.txid)); graph.set(row.txid, tx)
  }
  const root = coverageAtomic([...Buffer.from(fixture.atomicBeefHex, 'hex')]); if (graph.has(root.id('hex'))) assert.equal(graph.get(root.id('hex'))!.toHex(), root.toHex()); graph.set(root.id('hex'), root)
  const remember = (tx: Transaction, depth = 0) => { assert.ok(depth < nativeProofResources().maximumProofDepth); const existing = graph.get(tx.id('hex')); if (existing) assert.equal(existing.toHex(), tx.toHex()); graph.set(tx.id('hex'), tx); if (tx.id('hex') !== root.id('hex')) for (const input of tx.inputs) if (input.sourceTransaction) remember(input.sourceTransaction, depth + 1) }
  for (const row of report.trace) for (const bytes of [row.result?.tx, row.error?.tx, row.result?.signableTransaction?.tx, /^proof-.*-control$/.test(row.id) && row.method === 'internalizeAction' ? row.args.tx : undefined]) if (bytes) { try { remember(row.id === 'proof-duplicate-control' && bytes === row.args.tx ? coverageDuplicateControlAtomic(bytes) : coverageAtomic(bytes)) } catch { /* Semantic predicate retains malformed response as FAIL. */ } }
  const hydrate = (tx: Transaction, visited = new Set<string>()): Transaction => {
    assert.ok(visited.size < nativeProofResources().maximumProofDepth && !visited.has(tx.id('hex'))); if (tx.id('hex') === root.id('hex')) { assert.equal(tx.toHex(), root.toHex()); tx.merklePath = root.merklePath; return tx }
    // Only the admitted fixture establishes a mined boundary.
    tx.merklePath = undefined
    const next = new Set([...visited, tx.id('hex')])
    for (const input of tx.inputs) { const sourceId = input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? '', retained = graph.get(sourceId), supplied = input.sourceTransaction; if (retained && supplied) assert.equal(retained.toHex(), supplied.toHex()); const parent = supplied ?? retained; assert.ok(parent, 'Missing independently retained source'); assert.equal(parent.id('hex'), sourceId); input.sourceTransaction = hydrate(parent, next) }; return tx
  }
  for (const entry of report.submissions) {
    assert.ok(['ACCEPTED_BY_NETWORK', 'REJECTED'].includes(entry.verdict))
    let observed: ReturnType<typeof observedSubmissionTransactions>; try { observed = observedSubmissionTransactions(entry, { resolvedTransactions: graph, requireResolvedAncestors: true, trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex } }) } catch (error) { throw new Error(`Submission ${entry.txid}: ${String(error)}`) }
    assert.equal(graph.get(entry.txid)?.toHex(), observed[0]!.transaction.toHex(), 'Submission target differs from retained transaction bytes')
  }
  const row = (name: string): Call => { const value = replay.calls.get(name); if (!value) throw new Blocked(`Missing predecessor for ${name}`); return value }
  const success = (name: string) => { const r = row(name); assert.ok(r.error === undefined, `${name}: ${r.error?.message}`); assert.ok(r.result && typeof r.result === 'object'); return r }
  const signed = new Map<string, Transaction>()
  const txFor = async (name: string) => {
    if (signed.has(name)) return signed.get(name)!
    const r = success(name), tx = coverageAtomic(r.result.tx); assert.equal(tx.id('hex'), r.result.txid); assert.equal(r.result.signableTransaction, undefined)
    assert.equal(graph.get(tx.id('hex'))?.toHex(), tx.toHex()); assert.ok(report.storageTransactions.some(x => x.txid === tx.id('hex') && x.rawTxHex === tx.toHex()), 'Signed transaction absent from storage snapshot')
    hydrate(tx); assert.ok(await tx.verify(tracker), 'Signed transaction does not verify against the admitted mined root')
    let args = r.args
    if (r.method === 'signAction') {
      const stage = report.trace.find(x => x.actor === r.actor && x.result?.signableTransaction?.reference === r.args.reference); assert.ok(stage); args = stage.args
      const unsigned = coverageAtomic(stage.result.signableTransaction.tx); assert.equal(unsigned.inputs.length, tx.inputs.length); assert.equal(unsigned.outputs.length, tx.outputs.length)
      assert.deepEqual(unsigned.outputs.map(o => [o.satoshis, o.lockingScript.toHex()]), tx.outputs.map(o => [o.satoshis, o.lockingScript.toHex()]))
      assert.deepEqual(unsigned.inputs.map(i => [i.sourceTXID ?? i.sourceTransaction?.id('hex'), i.sourceOutputIndex]), tx.inputs.map(i => [i.sourceTXID ?? i.sourceTransaction?.id('hex'), i.sourceOutputIndex]))
    }
    for (const [index, requested] of (args.outputs ?? []).entries()) {
      const actual = tx.outputs[index]; assert.ok(actual); assert.equal(actual.satoshis, requested.satoshis); assert.equal(actual.lockingScript.toHex(), requested.lockingScript)
    }
    for (const [index, requested] of (args.inputs ?? []).entries()) { const actual = tx.inputs[index]!; assert.equal(`${actual.sourceTXID ?? actual.sourceTransaction?.id('hex')}.${actual.sourceOutputIndex}`, requested.outpoint); assert.equal(actual.unlockingScript?.toHex(), requested.unlockingScript ?? r.args.spends?.[index]?.unlockingScript) }
    if (args.inputs?.length && args.inputs.reduce((sum: number, input: any) => { const [tid, ix] = input.outpoint.split('.'); return sum + (graph.get(tid)?.outputs[Number(ix)]?.satoshis ?? 0) }, 0) >= 50) assert.equal(tx.inputs.length, args.inputs.length, 'Explicit source must cover this bounded fixture')
    for (const extra of tx.outputs.slice(args.outputs?.length ?? 0)) assert.match(extra.lockingScript.toHex(), /^76a914[0-9a-f]{40}88ac$/, 'Unrequested non-change output')
    signed.set(name, tx); return tx
  }
  const submitted = (txid: string, start: number, end: number) => report.submissions.slice(start - report.submissionStart, end - report.submissionStart).some(s => s.txid === txid && s.verdict === 'ACCEPTED_BY_NETWORK')
  const noSubmission = (name: string) => { const r = row(name); assert.equal(r.submissionEnd, r.submissionStart, `${name} emitted a network submission`) }
  const rejectResult = (name: string, reference = false) => { const r = row(name); assert.ok(r.result === undefined, `${name}: invalid operation returned success`); assert.ok(specifiedError(r.error) || reference && r.error && /reference.*(?:not|invalid|issued|unknown)|(?:invalid|unknown).*reference/i.test(r.error.message) && !/timeout|network|not implemented/i.test(r.error.message), `Expected named state/parameter rejection: ${name}: ${r.error?.message}`) }
  const reject = (name: string, reference = false) => { rejectResult(name, reference); noSubmission(name) }
  const priorDelayedTransaction = async (txid: string, beforeRow: Call) => {
    const prior = report.trace.slice(0, report.trace.indexOf(beforeRow)).find(call => call.actor === 'wallet' && call.result?.txid === txid && Array.isArray(call.result?.tx))
    assert.ok(prior && ['createAction', 'signAction'].includes(prior.method), 'Delayed progress lacks an earlier signed wallet action')
    const stage = prior.method === 'signAction' ? report.trace.find(call => call.actor === 'wallet' && call.result?.signableTransaction?.reference === prior.args.reference) : prior
    assert.ok(stage && stage.args.options?.acceptDelayedBroadcast !== false && stage.args.options?.noSend !== true, 'Progress must belong to a delayed broadcast action')
    return txFor(prior.id)
  }
  const acceptedDelayedReceipt = async (entry: Submission, beforeRow: Call) => {
    assert.equal(entry.verdict, 'ACCEPTED_BY_NETWORK', 'Delayed progress receipt is not accepted')
    const signedTx = await priorDelayedTransaction(entry.txid, beforeRow)
    const observed = observedSubmissionTransactions(entry, { resolvedTransactions: graph, requireResolvedAncestors: true, trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex } })[0]!.transaction
    assert.equal(observed.toHex(), signedTx.toHex(), 'Delayed progress receipt differs from the earlier signed action')
  }
  const noControlSubmission = async (name: string, exactRaw = false) => {
    if (revision === 1) { noSubmission(name); return }
    const control = row(name)
    // A staged control or its abort cannot broadcast. Independent background
    // delivery of an earlier signed delayed action is not the control's effect.
    for (const entry of [...report.submissionPrefix, ...report.submissions].slice(control.submissionStart, control.submissionEnd)) {
      await acceptedDelayedReceipt(entry, control)
      if (exactRaw) assert.equal(entry.beefHex, (await priorDelayedTransaction(entry.txid, control)).toHex(), 'Rejected reference may overlap only the byte-identical raw prior delayed transaction')
    }
  }
  const noHeldSubmission = async (name: string) => {
    if (revision < 3) { noSubmission(name); return }
    const held = success(name), tx = await txFor(name)
    assert.equal(held.args.options?.noSend, true, 'Held action must explicitly request noSend')
    const releases: Record<string, string> = { 'held-a': 'held-release', 'held-b': 'batch-sign', 'held-child': 'held-release', 'foreign-held': 'foreign-held-release', 'held-unknown-control': 'unknown-batch-control', 'held-inactive': 'held-inactive-release' }
    assert.ok(releases[name], 'No exact release is declared for this held action')
    const release = row(releases[name]!)
    assert.ok(report.trace.indexOf(release) > report.trace.indexOf(held), 'Release must follow the held action')
    assert.ok(release.args.options?.sendWith?.includes(tx.id('hex')), 'Release must explicitly name the held transaction')
    const ledger = [...report.submissionPrefix, ...report.submissions]
    // Inspect every intervening target and reachable unmined ancestor, including
    // entries between calls. A descendant must not expose a held parent early.
    for (const entry of ledger.slice(held.submissionStart, release.submissionStart)) {
      for (const observed of observedSubmissionTransactions(entry, { resolvedTransactions: graph, requireResolvedAncestors: true, trustedMinedRoot: { txid: fixture.txid, rawHex: fixture.rawHex } })) assert.notEqual(observed.txid, tx.id('hex'), `${name} transaction appears in submission ancestry before its exact release`)
    }
    const defaults = new Set(['default-create-omitted', 'default-sign-omitted', 'default-create-true', 'default-sign-true'])
    for (const entry of ledger.slice(held.submissionStart, held.submissionEnd)) {
      const prior = report.trace.slice(0, report.trace.indexOf(held)).find(call => call.actor === 'wallet' && defaults.has(call.id) && call.result?.txid === entry.txid)
      assert.ok(prior, 'Held window contains a receipt outside the exact prior delayed default controls')
      const statuses = prior.result.sendWithResults?.filter((status: any) => status.txid === entry.txid)
      assert.equal(statuses?.length, 1, 'Prior delayed control lacks one truthful status')
      assert.ok(['sending', 'unproven'].includes(statuses[0].status), 'Prior delayed control status is not pending or processed')
      await acceptedDelayedReceipt(entry, held)
    }
  }
  const inventory = async (before: string, after: string) => {
    for (const suffix of ['basket', 'actions']) {
      const beforeRow = success(`${before}-${suffix}`), afterRow = success(`${after}-${suffix}`), a = beforeRow.result, b = structuredClone(afterRow.result)
      if (revision >= 2 && suffix === 'actions' && Array.isArray(a.actions) && Array.isArray(b.actions) && a.actions.length === b.actions.length) {
        for (let index = 0; index < a.actions.length; index++) {
          const previousAction = a.actions[index], nextAction = b.actions[index]
          if (previousAction.status === nextAction.status) continue
          assert.equal(previousAction.txid, nextAction.txid, 'Delayed progress changed action identity')
          assert.equal(previousAction.status, 'sending', 'Only an already pending action may progress')
          assert.equal(nextAction.status, 'unproven', 'Only accepted unproven progress is normalized')
          const accepted = [...report.submissionPrefix, ...report.submissions].slice(0, afterRow.submissionEnd).filter(entry => entry.txid === previousAction.txid && entry.verdict === 'ACCEPTED_BY_NETWORK')
          assert.ok(accepted.length > 0, 'Delayed progress lacks accepted delivery before the after-snapshot completed')
          for (const entry of accepted) await acceptedDelayedReceipt(entry, beforeRow)
          nextAction.status = previousAction.status
        }
      }
      assert.deepEqual(canonical(a), canonical(b), `Rejected operation mutated ${suffix} inventory`)
    }
  }
  const internal = (name: string) => { assert.equal(success(name).result.accepted, true) }
  const incoming = () => coverageAtomic(success('incoming-fixture').result.tx)
  const listed = (name: string, outpoint: string, satoshis: number, script: string) => { const result = success(name).result; assert.ok(Array.isArray(result.outputs) && result.totalOutputs === result.outputs.length && result.totalOutputs < 1000); const matches = result.outputs.filter((o: any) => o.outpoint === outpoint); assert.equal(matches.length, 1); assert.equal(matches[0].satoshis, satoshis); assert.equal(matches[0].lockingScript, script); assert.equal(matches[0].spendable, true); return matches[0] }
  const added = (before: string, after: string, point: string) => { const a = success(before).result, b = success(after).result; assert.ok(Array.isArray(a.outputs) && Array.isArray(b.outputs)); assert.equal(a.totalOutputs, a.outputs.length); assert.equal(b.totalOutputs, b.outputs.length); assert.deepEqual(b.outputs.filter((o: any) => o.outpoint !== point), a.outputs, 'Incoming credit changed unrelated public outputs'); assert.equal(b.outputs.filter((o: any) => o.outpoint === point).length, 1) }
  const credit = (before: string, after: string, outputIndex: number) => {
    const tx = incoming(), read = (name: string) => { const result = success(`${name}-actions`).result; assert.ok(Array.isArray(result.actions) && result.totalActions === result.actions.length && result.totalActions < 1000); const matches = result.actions.filter((a: any) => a.txid === tx.id('hex')); assert.ok(matches.length <= 1); return matches[0] }
    const a = read(before), b = read(after); assert.ok(b); assert.equal(b.isOutgoing, false); assert.equal(b.satoshis, (a?.satoshis ?? 0) + tx.outputs[outputIndex]!.satoshis!)
    assert.ok(Array.isArray(b.outputs)); const matches = b.outputs.filter((o: any) => o.outputIndex === outputIndex); assert.equal(matches.length, 1); assert.equal(matches[0].basket, 'default'); assert.equal(matches[0].satoshis, tx.outputs[outputIndex]!.satoshis); assert.equal(matches[0].lockingScript, tx.outputs[outputIndex]!.lockingScript.toHex()); assert.equal(matches[0].spendable, true)
    for (const previous of a?.outputs ?? []) assert.deepEqual(b.outputs.find((o: any) => o.outputIndex === previous.outputIndex), previous, 'Incoming payment changed an existing tracked output')
    return b
  }
  const changes = async (name: string) => { const tx = await txFor(name), value = row(name).result.noSendChange; assert.ok(Array.isArray(value) && value.length > 0); assert.equal(new Set(value).size, value.length); for (const outpoint of value) { assert.match(outpoint, /^[a-f0-9]{64}\.[0-9]+$/); const [tid, i] = outpoint.split('.'); assert.equal(tid, tx.id('hex')); const output = tx.outputs[Number(i)]!; assert.ok(output); assert.match(output.lockingScript.toHex(), /^76a914[a-f0-9]{40}88ac$/); assert.ok(output.satoshis! > 0) }; await noHeldSubmission(name); return value as string[] }
  const spend = (tx: Transaction, outpoint: string) => tx.inputs.some(i => `${i.sourceTXID ?? i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}` === outpoint)
  assert.equal(success('funder-identity').result.publicKey, (await new ProtoWallet(PrivateKey.fromHex(tc.funderKey)).getPublicKey({ identityKey: true })).publicKey)
  return { revision, policy, row, success, noControlSubmission, txFor, signed, graph, hydrate, submitted, noSubmission, noHeldSubmission, rejectResult, reject, inventory, internal, incoming, listed, added, credit, changes, spend, replay }
}
export async function deriveTransactionCoverageOutcomes(report: Report): Promise<Outcome[]> {
  return withTransactionProofResources(report.oracle === 'tpnil-native-coverage-transactions-oracle@4.0.0' ? 4 : 1, () => deriveTransactionCoverageOutcomesWithResources(report))
}

async function deriveTransactionCoverageOutcomesWithResources(report: Report): Promise<Outcome[]> {
  const v = await inspect(report), { row, success, txFor, submitted, noSubmission, noHeldSubmission, reject, inventory, internal, incoming, listed, added, credit, changes, spend } = v
  const tests: Record<string, () => Promise<void> | void> = {
    [id('acceptDelayedBroadcast-omitted-true')]: async () => {
      for (const operation of ['create', 'sign']) for (const value of ['omitted', 'true']) { const name = `default-${operation}-${value}`, tx = await txFor(name), statuses = success(name).result.sendWithResults; assert.equal(statuses?.filter((x: any) => x.txid === tx.id('hex') && ['sending', 'unproven'].includes(x.status)).length, 1, 'Delayed transaction requires a truthful pending/processed status'); if (statuses.find((x: any) => x.txid === tx.id('hex')).status === 'unproven') assert.ok(submitted(tx.id('hex'), row(name).submissionStart, report.submissionEnd), 'Processed delayed status lacks submission evidence') }
    },
    [id('foreign-reference-reject')]: async () => { for (const name of ['foreign-sign', 'foreign-abort']) { if (v.revision >= 4) { v.rejectResult(name, true); await v.noControlSubmission(name, true) } else reject(name, true) }; const tx = await txFor('foreign-owner-sign'); assert.ok(submitted(tx.id('hex'), row('foreign-owner-sign').submissionStart, row('foreign-owner-sign').submissionEnd)); assert.notEqual(success('funder-identity').result.publicKey, report.identity) },
    [id('two-dependent-held')]: async () => {
      const parent = await txFor('held-a'), child = await txFor('held-child'), outpoints = await changes('held-a'); await noHeldSubmission('held-child'); assert.ok(outpoints.some(p => spend(child, p)), 'Held child must consume its named final change')
      const release = success('held-release'), results = release.result.sendWithResults; assert.ok(Array.isArray(results)); for (const tx of [parent, child]) { assert.equal(results.filter((r: any) => r.txid === tx.id('hex') && ['unproven', 'sending'].includes(r.status)).length, 1); assert.ok(submitted(tx.id('hex'), release.submissionStart, report.submissionEnd)) }
      assert.deepEqual(results.map((r: any) => r.txid).sort(), [parent.id('hex'), child.id('hex')].sort())
    },
    [id('sign-sendWith')]: async () => { const sibling = await txFor('held-b'); await changes('held-b'); const tx = await txFor('batch-sign'), r = success('batch-sign'); for (const txid of [sibling.id('hex'), tx.id('hex')]) assert.ok(submitted(txid, r.submissionStart, report.submissionEnd)); assert.deepEqual(r.result.sendWithResults?.map((x: any) => x.txid).sort(), [sibling.id('hex'), tx.id('hex')].sort()); for (const value of r.result.sendWithResults) assert.ok(['sending', 'unproven'].includes(value.status)) },
    [id('unknown-batch-txid')]: async () => {
      const r = row('unknown-batch'), known = await txFor('held-unknown-control'); await changes('held-unknown-control')
      const results = r.result?.sendWithResults ?? r.error?.sendWithResults
      if (results !== undefined) { assert.ok(Array.isArray(results)); assert.deepEqual(results.map((x: any) => x.txid).sort(), [known.id('hex'), 'a9'.repeat(32)].sort()); assert.equal(results.filter((x: any) => x.txid === 'a9'.repeat(32) && x.status === 'failed').length, 1); for (const result of results) { assert.ok([known.id('hex'), 'a9'.repeat(32)].includes(result.txid)); assert.ok(['unproven', 'sending', 'failed'].includes(result.status)); if (result.txid === known.id('hex') && result.status !== 'failed') assert.ok(submitted(known.id('hex'), r.submissionStart, report.submissionEnd)) } }
      else reject('unknown-batch')
      const control = success('unknown-batch-control'); assert.equal(control.result.sendWithResults?.filter((x: any) => x.txid === known.id('hex') && ['unproven', 'sending'].includes(x.status)).length, 1); assert.ok(submitted(known.id('hex'), r.submissionStart, report.submissionEnd)); assert.ok(!report.submissions.some(x => x.txid === 'a9'.repeat(32)))
    },
    [id('valid-subset')]: async () => { const a = await changes('held-a'), b = await changes('held-b'); assert.notEqual(a[0], b[0]); const supplied = row('held-child').args.options.noSendChange; assert.deepEqual(supplied, [a[0]]); assert.ok(supplied.length < a.length + b.length); const child = await txFor('held-child'); assert.ok(spend(child, a[0]!)); assert.ok(!b.some(p => spend(child, p))) },
    [id('foreign-output')]: async () => { const pts = await changes('foreign-held'); assert.equal(row('change-foreign').args.options.noSendChange[0], pts[0]); reject('change-foreign'); await inventory('change-foreign-before', 'change-foreign-after') },
    [id('already-spent')]: async () => { const point = (await changes('held-a'))[0]!; assert.ok(spend(await txFor('held-child'), point)); reject('change-spent'); await inventory('change-spent-before', 'change-spent-after') },
    [id('out-of-range')]: async () => { const tx = await txFor('held-b'); assert.equal(row('change-range').args.options.noSendChange[0], `${tx.id('hex')}.${tx.outputs.length}`); reject('change-range'); await inventory('change-range-before', 'change-range-after') },
    [id('noSend-false')]: async () => { await changes('held-inactive'); reject('change-no-send-false'); await inventory('change-no-send-false-before', 'change-no-send-false-after') },
    [id('wallet-payment')]: async () => { await txFor('incoming-fixture'); internal('payment'); credit('internal-before', 'payment-after', 0) },
    [id('basket-insertion')]: async () => { const tx = await txFor('incoming-fixture'); internal('insertion'); added('payment-after-basket', 'insertion-after-basket', `${tx.id('hex')}.2`); const o = listed('insertion-after-basket', `${tx.id('hex')}.2`, 7, tc.sourceScript); assert.deepEqual(o.tags, ['extension 2']); assert.equal(o.customInstructions, 'extension:2'); assert.ok(success('insertion-after-actions').result.actions.some((a: any) => a.txid === tx.id('hex') && a.outputs?.some((o: any) => o.outputIndex === 2 && o.lockingScript === tc.sourceScript))) },
    [id('both-output-types')]: async () => { const tx = await txFor('incoming-fixture'); internal('both'); credit('insertion-after', 'both-after', 1); added('insertion-after-basket', 'both-after-basket', `${tx.id('hex')}.3`); const o = listed('both-after-basket', `${tx.id('hex')}.3`, 7, tc.sourceScript); assert.deepEqual(o.tags, ['extension 3']); assert.equal(o.customInstructions, 'extension:3') },
    [id('missing-paymentRemittance')]: async () => { reject('missing-payment'); await inventory('missing-payment-before', 'missing-payment-after') },
    [id('missing-insertionRemittance')]: async () => { reject('missing-insertion'); await inventory('missing-insertion-before', 'missing-insertion-after') },
    [id('wrong-derivation')]: async () => { await txFor('incoming-fixture'); for (const name of ['wrong-derivation', 'wrong-prefix', 'wrong-sender']) { reject(name); await inventory(`${name}-before`, `${name}-after`) }; assert.notEqual(row('wrong-derivation').args.outputs[0].paymentRemittance.derivationSuffix, tc.suffix) },
    [id('output-index-out-of-range')]: async () => { assert.equal(row('index-range').args.outputs[0].outputIndex, incoming().outputs.length); reject('index-range'); await inventory('index-range-before', 'index-range-after') },
    [id('relinquish-without-spend')]: () => { internal('insertion'); const tx = incoming(), outpoint = `${tx.id('hex')}.2`; listed('insertion-after-basket', outpoint, 7, tc.sourceScript); assert.deepEqual(success('relinquish').result, { relinquished: true }); noSubmission('relinquish'); assert.ok(!success('relinquish-after-basket').result.outputs.some((o: any) => o.outpoint === outpoint)) }
  }
  for (const [suffix, mode] of [['unknown-not-in-knownTxids', 'unknown'], ['conflicting-proof', 'conflicting'], ['wrong-merkle-root', 'wrong-root']] as const) tests[id(suffix)] = async () => {
    const bytes = row(`proof-${mode}-internalize`).args.tx, graph = Beef.fromBinary(bytes), valid = coverageAtomic(row(`proof-${mode}-control`).args.tx)
    assert.ok(await Beef.fromBinary(row(`proof-${mode}-control`).args.tx).verify(tracker, false)); v.hydrate(valid); assert.ok(await valid.verify(tracker)); assert.ok(!await graph.verify(tracker, false), 'Negative proof is not independently invalid')
    if (mode === 'unknown') { assert.ok(graph.txs.some(t => t.isTxidOnly)); assert.ok(!row(`proof-${mode}-create`).args.options.knownTxids.includes(valid.inputs[0]!.sourceTXID ?? valid.inputs[0]!.sourceTransaction!.id('hex'))) }
    if (mode === 'conflicting') {
      assert.ok(new Set(graph.txs.map(t => t.txid)).size < graph.txs.length, 'Conflicting proof requires duplicate subject'); assert.ok(new Set(graph.bumps.map(b => b.computeRoot())).size > 1, 'Conflicting proof requires contradictory roots')
      const duplicate = Beef.fromBinary(row('proof-duplicate-control').args.tx)
      assert.ok(new Set(duplicate.txs.map(t => t.txid)).size < duplicate.txs.length); assert.ok(duplicate.bumps.every(b => b.computeRoot() === fixture.merkleRoot && b.blockHeight === fixture.fundingHeight))
      if (v.revision === 1) {
        internal('proof-duplicate-control'); const duplicateStage = success('proof-duplicate-create-control'); assert.ok(duplicateStage.result.signableTransaction?.reference); assert.deepEqual(success('proof-duplicate-create-control-cleanup').result, { aborted: true }); noSubmission('proof-duplicate-create-control'); noSubmission('proof-duplicate-create-control-cleanup')
      } else {
        // Acceptance of repeated serialized entries is optional. A compatible
        // staged action must still release its reservation, without broadcasting.
        await v.noControlSubmission('proof-duplicate-create-control')
        if (row('proof-duplicate-create-control').result?.signableTransaction?.reference) { assert.deepEqual(success('proof-duplicate-create-control-cleanup').result, { aborted: true }); await v.noControlSubmission('proof-duplicate-create-control-cleanup') }
      }
    }
    if (mode === 'wrong-root') assert.ok(graph.bumps.some(b => b.blockHeight === fixture.fundingHeight && b.computeRoot() !== fixture.merkleRoot))
    reject(`proof-${mode}-create`); reject(`proof-${mode}-internalize`); await inventory(`proof-${mode}-before`, `proof-${mode}-after`); internal(`proof-${mode}-control`)
    const control = success(`proof-${mode}-create-control`), unsigned = coverageAtomic(control.result.signableTransaction?.tx)
    assert.equal(`${unsigned.inputs[0]?.sourceTXID ?? unsigned.inputs[0]?.sourceTransaction?.id('hex')}.${unsigned.inputs[0]?.sourceOutputIndex}`, `${valid.id('hex')}.0`)
    assert.equal(unsigned.inputs[0]?.unlockingScript?.toHex(), ''); assert.deepEqual(success(`proof-${mode}-create-control-cleanup`).result, { aborted: true }); await v.noControlSubmission(`proof-${mode}-create-control`); await v.noControlSubmission(`proof-${mode}-create-control-cleanup`)
  }
  const outcomes: Outcome[] = []
  for (const variant of transactionCoverageIds) {
    if (variant === id('conflicting-remittance')) { outcomes.push({ id: variant, result: 'BLOCKED', detail: 'BLOCKED_INTERPRETATION: inactive remittance field exclusivity is not specified by the pinned interface.' }); continue }
    try { await tests[variant]!(); outcomes.push({ id: variant, result: 'PASS', detail: 'Exact public call, independent transaction or state predicate passed; complete shutdown binding remains mandatory.' }) }
    catch (error) { outcomes.push({ id: variant, result: error instanceof Blocked ? 'BLOCKED' : 'FAIL', detail: (error instanceof Error ? error.message : String(error)).slice(0, 1200) }) }
  }
  return outcomes
}
export async function verifyNativeTransactionCoverage(report: Report) {
  const assertions = await deriveTransactionCoverageOutcomes(report); assert.deepEqual(report.assertions, assertions)
  const counts = { PASS: assertions.filter(x => x.result === 'PASS').length, FAIL: assertions.filter(x => x.result === 'FAIL').length, BLOCKED: assertions.filter(x => x.result === 'BLOCKED').length }
  assert.equal(report.result, counts.FAIL ? 'FAIL' : counts.BLOCKED ? 'BLOCKED' : 'PASS')
  return { verified: true as const, claim: 'ENGINEERING_OBSERVATION_ONLY', assertionCount: assertions.length, counts, assertions, finalLedgerRequired: true }
}
/** The parent supplies independently authenticated storage, the complete global
 * ledger, and the post-shutdown provider ledger. A child end index cannot hide
 * a late spend, replay, rejected submission, or protected spend in an ancestor. */
/** Issued only after the next fixed module and its funding parent verify. The
 * foreign owner can spend its own change; this permits no other protected claim. */
export interface ForeignOwnerFixtureBinding { outpoint: string; txid: string; rawHex: string; positions: number[]; start: number; end: number }
export function bindForeignOwnerFixture(report: Report, external: any, parent: {verified: true}, funding: {verified: true}, ledger: Submission[]): ForeignOwnerFixtureBinding | undefined {
  assert.equal(report.oracle,'tpnil-native-coverage-transactions-oracle@4.0.0')
  assert.equal(external.oracle,'tpnil-native-coverage-extension-oracle@4.0.0')
  assert.equal(parent.verified,true);assert.equal(funding.verified,true);assert.equal(external.identity,report.identity)
  assert.ok(report.submissionEnd <= external.submissionStart)
  const calls=external.trace.filter((row:any)=>row.id==='fixture-external');assert.equal(calls.length,1)
  const row=calls[0];assert.equal(row.actor,'funder');assert.equal(row.method,'createAction');assert.equal(row.error,undefined)
  const tx=coverageAtomic(row.result.tx);assert.equal(tx.id('hex'),row.result.txid)
  const foreign=report.trace.filter(row=>row.id==='change-foreign');assert.equal(foreign.length,1)
  const outpoint=foreign[0]!.args.options.noSendChange[0]
  if(!tx.inputs.some(input=>`${input.sourceTXID??input.sourceTransaction?.id('hex')}.${input.sourceOutputIndex}`===outpoint))return undefined
  const rawHex=tx.toHex(),positions:number[]=[]
  for(let i=external.submissionStart;i<external.submissionEnd;i++)if(ledger[i]?.txid===tx.id('hex')) {assert.equal(ledger[i]!.beefHex,rawHex);assert.equal(ledger[i]!.verdict,'ACCEPTED_BY_NETWORK');positions.push(i)}
  assert.equal(positions.filter(index=>index>=row.submissionStart&&index<row.submissionEnd).length,1)
  return {outpoint,txid:tx.id('hex'),rawHex,positions,start:external.submissionStart,end:external.submissionEnd}
}

/** The later full-set control may spend outputs already owned by this native
 * wallet. Its complete parent and funding joins must verify before this narrow
 * receipt is issued. Negative calls gain no authority to spend an output. */
export interface LaterNativeOwnedSpendBinding extends ForeignOwnerFixtureBinding { outpoints: string[] }
export function bindLaterNativeOwnedSpend(report: Report, later: any, parent: {verified: true; assertions: any[]}, funding: {verified: true}, ledger: Submission[]): LaterNativeOwnedSpendBinding {
  assert.equal(report.oracle, 'tpnil-native-coverage-transactions-oracle@4.0.0')
  assert.equal(later.schema, 'tpnil-native-transaction-branches@1.0.0'); assert.equal(later.programRevision, 2)
  assert.equal(later.identity, report.identity); assert.equal(parent.verified, true); assert.equal(funding.verified, true)
  for (const id of ['completion.transaction.nosend-change/valid-full', 'completion.transaction.batch-send/returnTXIDOnly']) assert.equal(parent.assertions.find(row => row.id === id)?.result, 'PASS')
  const one = (id: string) => { const rows = later.trace.filter((row: any) => row.id === id); assert.equal(rows.length, 1); return rows[0] }
  const held = one('full-child-sign'), stage = one('full-child-stage'), release = one('batch-return-sign')
  assert.equal(held.actor, 'wallet'); assert.equal(held.method, 'signAction'); assert.equal(held.error, undefined)
  assert.equal(stage.actor, 'wallet'); assert.equal(stage.method, 'createAction'); assert.equal(stage.error, undefined)
  assert.equal(held.args.reference, stage.result.signableTransaction.reference); assert.equal(held.args.options.noSend, true)
  assert.equal(release.actor, 'wallet'); assert.equal(release.method, 'signAction'); assert.equal(release.error, undefined)
  assert.equal(release.args.options.acceptDelayedBroadcast, false); assert.equal(release.args.options.returnTXIDOnly, true)
  const tx = coverageAtomic(held.result.tx), txid = tx.id('hex'), rawHex = tx.toHex()
  assert.equal(txid, held.result.txid); assert.ok(release.args.options.sendWith.includes(txid))
  assert.ok(report.submissionEnd <= later.initialSubmissionCount && held.submissionEnd <= release.submissionStart)
  const eligible = later.cuts.filter((cut: any) => cut.id === 'full-set-before'); assert.equal(eligible.length, 1)
  const owned = eligible[0].snapshot.providers.filter((p: any) => p.id === later.activeProvider.id).flatMap((p: any) => p.snapshot.outputs).filter((o: any) => o.spendable && o.basketName === 'default')
  const inactive = report.trace.find(row => row.id === 'change-no-send-false')!.args.options.noSendChange[0]
  const incoming = report.trace.find(row => row.id === 'incoming-fixture')!.result.txid + '.0'
  const outpoints = [inactive, incoming].filter(point => owned.some((o: any) => o.outpoint === point) && tx.inputs.some(i => `${i.sourceTXID ?? i.sourceTransaction?.id('hex')}.${i.sourceOutputIndex}` === point))
  const positions: number[] = []
  assert.ok(Number.isSafeInteger(release.submissionStart) && Number.isSafeInteger(release.submissionEnd) && release.submissionEnd <= ledger.length)
  for (let i = later.initialSubmissionCount; i < later.submissions.length; i++) if (ledger[i]?.txid === txid) {
    assert.ok(i >= release.submissionStart && i < release.submissionEnd, 'Owned held transaction escaped its exact release')
    assert.equal(ledger[i]!.beefHex, rawHex); assert.equal(ledger[i]!.verdict, 'ACCEPTED_BY_NETWORK'); positions.push(i)
  }
  assert.equal(positions.length, 1)
  return { outpoint: inactive, outpoints, txid, rawHex, positions, start: release.submissionStart, end: release.submissionEnd }
}

export async function verifyTransactionCoverageParentBindings(report: Report, binding: { laterNativeOwnedSpend?: LaterNativeOwnedSpendBinding; foreignOwnerFixture?: ForeignOwnerFixtureBinding; identity: string; globalSubmissions: Submission[]; finalSubmissions: Submission[]; storageTransactions: ReadonlyMap<string, Transaction>; graph: SubmissionGraphOptions }) {
  assert.equal(report.identity, binding.identity)
  assert.equal(binding.graph.requireResolvedAncestors, true); assert.ok(binding.graph.resolvedTransactions)
  assert.deepEqual(binding.graph.trustedMinedRoot, { txid: fixture.txid, rawHex: fixture.rawHex })
  assert.deepEqual(binding.finalSubmissions.slice(0, binding.globalSubmissions.length), binding.globalSubmissions, 'Final ledger omits the verified global prefix')
  assert.deepEqual(report.submissionPrefix, binding.globalSubmissions.slice(0, report.submissionStart))
  assert.deepEqual(report.submissions, binding.globalSubmissions.slice(report.submissionStart, report.submissionEnd))
  for (const row of report.storageTransactions) assert.equal(binding.storageTransactions.get(row.txid)?.toHex(), row.rawTxHex, 'Child storage bytes differ from authenticated final storage')
  const checked = await verifyNativeTransactionCoverage(report), v = await inspect(report)
  const approved = new Map<string, { rawHex: string; positions: Set<number> }>(), signed = new Map<string, Transaction>()
  let aggregateFeesSatoshis = 0
  const feeTransactions = new Map<string, Transaction>(), prior = new Set<string>()
  for (const entry of report.submissionPrefix) for (const observed of observedSubmissionTransactions(entry, binding.graph)) prior.add(observed.txid)
  const retainFees = (tx: Transaction) => { if (prior.has(tx.id('hex')) || feeTransactions.has(tx.id('hex'))) return; feeTransactions.set(tx.id('hex'), tx); for (const input of tx.inputs) if (input.sourceTransaction) retainFees(input.sourceTransaction) }
  for (const row of report.trace) for (const payload of [row.result, row.error]) if (payload?.tx) { const tx = coverageAtomic(payload.tx); v.hydrate(tx); assert.ok(await tx.verify(tracker), 'Returned signed error/success bytes must independently verify'); retainFees(tx) }
  for (const row of report.trace.filter(row => /^proof-.*-control$/.test(row.id) && row.method === 'internalizeAction')) { const tx = row.id === 'proof-duplicate-control' ? coverageDuplicateControlAtomic(row.args.tx) : coverageAtomic(row.args.tx); v.hydrate(tx); assert.ok(await tx.verify(tracker)); retainFees(tx) }
  for (const row of report.trace) {
    if (row.result?.txid === undefined || !Array.isArray(row.result?.tx)) continue
    const tx = await v.txFor(row.id); signed.set(tx.id('hex'), tx)
    const fee = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0)
    assert.ok(Number.isSafeInteger(fee) && fee >= 0, 'Actual signed fee is invalid')
    const positions = new Set<number>()
    for (let i = report.submissionStart; i < report.submissionEnd; i++) if (binding.globalSubmissions[i]!.txid === tx.id('hex')) {
      const observed = observedSubmissionTransactions(binding.globalSubmissions[i]!, binding.graph)[0]!.transaction
      assert.equal(observed.toHex(), tx.toHex()); positions.add(i)
    }
    approved.set(tx.id('hex'), { rawHex: tx.toHex(), positions })
  }
  for (const tx of feeTransactions.values()) { const fee = tx.inputs.reduce((sum, input) => sum + input.sourceTransaction!.outputs[input.sourceOutputIndex]!.satoshis!, 0) - tx.outputs.reduce((sum, output) => sum + output.satoshis!, 0); assert.ok(Number.isSafeInteger(fee) && fee >= 0); aggregateFeesSatoshis += fee }
  assert.ok(feeTransactions.size <= v.policy.bounds.maximumSignedTransactions, 'Signed transaction budget exceeded')
  assert.ok(aggregateFeesSatoshis <= v.policy.bounds.maximumAggregateFeesSatoshis, 'Aggregate actual fee budget exceeded')
  const protectedClaims: Array<{ id: string; outpoint: string; permittedCallIds: string[] }> = [], unprovenClaims: Outcome[] = []
  const protect = (suffix: string, get: () => string, permittedCallIds: string[] = []) => {
    const outcome = checked.assertions.find(x => x.id === id(suffix))!; if (outcome.result !== 'PASS') { unprovenClaims.push(outcome); return }; protectedClaims.push({ id: outcome.id, outpoint: get(), permittedCallIds })
  }
  protect('foreign-reference-reject', () => v.row('foreign-stage').args.inputs[0].outpoint, ['foreign-owner-sign'])
  for (const [suffix, call] of [['foreign-output', 'change-foreign'], ['already-spent', 'change-spent'], ['out-of-range', 'change-range'], ['noSend-false', 'change-no-send-false']] as const) protect(suffix, () => v.row(call).args.options.noSendChange[0], suffix === 'foreign-output' ? report.trace.filter(r => r.actor === 'funder' && r.result?.txid).map(r => r.id) : suffix === 'already-spent' ? ['held-child'] : suffix === 'noSend-false' ? report.trace.filter(r => r.actor === 'wallet' && r.result?.txid && !r.id.startsWith('change-') && !/^proof-.*-create$/.test(r.id)).map(r => r.id) : [])
  for (const [suffix, mode] of [['unknown-not-in-knownTxids', 'unknown'], ['conflicting-proof', 'conflicting'], ['wrong-merkle-root', 'wrong-root']] as const) protect(suffix, () => v.row(`proof-${mode}-create`).args.inputs[0].outpoint)
  protect('relinquish-without-spend', () => v.row('relinquish').args.output)
  for (const [suffix, call] of [['missing-paymentRemittance', 'missing-payment'], ['missing-insertionRemittance', 'missing-insertion'], ['wrong-derivation', 'wrong-derivation'], ['wrong-derivation', 'wrong-prefix'], ['wrong-derivation', 'wrong-sender'], ['output-index-out-of-range', 'index-range']] as const) protect(suffix, () => `${v.incoming().id('hex')}.${v.row(call).args.outputs[0].outputIndex}`, suffix === 'output-index-out-of-range' || suffix === 'missing-insertionRemittance' ? [] : report.trace.filter(r => r.actor === 'wallet' && r.result?.txid && !r.id.startsWith('change-') && !/^proof-.*-create$/.test(r.id)).map(r => r.id))
  const foreignOwner = binding.foreignOwnerFixture
  const laterNative = binding.laterNativeOwnedSpend
  if (laterNative) {
    assert.equal(report.oracle, 'tpnil-native-coverage-transactions-oracle@4.0.0')
    assert.ok(laterNative.start >= report.submissionEnd && laterNative.end <= binding.globalSubmissions.length)
    assert.equal(Transaction.fromHex(laterNative.rawHex).id('hex'), laterNative.txid)
    assert.equal(laterNative.positions.length, 1)
    for (const position of laterNative.positions) {
      assert.ok(position >= laterNative.start && position < laterNative.end)
      assert.deepEqual(binding.globalSubmissions[position], { txid: laterNative.txid, beefHex: laterNative.rawHex, verdict: 'ACCEPTED_BY_NETWORK' })
    }
  }
  if(foreignOwner) {
    assert.equal(report.oracle,'tpnil-native-coverage-transactions-oracle@4.0.0')
    assert.equal(foreignOwner.outpoint,v.row('change-foreign').args.options.noSendChange[0]);assert.ok(foreignOwner.start>=report.submissionEnd&&foreignOwner.end<=binding.globalSubmissions.length)
    assert.equal(Transaction.fromHex(foreignOwner.rawHex).id('hex'),foreignOwner.txid)
    assert.ok(foreignOwner.positions.length>0)
    for(const index of foreignOwner.positions) {assert.ok(Number.isSafeInteger(index)&&index>=foreignOwner.start&&index<foreignOwner.end);const row=binding.globalSubmissions[index]!;assert.equal(row.txid,foreignOwner.txid);assert.equal(row.beefHex,foreignOwner.rawHex);assert.equal(row.verdict,'ACCEPTED_BY_NETWORK')}
  }
  let ancestorCount = 0
  const invalidProtectedSpends = new Map<string, unknown>()
  for (let index = report.submissionStart; index < binding.finalSubmissions.length; index++) for (const observed of observedSubmissionTransactions(binding.finalSubmissions[index]!, binding.graph)) {
    if (!observed.isTarget) ancestorCount++
    for (const claim of protectedClaims) if (v.spend(observed.transaction, claim.outpoint)) {
      const permit = claim.permittedCallIds.some(name => v.row(name).result?.txid === observed.txid) ? approved.get(observed.txid) : undefined
      const ownedFixture=claim.id===id('foreign-output')&&foreignOwner?.outpoint===claim.outpoint&&foreignOwner.txid===observed.txid&&foreignOwner.rawHex===observed.transaction.toHex()&&(!observed.isTarget||foreignOwner.positions.includes(index))
      const ownedNative = [id('noSend-false'), id('missing-paymentRemittance'), id('wrong-derivation')].includes(claim.id) && laterNative?.outpoints.includes(claim.outpoint) && laterNative.txid === observed.txid && laterNative.rawHex === observed.transaction.toHex() && index >= laterNative.positions[0]! && (!observed.isTarget || laterNative.positions.includes(index))
      if (!ownedNative && !ownedFixture && !(permit && permit.positions.size > 0 && permit.rawHex === observed.transaction.toHex() && (!observed.isTarget || permit.positions.has(index)))) invalidProtectedSpends.set(`${claim.id}/${observed.txid}`, { claim: claim.id, outpoint: claim.outpoint, spender: observed.txid, firstObservedIndex: index })
    }
  }
  assert.equal(invalidProtectedSpends.size, 0, `Protected outpoint spent in final submission ancestry: ${JSON.stringify([...invalidProtectedSpends.values()])}`)
  return { verified: true as const, claim: 'ENGINEERING_OBSERVATION_ONLY', signedTransactions: feeTransactions.size, successfulReturnedTransactions: signed.size, aggregateFeesSatoshis, publicCalls: report.trace.length, finalCount: binding.finalSubmissions.length, ancestorCount, protectedClaims, unprovenClaims, ...(foreignOwner?{foreignOwnerFixture:foreignOwner}:{}), ...(laterNative?{laterNativeOwnedSpend:laterNative}:{}) }
}
