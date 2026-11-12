import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Beef, MerklePath, PushDrop, Transaction, Utils } from '@bsv/sdk'
import { projectDatasetWithReferenceOnlyRows } from '../../storage-sync/projection-reference-rows.js'
import { entities, projectDataset, type Dataset } from '../../storage-sync/projection.js'
import { canonicalSyncChunk } from '../../storage-sync/compatibility.js'
import { canonicalJson } from '../../determinism.js'
import { portabilityAssertions, portableTask } from './conformance-portability.js'
import { verifyPortableProofClosure } from './portability-proof.js'
const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../../fixtures/teranode/wab-funding-v1.json'), 'utf8'))
const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === fixture.merkleRoot && height === fixture.fundingHeight }

function datasetBeef(dataset: Dataset, starting: number[]): Beef {
  const beef = Beef.fromBinary(starting)
  for (const row of [...(dataset.transactions ?? []), ...(dataset.provenTxReqs ?? [])]) if (Array.isArray(row.inputBEEF) && row.inputBEEF.length) beef.mergeBeef(row.inputBEEF as number[])
  for (const row of [...(dataset.transactions ?? []), ...(dataset.provenTxReqs ?? [])]) if (Array.isArray(row.rawTx) && row.rawTx.length) beef.mergeRawTx(row.rawTx as number[])
  for (const row of dataset.provenTxs ?? []) {
    assert.equal(row.height, fixture.fundingHeight); assert.equal(row.merkleRoot, fixture.merkleRoot); assert.equal(row.blockHash, fixture.fundingBlockHash)
    const proof = MerklePath.fromBinary(row.merklePath as number[])
    assert.equal(proof.computeRoot(String(row.txid)), fixture.merkleRoot)
    beef.mergeRawTx(row.rawTx as number[], beef.mergeBump(proof))
  }
  return beef
}

/** Recompute public operations, full logical projection and signed ancestry. */
export async function verifyNativePortability(report: any, { requireNative = true } = {}) {
  const v4 = report.schema === 'tpnil-native-storage-portability@4'
  const v3 = v4 || report.schema === 'tpnil-native-storage-portability@3'
  const project = v4 ? projectDatasetWithReferenceOnlyRows : projectDataset
  const v2 = v3 || report.schema === 'tpnil-native-storage-portability@2'
  assert.ok(v2 || report.schema === 'tpnil-native-storage-portability@1')
  if (v2) assert.equal(report.oracle, v4 ? 'tpnil-native-portability-oracle@4.0.0' : v3 ? 'tpnil-native-portability-oracle@3.0.0' : 'tpnil-native-portability-oracle@2.0.0')
  else assert.equal(report.oracle, undefined, 'Original schema cannot select a new proof predicate')
  assert.equal(report.claim, 'ENGINEERING_OBSERVATION_ONLY')
  assert.ok(['native-ui', 'reference-engineering'].includes(report.mode))
  if (requireNative) assert.equal(report.mode, 'native-ui', 'Reference recreation cannot qualify native portability')
  assert.deepEqual(report.assertions.map((a: any) => a.id).sort(), [...portabilityAssertions].sort())
  const trace = report.trace as any[]
  const outageEnd = report.outage?.restorationStartedAt ?? report.outage?.endedAt
  const interval = (row: any, lower: string, upper: string) => {
    assert.ok(Date.parse(row.startedAt) >= Date.parse(lower) && Date.parse(row.endedAt) >= Date.parse(row.startedAt) && Date.parse(row.endedAt) <= Date.parse(upper), 'Observation lies outside its ordered execution interval')
  }
  const initialDecryption = () => {
    const before = trace.find(row => row.method === 'decrypt')
    assert.ok(before)
    assert.deepEqual(before.result, report.beforeDecryption)
    assert.deepEqual(before.args, { ciphertext: report.task.ciphertext, protocolID: [0, 'todo list'], keyID: '1', counterparty: 'self' })
    assert.equal(Utils.toUTF8(before.result.plaintext), portableTask)
    const created = trace[trace.indexOf(before) - 1]
    assert.equal(created.method, 'listOutputs'); assert.deepEqual(created.result, report.created)
    interval(before, created.endedAt, report.readWindows?.source.startedAt ?? report.outage.startedAt)
    return before
  }
  const decryptions = () => {
    const rows = trace.filter(row => row.method === 'decrypt')
    assert.equal(rows.length, 2, 'Distinct before/after public decrypt observations required')
    for (const [index, value] of [report.beforeDecryption, report.afterDecryption].entries()) {
      assert.deepEqual(rows[index].result, value)
      assert.deepEqual(rows[index].args, { ciphertext: report.task.ciphertext, protocolID: [0, 'todo list'], keyID: '1', counterparty: 'self' })
      assert.equal(Utils.toUTF8(value.plaintext), portableTask)
    }
    assert.equal(rows[0], initialDecryption())
    const recovered = trace[trace.indexOf(rows[1]) - 1]
    assert.equal(recovered.method, 'listOutputs'); assert.deepEqual(recovered.result, report.recovered)
    interval(recovered, report.coldReload.at, rows[1].startedAt)
    interval(rows[1], recovered.endedAt, outageEnd)
    return { before: rows[0], after: rows[1], recovered }
  }
  const snapshots = (provider: string, start = 0, end = report.storage.length): Dataset[] => {
    // StorageClient exposes JSON RPC entity timestamps as Dates and absent SQL
    // values as undefined. Reconstruct that representation independently; do
    // not import the client's entity validation or discard any logical field.
    const normalizeEntity = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => {
        if (['created_at', 'updated_at'].includes(key)) return [key, new Date(value as string).toISOString()]
        if (['rawTx', 'inputBEEF', 'lockingScript', 'merklePath'].includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
          const entries = Object.entries(value)
          assert.ok(entries.every(([index, byte], i) => index === String(i) && Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255), 'Malformed captured Uint8Array')
          return [key, entries.map(([, byte]) => byte)]
        }
        return [key, value]
      }))
    const datasets: Dataset[] = []
    let current: Dataset | undefined
    let complete = true
    for (const row of report.storage.slice(start, end).filter((row: any) => row.provider === provider && row.method === 'getSyncChunk' && row.response)) {
      const request = row.request[0], chunk = canonicalSyncChunk(row.response, 'go') as any
      assert.equal(request.identityKey, report.identity); assert.equal(chunk.userIdentityKey, report.identity)
      assert.equal(request.fromStorageIdentityKey, report.counterparts[provider === 'source-observer' ? 'source' : 'destination'].storageIdentityKey)
      assert.equal(request.toStorageIdentityKey, request.fromStorageIdentityKey)
      assert.equal(chunk.fromStorageIdentityKey, request.fromStorageIdentityKey)
      assert.equal(canonicalJson(row.canonicalResponse), canonicalJson(chunk), 'Recorded wire normalization differs from raw RPC')
      if (request.offsets.every((offset: any) => offset.offset === 0)) { assert.equal(complete, true, 'Previous snapshot lacks its terminal empty page'); complete = false; current = Object.fromEntries(entities.map(entity => [entity, []])); datasets.push(current!) }
      assert.ok(current)
      assert.equal(complete, false, 'Additional page follows the terminal empty page')
      if (chunk.user) current.user = normalizeEntity(chunk.user)
      for (const entity of entities) {
        const offset = request.offsets.find((offset: any) => offset.name === entity.slice(0, -1))
        assert.equal(offset.offset, current[entity]!.length, 'Sync read page cursor differs from captured records')
        current[entity]!.push(...(chunk[entity] ?? []).map(normalizeEntity))
      }
      complete = entities.every(entity => Array.isArray(chunk[entity]) && chunk[entity].length === 0)
    }
    assert.equal(complete, true, 'Snapshot lacks its terminal empty page')
    return datasets
  }
  const snapshotWindow = (name: string, provider: string, lower: string, upper: string) => {
    // Earlier reference archives predate bounded read windows and remain
    // explicitly ineligible for native qualification. Every native run and
    // every newly captured reference run must carry the stronger observation.
    if (report.mode !== 'native-ui' && report.readWindows === undefined) return
    const window = report.readWindows[name]
    interval(window, lower, upper)
    assert.ok(Number.isInteger(window.storageStart) && Number.isInteger(window.storageEnd) && window.storageStart >= 0 && window.storageEnd > window.storageStart && window.storageEnd <= report.storage.length)
    const rows = report.storage.slice(window.storageStart, window.storageEnd)
    assert.ok(rows.every((row: any) => row.provider === provider && ['makeAvailable', 'getSyncChunk'].includes(row.method) && row.response && !row.error))
    assert.deepEqual(snapshots(provider, window.storageStart, window.storageEnd), [report[name]], 'Snapshot window must bind one complete authenticated dataset')
  }
  const predicates: Record<string, () => void | Promise<void>> = {
    'portability.same-identity': () => {
      const identities = trace.filter(row => row.method === 'getPublicKey' && row.args.identityKey)
      assert.equal(identities.length, 2); assert.equal(identities[0].result.publicKey, report.identity); assert.equal(identities[1].result.publicKey, report.identity)
      assert.equal(report.identityAfter, report.identity)
      assert.ok(Date.parse(identities[0].endedAt) <= Date.parse(report.outage.startedAt))
      assert.ok(Date.parse(identities[1].startedAt) >= Date.parse(report.coldReload.at) && Date.parse(identities[1].endedAt) <= Date.parse(outageEnd))
    },
    'portability.distinct-counterparts': () => {
      assert.notEqual(report.counterparts.source.storageIdentityKey, report.counterparts.destination.storageIdentityKey)
      for (const [provider, settings] of [['source-observer', report.counterparts.source], ['destination-observer', report.counterparts.destination]] as const) assert.ok(report.storage.some((row: any) => row.provider === provider && row.method === 'makeAvailable' && row.response.storageIdentityKey === settings.storageIdentityKey))
    },
    'portability.native-mediated-sync': () => {
      assert.ok(report.storage.every((row: any) => row.method !== 'processSyncChunk'), 'Observer must never migrate native storage records')
      if (report.mode === 'native-ui') {
        assert.ok(report.nativeRpc.some((row: any) => row.host === 'replacement-wallet.itcve.test' && row.method === 'processSyncChunk' && row.completed && row.status === 200))
        assert.ok(report.ui.some((row: any) => row.stage === 'native-sync-complete' && row.text.includes('Sync complete')))
        assert.ok(report.ui.some((row: any) => row.stage === 'replacement-active' && row.text.includes('replacement-wallet.itcve.test') && (v3 ? row.text.split(/\r?\n/).some((line: string) => line.trim().replace(/\s+/g, ' ').toLowerCase() === 'in use') : row.text.includes('In use'))))
      } else assert.ok(report.referenceMediator.some((row: any) => row.method === 'processSyncChunk' && row.response && !row.error))
    },
    'portability.complete-logical-dataset': async () => {
      assert.deepEqual(report.source, snapshots('source-observer')[0], 'Source dataset differs from authenticated RPC responses')
      assert.deepEqual(report.destination, snapshots('destination-observer')[0], 'Destination dataset differs from authenticated RPC responses')
      snapshotWindow('source', 'source-observer', initialDecryption().endedAt, report.readWindows?.destination.startedAt ?? report.outage.startedAt)
      snapshotWindow('destination', 'destination-observer', report.readWindows?.source.endedAt ?? initialDecryption().endedAt, report.outage?.startedAt ?? report.readWindows.destination.endedAt)
      assert.equal(report.source.user.identityKey, report.identity); assert.equal(report.destination.user.identityKey, report.identity)
      assert.ok(report.source.transactions.length >= 2 && report.source.outputs.length >= 2)
      if (!v2) assert.ok(report.source.provenTxs.length >= 1)
      assert.deepEqual(project(report.source), project(report.destination), 'Portable bytes, metadata or relationships differ')
      const outpoint = report.task.txid + '.' + report.task.vout; assert.equal(outpoint, report.outpoint)
      const sourceOutput = report.source.outputs.find((row: any) => row.txid === report.task.txid && row.vout === report.task.vout)
      assert.equal(sourceOutput.spendable, true)
      const task = Transaction.fromAtomicBEEF([...Buffer.from(report.task.beefHex, 'hex')])
      assert.equal(task.id('hex'), report.task.txid); assert.equal(task.toHex(), report.task.rawHex); assert.ok(await task.verify(tracker))
      const decoded = PushDrop.decode(task.outputs[report.task.vout]!.lockingScript)
      assert.equal(Utils.toUTF8(decoded.fields[0]!), '1ToDoDtKreEzbHYKFjmoBuduFmSXXUGZG')
      assert.deepEqual(decoded.fields[1], report.task.ciphertext); assert.equal(task.outputs[report.task.vout]!.satoshis, 3)
      for (const dataset of [report.source, report.destination]) {
        const graph = v2 ? (await verifyPortableProofClosure(dataset)).beef : datasetBeef(dataset, [...Buffer.from(report.task.beefHex, 'hex')])
        const retainedTask = Transaction.fromAtomicBEEF(graph.toBinaryAtomic(report.task.txid))
        assert.equal(retainedTask.toHex(), report.task.rawHex)
        assert.ok(await retainedTask.verify(tracker))
      }
    },
    'portability.source-unavailable': () => {
      assert.equal(report.outage.probe.reachable, false); assert.match(report.outage.probe.error, /fetch failed|connect|refused/i)
      assert.equal(report.outage.events.at(-1).available, false)
      if (report.mode === 'native-ui') assert.equal(typeof report.outage.restorationStartedAt, 'string', 'Native outage must end before reopening the source listener')
      assert.ok(Date.parse(report.outage.endedAt) >= Date.parse(outageEnd))
      assert.ok(Date.parse(outageEnd) >= Date.parse(report.outage.startedAt))
    },
    'portability.cold-wallet-reload': () => {
      for (const name of ['locked', 'unlocked', 'contextDropped', 'applicationCacheCleared', 'taskVisible']) assert.equal(report.coldReload[name], true)
      assert.ok(Date.parse(report.outage.startedAt) <= Date.parse(report.coldReload.at) && Date.parse(report.coldReload.at) <= Date.parse(outageEnd))
      if (report.mode === 'native-ui') {
        assert.equal(report.coldReload.mechanism, 'native-settings-lock-unlock')
        assert.ok(report.coldReload.consoleMessages.some((text: string) => /dropWalletContext \(WALLET_LOCKED\): gone immediately/.test(text)))
      } else assert.equal(report.coldReload.mechanism, 'reference-wallet-recreation')
    },
    'portability.cold-task-recovery': async () => {
      const { recovered: row } = decryptions()
      assert.equal(row.args.basket, 'todo tokens'); assert.equal(row.args.include, 'entire transactions')
      const outputs = report.recovered.outputs.filter((output: any) => output.outpoint === report.outpoint)
      assert.equal(outputs.length, 1); assert.equal(outputs[0].spendable, true)
      const original = report.created.outputs.find((output: any) => output.outpoint === report.outpoint)
      for (const field of ['satoshis', 'lockingScript', 'tags', 'customInstructions', 'outputDescription']) assert.deepEqual(outputs[0][field], original[field])
      const tx = Transaction.fromAtomicBEEF(Beef.fromBinary(report.recovered.BEEF).toBinaryAtomic(report.task.txid))
      assert.equal(tx.toHex(), report.task.rawHex); assert.ok(await tx.verify(tracker))
      if (report.mode === 'native-ui') assert.ok(report.replacementRpc.some((rpc: any) => rpc.host === 'replacement-wallet.itcve.test' && rpc.method === 'listOutputs' && rpc.completed && rpc.status === 200), 'Cold public reads must reach the replacement counterpart')
    },
    'portability.replacement-redemption': async () => {
      assert.deepEqual(report.destinationAfter, (v3 ? snapshots('destination-observer').at(-1) : snapshots('destination-observer')[1]), 'Post-replacement dataset differs from authenticated RPC responses')
      const redeemed = trace.at(-1)
      assert.equal(redeemed.method, 'listOutputs'); assert.deepEqual(redeemed.result, report.redeemed)
      assert.equal(redeemed.args.basket, 'todo tokens'); assert.equal(redeemed.args.include, 'entire transactions')
      const { after } = decryptions()
      assert.ok(trace.indexOf(redeemed) > trace.indexOf(after))
      interval(redeemed, after.endedAt, outageEnd)
      snapshotWindow('destinationAfter', 'destination-observer', redeemed.endedAt, outageEnd)
      if (report.readWindows) {
        assert.ok(report.readWindows.destinationAfter.storageStart >= report.readWindows.destination.storageEnd)
        assert.equal(report.readWindows.destinationAfter.storageEnd, report.storage.length)
      }
      if (v3) {
        assert.ok(Array.isArray(report.redemptionObservations) && report.redemptionObservations.length > 0)
        let lower = after.endedAt
        if (report.mode === 'native-ui') {
          const visible = report.ui.filter((row: any) => row.stage === 'native-task-complete')
          assert.equal(visible.length, 1)
          assert.ok(visible[0].text.includes('Congrats! Task complete 🎉'))
          assert.ok(Date.parse(visible[0].at) >= Date.parse(lower) && Date.parse(visible[0].at) <= Date.parse(redeemed.startedAt))
          lower = visible[0].at
        }
        let previousEnd = report.readWindows.destination.storageEnd
        for (const [index, observation] of report.redemptionObservations.entries()) {
          assert.equal(observation.name, `redemptionPoll${index}`)
          const window = report.readWindows[observation.name]
          interval(window, lower, redeemed.startedAt)
          assert.ok(Number.isInteger(window.storageStart) && Number.isInteger(window.storageEnd) && window.storageStart >= 0 && window.storageEnd > window.storageStart && window.storageEnd <= report.storage.length)
          assert.ok(report.storage.slice(window.storageStart, window.storageEnd).every((row: any) => row.provider === 'destination-observer' && ['makeAvailable', 'getSyncChunk'].includes(row.method) && row.response && !row.error))
          assert.equal(window.storageStart, previousEnd)
          assert.deepEqual(snapshots('destination-observer', window.storageStart, window.storageEnd), [observation.dataset])
          assert.equal(observation.ready, index === report.redemptionObservations.length - 1)
          lower = window.endedAt; previousEnd = window.storageEnd
        }
        const last = report.redemptionObservations.at(-1)
        assert.equal(report.redemptionCompletion.observation, last.name)
        assert.equal(report.redemptionCompletion.txid, report.redemption.txid)
        assert.equal(last.txid, report.redemption.txid)
        assert.ok(Date.parse(report.redemptionCompletion.at) >= Date.parse(lower) && Date.parse(report.redemptionCompletion.at) <= Date.parse(redeemed.startedAt))
        const complete = last.dataset
        const locked = complete.outputs.find((row: any) => row.txid === report.task.txid && row.vout === report.task.vout)
        assert.equal(locked.spendable, false)
        const signed = complete.transactions.find((row: any) => row.transactionId === locked.spentBy)
        assert.equal(signed.txid, report.redemption.txid); assert.notEqual(signed.status, 'unsigned')
        const closure = await verifyPortableProofClosure(complete)
        const tx = Transaction.fromAtomicBEEF(closure.beef.toBinaryAtomic(signed.txid))
        assert.equal(tx.toHex(), report.redemption.rawHex)
        assert.ok(tx.inputs.some(input => input.sourceTXID === report.task.txid && input.sourceOutputIndex === report.task.vout))
        assert.equal(report.readWindows.destinationAfter.storageStart, previousEnd)
        assert.ok(Date.parse(last.capturedAt) >= Date.parse(lower) && Date.parse(last.capturedAt) <= Date.parse(report.redemptionCompletion.at))
        if (report.mode === 'native-ui') {
          const receipts = last.processActionReceipts
          assert.ok(Array.isArray(receipts) && receipts.length > 0)
          const matching = receipts.filter((receipt: any) => {
            const requestBytes = Buffer.from(receipt.requestHex, 'hex'), responseBytes = Buffer.from(receipt.responseHex, 'hex')
            const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
            assert.equal(digest(requestBytes), receipt.requestSha256); assert.equal(digest(responseBytes), receipt.responseSha256)
            const request = JSON.parse(requestBytes.toString()), response = JSON.parse(responseBytes.toString())
            if (request.params?.[1]?.txid !== report.redemption.txid) return false
            assert.equal(receipt.status, 200); assert.equal(receipt.requestIdentityKey, report.identity)
            assert.equal(request.method, 'processAction'); assert.equal(request.params[0].identityKey, report.identity)
            assert.equal(Buffer.from(request.params[1].rawTx).toString('hex'), report.redemption.rawHex)
            assert.equal(response.id, request.id); assert.equal(response.error, undefined); assert.ok(response.result)
            assert.ok(!(response.result.sendWithResults ?? []).some((r: any) => ['failed', 'error'].includes(r.status)))
            return true
          })
          assert.equal(matching.length, 1, 'Exactly one successful authenticated processAction must bind the signed redemption bytes')
        }
      }
      assert.ok(!report.redeemed.outputs.some((output: any) => output.outpoint === report.outpoint))
      const spent = report.destinationAfter.outputs.find((output: any) => output.txid === report.task.txid && output.vout === report.task.vout)
      assert.equal(spent.spendable, false)
      const row = report.destinationAfter.transactions.find((transaction: any) => transaction.transactionId === spent.spentBy)
      assert.equal(row.txid, report.redemption.txid)
      const beef = v2 ? (await verifyPortableProofClosure(report.destinationAfter)).beef : datasetBeef(report.destinationAfter, [...Buffer.from(report.task.beefHex, 'hex')])
      const tx = Transaction.fromAtomicBEEF(beef.toBinaryAtomic(report.redemption.txid))
      assert.equal(tx.toHex(), report.redemption.rawHex); assert.ok(await tx.verify(tracker))
      assert.ok(tx.inputs.some(input => input.sourceTXID === report.task.txid && input.sourceOutputIndex === report.task.vout))
      if (report.mode === 'native-ui') assert.ok(report.replacementRpc.some((rpc: any) => rpc.host === 'replacement-wallet.itcve.test' && rpc.method === 'processAction' && rpc.status === 200))
      else assert.ok(report.referenceMediatorAfter.some((rpc: any) => rpc.provider === 'replacement-active' && rpc.method === 'processAction' && rpc.response && !rpc.error))
    },
    'portability.cleanup': () => { assert.equal(report.cleanup.sourceRestored, true); if (requireNative) assert.equal(report.cleanup.replacementOwnedByServiceGraph, true) }
  }
  const assertions = []
  for (const item of report.assertions) {
    let result = 'PASS', detail: string | undefined
    try { await predicates[item.id]!() } catch (error) { result = 'FAIL'; detail = String(error) }
    assert.equal(item.result, result, `Independent portability predicate differs: ${item.id}: ${detail ?? ''}`)
    assertions.push({ id: item.id, result })
  }
  assert.equal(report.result, assertions.every(row => row.result === 'PASS') ? 'PASS' : 'FAIL')
  return { verified: true, result: report.result, mode: report.mode, assertions }
}

if (process.argv[1] === import.meta.filename) {
  const report = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]!), 'utf8'))
  console.log(JSON.stringify(await verifyNativePortability(report, { requireNative: !process.argv.includes('--reference') })))
}
