import assert from 'node:assert/strict'
import { Beef, LockingScript, MerklePath, P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import { tc, type TransactionCoverageCall as Call, type TransactionCoverageExecute } from './coverage-transactions-model.js'
class Missing extends Error { constructor(readonly dependency: string) { super(dependency) } }
export function coverageAtomic(bytes: any): Transaction {
  assert.ok(Array.isArray(bytes) && bytes.length > 0 && Array.from({ length: bytes.length }, (_, i) => Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255).every(Boolean))
  const reader = new Utils.Reader(bytes), beef = Beef.fromReader(reader); assert.ok(reader.eof()); assert.match(beef.atomicTxid ?? '', /^[a-f0-9]{64}$/)
  const tx = Transaction.fromAtomicBEEF(bytes); assert.equal(tx.id('hex'), beef.atomicTxid); return tx
}
/** Decode only the declared identical-duplicate positive control. Every repeated
 * transaction must have exactly the same body and proof index before merging. */
export function coverageDuplicateControlAtomic(bytes: number[]): Transaction {
  const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader); assert.ok(reader.eof()); assert.match(graph.atomicTxid ?? '', /^[a-f0-9]{64}$/)
  const seen = new Map<string, { raw: number[] | undefined; bump: number | undefined }>(); let duplicates = 0
  for (const tx of graph.txs) { const previous = seen.get(tx.txid); if (previous) { assert.deepEqual(tx.rawTx, previous.raw); assert.equal(tx.bumpIndex, previous.bump); duplicates++ } else seen.set(tx.txid, { raw: tx.rawTx, bump: tx.bumpIndex }) }
  assert.equal(duplicates, 1)
  const canonical = new Beef(); canonical.mergeBeef(graph); return coverageAtomic(canonical.toBinaryAtomic(graph.atomicTxid!))
}
export function coverageProofVariant(bytes: number[], mode: 'unknown' | 'conflicting' | 'wrong-root' | 'duplicate-valid', unrelated: number[], includeUnrelated = false): number[] {
  const graph = Beef.fromBinary(bytes), target = coverageAtomic(bytes)
  if (mode === 'unknown') {
    const sourceId = target.inputs[0]!.sourceTXID ?? target.inputs[0]!.sourceTransaction!.id('hex')
    const missing = new Beef(); missing.mergeTxidOnly(sourceId); missing.mergeRawTx(target.toBinary()); if (includeUnrelated) missing.mergeBeef(unrelated)
    const writer = new Utils.Writer(); missing.toWriter(writer)
    return includeUnrelated ? writer.toArray() : [...bytes.slice(0, 36), ...writer.toArray()]
  }
  const original = graph.bumps[0]!, hash = original.path[0]![0]!.hash!
  const bad = new MerklePath(original.blockHeight, [[{ offset: 0, hash, txid: true }, { offset: 1, hash: '39'.repeat(32) }]])
  if (mode === 'duplicate-valid') { const proven = graph.txs.find(tx => tx.bumpIndex === 0)!, ctor: any = proven.constructor; graph.txs.unshift(new ctor(proven.rawTx!, 0)) }
  else if (mode === 'wrong-root') graph.bumps[0] = bad
  else {
    const proven = graph.txs.find(tx => tx.bumpIndex === 0)!, ctor: any = proven.constructor
    graph.bumps.push(bad); graph.txs.unshift(new ctor(proven.rawTx!, graph.bumps.length - 1))
  }
  const writer = new Utils.Writer(); graph.toWriter(writer)
  return [...bytes.slice(0, 36), ...writer.toArray()]
}
/** Deterministic public-call program. The independent verifier replays call
 * construction but derives predicates from transaction bytes and inventory. */
export async function transactionCoverageProgram(execute: TransactionCoverageExecute, identity: string) {
  const calls = new Map<string, Call>(), skipped: Array<{ id: string; dependency: string }> = []
  const call = async (id: string, method: string, args: any, actor: 'wallet' | 'funder' = 'wallet') => { const row = await execute(id, actor, method, args); calls.set(id, row); return row }
  const result = (id: string) => { const row = calls.get(id); if (!row?.result) throw new Missing(id); return row.result }
  const transaction = (id: string) => { const value = result(id); try { const tx = coverageAtomic(value.tx); if (tx.id('hex') !== value.txid) throw Error(); return tx } catch { throw new Missing(id) } }
  const reference = (id: string) => { const ref = result(id)?.signableTransaction?.reference; if (typeof ref !== 'string') throw new Missing(id); return ref }
  const section = async (id: string, body: () => Promise<void>) => { try { await body() } catch (error) { if (!(error instanceof Missing)) throw error; skipped.push({ id, dependency: error.dependency }) } }
  const output = (amount = 7) => ({ satoshis: amount, lockingScript: '51', outputDescription: 'TPNIL transaction extension result' })
  const options = { randomizeOutputs: false, acceptDelayedBroadcast: false }
  const create = (id: string, extra: any = {}) => ({ description: `TPNIL transaction extension ${id}`, labels: [tc.label], outputs: [output()], options, ...extra })
  const snapshot = async (id: string) => {
    await call(`${id}-basket`, 'listOutputs', { basket: tc.basket, include: 'locking scripts', includeTags: true, includeCustomInstructions: true, limit: 1000 })
    await call(`${id}-actions`, 'listActions', { labels: [tc.label], includeOutputs: true, includeOutputLockingScripts: true, limit: 1000 })
  }
  const cleanup = async (id: string, actor: 'wallet' | 'funder' = 'wallet') => { const ref = calls.get(id)?.result?.signableTransaction?.reference; if (typeof ref === 'string') await call(`${id}-cleanup`, 'abortAction', { reference: ref }, actor) }
  await call('funder-identity', 'getPublicKey', { identityKey: true }, 'funder')
  const sender = new ProtoWallet(PrivateKey.fromHex(tc.funderKey)), senderIdentityKey = (await sender.getPublicKey({ identityKey: true })).publicKey
  const key = await sender.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${tc.prefix} ${tc.suffix}`, counterparty: identity })
  const paymentScript = new P2PKH().lock(PublicKey.fromString(key.publicKey).toAddress()).toHex()
  const remittance = { derivationPrefix: tc.prefix, derivationSuffix: tc.suffix, senderIdentityKey }
  const payment = (outputIndex: number) => ({ outputIndex, protocol: 'wallet payment', paymentRemittance: remittance })
  const insertion = (outputIndex: number) => ({ outputIndex, protocol: 'basket insertion', insertionRemittance: { basket: tc.basket, tags: [`extension ${outputIndex}`], customInstructions: `extension:${outputIndex}` } })
  await call('incoming-fixture', 'createAction', create('incoming fixture', { outputs: Array.from({ length: 10 }, (_, i) => ({ satoshis: i < 2 ? 1000 : i === 8 ? tc.sourceSatoshis : 7, lockingScript: i < 2 ? paymentScript : tc.sourceScript, outputDescription: `TPNIL extension incoming ${i}` })) }), 'funder')
  await section('internalization', async () => {
    const tx = transaction('incoming-fixture'), bytes = result('incoming-fixture').tx
    const internal = (id: string, outputs: any[]) => ({ tx: bytes, outputs, description: `TPNIL extension ${id}`, labels: [tc.label] })
    await snapshot('internal-before')
    await call('payment', 'internalizeAction', internal('payment', [payment(0)])); await snapshot('payment-after')
    await call('insertion', 'internalizeAction', internal('insertion', [insertion(2)])); await snapshot('insertion-after')
    await call('both', 'internalizeAction', internal('both', [payment(1), insertion(3)])); await snapshot('both-after')
    const invalids: Array<[string, any[]]> = [
      ['missing-payment', [{ outputIndex: 0, protocol: 'wallet payment' }]],
      ['missing-insertion', [{ outputIndex: 4, protocol: 'basket insertion' }]],
      ['wrong-derivation', [{ ...payment(0), paymentRemittance: { ...remittance, derivationSuffix: Buffer.from('wrong suffix').toString('base64') } }]],
      ['wrong-prefix', [{ ...payment(0), paymentRemittance: { ...remittance, derivationPrefix: Buffer.from('wrong prefix').toString('base64') } }]],
      ['wrong-sender', [{ ...payment(0), paymentRemittance: { ...remittance, senderIdentityKey: PrivateKey.fromHex('71'.repeat(32)).toPublicKey().toString() } }]],
      ['index-range', [insertion(tx.outputs.length)]]
    ]
    for (const [id, outputs] of invalids) { await snapshot(`${id}-before`); await call(id, 'internalizeAction', internal(id, outputs)); await snapshot(`${id}-after`) }
    await call('relinquish', 'relinquishOutput', { basket: tc.basket, output: `${tx.id('hex')}.2` }); await snapshot('relinquish-after')
  })
  await call('fanout', 'createAction', create('fanout', { outputs: Array.from({ length: tc.sourceCount }, (_, i) => ({ satoshis: tc.sourceSatoshis, lockingScript: tc.sourceScript, basket: tc.sources, outputDescription: `TPNIL extension source ${i}`, tags: [`extension source ${i}`] })) }))
  const explicit = (id: string, index: number, pending = false, opts: any = {}) => {
    const source = transaction('fanout')
    return create(id, { inputBEEF: result('fanout').tx, inputs: [{ outpoint: `${source.id('hex')}.${index}`, inputDescription: `TPNIL extension source ${index}`, ...(pending ? { unlockingScriptLength: 1 } : { unlockingScript: '51' }) }], options: { ...options, ...opts } })
  }
  await section('defaults', async () => {
    for (const [i, name] of ['omitted', 'true'].entries()) {
      const args = explicit(`default-create-${name}`, i, false); delete args.options.acceptDelayedBroadcast; if (name === 'true') args.options.acceptDelayedBroadcast = true
      await call(`default-create-${name}`, 'createAction', args)
      const staged = explicit(`default-stage-${name}`, 2 + i, true); delete staged.options.acceptDelayedBroadcast
      await call(`default-stage-${name}`, 'createAction', staged)
      await section(`default-sign-${name}`, async () => { await call(`default-sign-${name}`, 'signAction', { reference: reference(`default-stage-${name}`), spends: { 0: { unlockingScript: '51' } }, ...(name === 'true' ? { options: { acceptDelayedBroadcast: true } } : {}) }) })
    }
  })
  await section('foreign', async () => {
    const incoming = transaction('incoming-fixture')
    await call('foreign-stage', 'createAction', create('foreign stage', { inputBEEF: result('incoming-fixture').tx, inputs: [{ outpoint: `${incoming.id('hex')}.9`, inputDescription: 'TPNIL foreign controlled source', unlockingScriptLength: 1 }], outputs: [output(1)], options: { ...options, signAndProcess: false } }), 'funder')
    const ref = reference('foreign-stage')
    await call('foreign-sign', 'signAction', { reference: ref, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } })
    await call('foreign-abort', 'abortAction', { reference: ref })
    await call('foreign-owner-sign', 'signAction', { reference: ref, spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false } }, 'funder')
  })
  // Fixed, independently funded100-satoshi sources keep held change above dust,
  // regardless of which small change earlier batch operations release.
  // Each held parent exposes a genuine managed change outpoint. The next calls
  // carry those exact public outpoints; no storage-side outpoint substitution.
  await call('held-a', 'createAction', explicit('held a', 5, false, { noSend: true }))
  await call('held-b', 'createAction', explicit('held b', 6, false, { noSend: true }))
  await section('foreign-held', async () => { await call('foreign-held', 'createAction', create('foreign held', { inputBEEF: result('incoming-fixture').tx, inputs: [{ outpoint: `${transaction('incoming-fixture').id('hex')}.8`, inputDescription: 'TPNIL foreign held change source', unlockingScript: '51' }], options: { ...options, noSend: true } }), 'funder') })
  const changes = (id: string): string[] => { const values = result(id).noSendChange; if (!Array.isArray(values) || values.length < 1 || !values.every(v => typeof v === 'string')) throw new Missing(id); return values }
  await section('held-chain', async () => {
    await call('held-child', 'createAction', create('held child', { options: { ...options, noSend: true, noSendChange: [changes('held-a')[0]] } }))
    await call('held-release', 'createAction', create('held release', { outputs: [], options: { ...options, sendWith: [result('held-a').txid, result('held-child').txid] } }))
  })
  await section('sign-batch', async () => {
    await call('batch-stage', 'createAction', explicit('batch stage', 4, true))
    await call('batch-sign', 'signAction', { reference: reference('batch-stage'), spends: { 0: { unlockingScript: '51' } }, options: { acceptDelayedBroadcast: false, sendWith: [result('held-b').txid] } })
  })
  await call('held-unknown-control', 'createAction', explicit('unknown control', 8, false, { noSend: true }))
  await section('unknown-batch', async () => {
    await call('unknown-batch', 'createAction', create('unknown batch', { outputs: [], options: { ...options, sendWith: [result('held-unknown-control').txid, 'a9'.repeat(32)] } }))
    await call('unknown-batch-control', 'createAction', create('unknown valid batch', { outputs: [], options: { ...options, sendWith: [result('held-unknown-control').txid] } }))
  })
  await section('change-negatives', async () => {
    const invalids: Array<[string, string, boolean]> = [
      ['change-foreign', changes('foreign-held')[0]!, true], ['change-spent', changes('held-a')[0]!, true],
      ['change-range', `${result('held-b').txid}.${transaction('held-b').outputs.length}`, true], ['change-no-send-false', changes('foreign-held')[0]!, false]
    ]
    // The noSend=false case needs a *native-owned* valid, unconsumed held output.
    await call('held-inactive', 'createAction', explicit('held inactive', 7, false, { noSend: true }))
    invalids[3]![1] = changes('held-inactive')[0]!
    for (const [id, outpoint, noSend] of invalids) { await snapshot(`${id}-before`); await cleanup((await call(id, 'createAction', create(id, { options: { ...options, noSend, noSendChange: [outpoint] } }))).id); await snapshot(`${id}-after`) }
    await call('held-inactive-release', 'createAction', create('inactive release', { outputs: [], options: { ...options, sendWith: [result('held-inactive').txid] } }))
    await call('foreign-held-release', 'createAction', create('foreign release', { outputs: [], options: { ...options, sendWith: [result('foreign-held').txid] } }), 'funder')
  })
  await call('proof-parent', 'createAction', create('proof parent', { outputs: [0, 1, 2, 3].map(i => ({ satoshis: 100, lockingScript: tc.sourceScript, outputDescription: `TPNIL extension proof ${i}` })) }), 'funder')
  await section('proof', async () => {
    const parent = transaction('proof-parent')
    const duplicateBridge = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: 3, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 90, lockingScript: LockingScript.fromHex(tc.sourceScript) }], 0)
    const duplicateChild = new Transaction(1, [{ sourceTransaction: duplicateBridge, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 80, lockingScript: LockingScript.fromHex(tc.sourceScript) }], 0)
    const duplicateValid = coverageProofVariant(duplicateChild.toAtomicBEEF(), 'duplicate-valid', [])
    await call('proof-duplicate-create-control', 'createAction', create('duplicate valid control', { inputBEEF: duplicateValid, inputs: [{ outpoint: `${duplicateChild.id('hex')}.0`, inputDescription: 'TPNIL non-conflicting duplicate proof control', unlockingScriptLength: 1 }], options: { ...options, signAndProcess: false } }))
    await cleanup('proof-duplicate-create-control')
    await call('proof-duplicate-control', 'internalizeAction', { tx: duplicateValid, outputs: [insertion(0)], description: 'TPNIL identical duplicate proof control', labels: [tc.label] })
    for (const [index, mode] of (['unknown', 'conflicting', 'wrong-root'] as const).entries()) {
      const bridge = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: index, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 90, lockingScript: LockingScript.fromHex(tc.sourceScript) }], 0)
      const child = new Transaction(1, [{ sourceTransaction: bridge, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 80, lockingScript: LockingScript.fromHex(tc.sourceScript) }], 0)
      const bytes = child.toAtomicBEEF(), invalid = coverageProofVariant(bytes, mode, result('fanout').tx)
      await snapshot(`proof-${mode}-before`)
      const args = create(`proof ${mode}`, { inputBEEF: mode === 'unknown' ? coverageProofVariant(bytes, mode, result('fanout').tx, true) : invalid, inputs: [{ outpoint: `${child.id('hex')}.0`, inputDescription: 'TPNIL extension untrusted proof', unlockingScript: '51' }], options: { ...options, trustSelf: 'known', knownTxids: [result('fanout').txid] } })
      await cleanup((await call(`proof-${mode}-create`, 'createAction', args)).id)
      await call(`proof-${mode}-internalize`, 'internalizeAction', { tx: invalid, outputs: [insertion(0)], description: `TPNIL extension proof ${mode}`, labels: [tc.label] })
      await snapshot(`proof-${mode}-after`)
      await call(`proof-${mode}-control`, 'internalizeAction', { tx: bytes, outputs: [insertion(0)], description: `TPNIL extension proof control ${mode}`, labels: [tc.label] })
      await call(`proof-${mode}-create-control`, 'createAction', create(`proof ${mode} valid control`, { inputBEEF: bytes, inputs: [{ outpoint: `${child.id('hex')}.0`, inputDescription: 'TPNIL extension valid proof control', unlockingScriptLength: 1 }], options: { ...options, signAndProcess: false } }))
      await cleanup(`proof-${mode}-create-control`)
    }
  })
  await call('sources-after', 'listOutputs', { basket: tc.sources, include: 'locking scripts', includeTags: true, limit: 100 })
  return { skipped, calls, paymentScript, remittance }
}
