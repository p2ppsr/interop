import assert from 'node:assert/strict'
import { Beef, LockingScript, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import type { TransactionCoverageReport } from './coverage-transactions-model.js'
import { tc } from './coverage-transactions-model.js'
import { verifyNativeTransactionCoverage } from './coverage-transactions-verifier.js'

/** Prospective4.5 only. The three fixed control proofs contain deterministic
 * bridge bodies which are not native wallet transaction records. Admit their
 * exact signed ancestry, not arbitrary request bodies or caller-provided BUMPs.
 * The ordinary final-ledger, storage and native funding checks remain required. */
export async function hydrateCoverageControlAncestry(report: TransactionCoverageReport, binding: {
  profile: string; identity: string; fixture: { txid: string; rawHex: string; fundingHeight: number; maturityDepth: number; merkleRoot: string }
  storageTransactions: ReadonlyMap<string, Transaction>; resolvedTransactions: Map<string, Transaction>
}) {
  assert.equal(binding.profile, 'ITCVE-1@4.5.0', 'Constructed control ancestry requires the explicit prospective profile')
  assert.equal(report.identity, binding.identity)
  const child = await verifyNativeTransactionCoverage(report)
  const one = (id: string) => { const rows = report.trace.filter(row => row.id === id); assert.ok(rows.length <= 1); return rows[0] }
  const atomic = (bytes: unknown) => {
    assert.ok(Array.isArray(bytes) && bytes.length > 0)
    for (let i = 0; i < bytes.length; i++) assert.ok(Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255)
    const reader = new Utils.Reader(bytes), graph = Beef.fromReader(reader)
    assert.ok(reader.eof() && reader.pos === bytes.length, 'Control proof must be exactly framed')
    assert.equal(new Set(graph.txs.map(tx => tx.txid)).size, graph.txs.length)
    const tx = Transaction.fromAtomicBEEF(bytes); assert.equal(tx.id('hex'), graph.atomicTxid)
    return { graph, tx }
  }
  const unavailable: string[] = []
  const receipt = (admitted: Array<{ callId: string; txid: string; bridge: string; controlledParent: string }>) => ({ schema: 'tpnil-coverage-control-ancestry@1.0.0', verified: true as const, profile: binding.profile, admitted, unavailable, retainedChildFindings: child.counts, newNativeQualification: false })
  const parentCall = one('proof-parent')
  if (!parentCall || parentCall.error !== undefined || !parentCall.result?.tx) { unavailable.push('proof-parent'); return receipt([]) }
  assert.equal(parentCall.actor, 'funder'); assert.equal(parentCall.method, 'createAction')
  const parent = atomic(parentCall.result?.tx).tx; assert.equal(parent.id('hex'), parentCall.result?.txid)
  assert.equal(binding.storageTransactions.get(parent.id('hex'))?.toHex(), parent.toHex(), 'Controlled public parent must match independently captured storage')
  const tracker = { currentHeight: async () => binding.fixture.fundingHeight + binding.fixture.maturityDepth,
    isValidRootForHeight: async (root: string, height: number) => root === binding.fixture.merkleRoot && height === binding.fixture.fundingHeight }
  const staged = new Map<string, Transaction>(), admitted = []
  const retain = (tx: Transaction, depth = 0) => {
    assert.ok(depth < 32)
    const txid = tx.id('hex'), old = staged.get(txid) ?? binding.resolvedTransactions.get(txid)
    if (old) assert.equal(old.toHex(), tx.toHex(), 'Control ancestor differs from independently retained bytes')
    if (staged.has(txid)) return
    staged.set(txid, tx)
    for (const input of tx.inputs) if (input.sourceTransaction) retain(input.sourceTransaction, depth + 1)
  }
  for (const [index, mode] of ['unknown', 'conflicting', 'wrong-root'].entries()) {
    const row = one(`proof-${mode}-control`)
    // A rejected/missing positive control retains its independently scored
    // finding. It supplies no new graph admission; all final-ledger guards run.
    if (!row || row.error !== undefined || row.result?.accepted !== true) { unavailable.push(`proof-${mode}-control`); continue }
    assert.equal(row.actor, 'wallet'); assert.equal(row.method, 'internalizeAction')
    const { tx, graph } = atomic(row.args.tx)
    const bridge = new Transaction(1, [{ sourceTransaction: parent, sourceOutputIndex: index, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 90, lockingScript: LockingScript.fromHex(tc.sourceScript) }], 0)
    const expected = new Transaction(1, [{ sourceTransaction: bridge, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromHex('51'), sequence: 0xffffffff }], [{ satoshis: 80, lockingScript: LockingScript.fromHex(tc.sourceScript) }], 0)
    assert.equal(tx.toHex(), expected.toHex(), 'Control must be the exact fixed-program child of its declared funder output')
    assert.equal(tx.inputs[0]?.sourceTransaction?.toHex(), bridge.toHex())
    assert.equal(binding.storageTransactions.get(tx.id('hex'))?.toHex(), tx.toHex(), 'Control target must match independently captured storage')
    assert.equal(graph.findTxid(binding.fixture.txid)?.tx?.toHex(), binding.fixture.rawHex)
    assert.ok(await graph.verify(tracker, false), 'Every control BUMP must verify against the admitted mined root')
    assert.ok(await tx.verify(tracker), 'Control scripts and complete ancestry must verify')
    retain(tx); admitted.push({ callId: row.id, txid: tx.id('hex'), bridge: bridge.id('hex'), controlledParent: parent.id('hex') })
  }
  // Commit only after every graph and overlapping body passes. Preserve richer
  // independently retained transaction objects and fill missing source links.
  for (const [txid, tx] of staged) if (!binding.resolvedTransactions.has(txid)) binding.resolvedTransactions.set(txid, tx)
  for (const tx of binding.resolvedTransactions.values()) for (const input of tx.inputs) if (!input.sourceTransaction) input.sourceTransaction = binding.resolvedTransactions.get(input.sourceTXID!)
  return receipt(admitted)
}
