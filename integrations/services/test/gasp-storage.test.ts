import test from 'node:test'
import assert from 'node:assert/strict'
import { Transaction, LockingScript, UnlockingScript } from '@bsv/sdk'
import { LabOverlayGASPStorage, uniqueHistoricalTransactions } from '../src/gasp-storage.js'

test('outpoint-node duplication is removed while genuine conflicting transactions remain rejected', async () => {
  const source = new Transaction(1, [], [{ satoshis: 10, lockingScript: LockingScript.fromASM('OP_TRUE') }], 0)
  const spend = (amount: number) => new Transaction(1, [{ sourceTransaction: source, sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromASM('') }], [{ satoshis: amount, lockingScript: LockingScript.fromASM('OP_TRUE') }], 0)
  const a = spend(9), conflict = spend(8)
  const ordered = uniqueHistoricalTransactions([source.toBEEF(), a.toBEEF(), a.toBEEF(), conflict.toBEEF()])
  assert.deepEqual(ordered.map(beef => Transaction.fromBEEF(beef).id('hex')), [source.id('hex'), a.id('hex'), conflict.id('hex')])
  const storage: any = new LabOverlayGASPStorage('tm_test', { managers: { tm_test: { identifyAdmissibleOutputs: async () => ({ outputsToAdmit: [0], coinsToRetain: [] }) } } } as any)
  const coins = new Set(), spent = new Set()
  await storage.admitHistoricalBEEF(ordered[0], coins, spent)
  await storage.admitHistoricalBEEF(ordered[1], coins, spent)
  await assert.rejects(storage.admitHistoricalBEEF(ordered[2], coins, spent), /conflicting spend/)
})
