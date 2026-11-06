import { describe, expect, it } from 'vitest'
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk'
import { canonicalSyncChunk, goSyncChunk } from '../src/storage-sync/compatibility.js'
import { projectDataset, type Dataset } from '../src/storage-sync/projection.js'

function fixture(offset = 0): Dataset {
  const tx = new Transaction(1, [], [{ satoshis: 7, lockingScript: new P2PKH().lock(PrivateKey.fromHex('11'.repeat(32)).toPublicKey().toAddress()) }], 0)
  return {
    user: { userId: offset + 1, identityKey: 'fixture-user' },
    transactions: [{ transactionId: offset + 2, userId: offset + 1, txid: tx.id('hex'), rawTx: tx.toBinary(), reference: 'fixture', status: 'completed' }],
    outputBaskets: [{ basketId: offset + 3, userId: offset + 1, name: 'tasks', numberOfDesiredUTXOs: 0, minimumDesiredUTXOValue: 0 }],
    outputs: [{ outputId: offset + 4, userId: offset + 1, transactionId: offset + 2, txid: tx.id('hex'), vout: 0, basketId: offset + 3, satoshis: 7, spendable: true, providedBy: 'you' }],
    outputTags: [{ outputTagId: offset + 5, userId: offset + 1, tag: 'encrypted' }],
    outputTagMaps: [{ outputId: offset + 4, outputTagId: offset + 5, isDeleted: false }]
  }
}

describe('independent storage logical oracle (LAB_SELF_TEST_ONLY fixtures)', () => {
  it('canonicalizes surrogate keys while preserving all relationship meaning', () => {
    expect(projectDataset(fixture(10))).toEqual(projectDataset(fixture(200)))
  })
  it('rejects dangling relationships, duplicate logical entities and missing bytes', () => {
    const dangling = fixture(); dangling.outputs![0]!.basketId = 999
    expect(() => projectDataset(dangling)).toThrow(/Dangling/)
    const duplicate = fixture(); duplicate.outputs!.push({ ...duplicate.outputs![0]!, outputId: 999 })
    expect(() => projectDataset(duplicate)).toThrow(/Duplicate/)
    const missing = fixture(); delete missing.transactions![0]!.rawTx
    expect(() => projectDataset(missing)).toThrow(/bytes unavailable/)
  })
  it('detects metadata loss even if spendable output counts stay identical', () => {
    const damaged = fixture(); damaged.outputs![0]!.providedBy = ''
    expect(projectDataset(damaged)).not.toEqual(projectDataset(fixture()))
    const altered = fixture(); altered.outputBaskets![0]!.numberOfDesiredUTXOs = 32
    expect(projectDataset(altered)).not.toEqual(projectDataset(fixture()))
  })
  it('reconstructs shared raw bytes but rejects contradictory stored bytes and script offsets', () => {
    const shared = fixture(); const row = shared.transactions![0]!
    shared.provenTxs = [{ provenTxId: 99, txid: row.txid, rawTx: row.rawTx }]
    delete row.rawTx
    expect(projectDataset(shared).transactions).toEqual(projectDataset(fixture()).transactions)
    const corrupt = fixture(); (corrupt.transactions![0]!.rawTx as number[])[0] = 9
    expect(() => projectDataset(corrupt)).toThrow(/hash differs/)
    const wrongOffset = fixture(); wrongOffset.outputs![0]!.scriptOffset = 1
    expect(() => projectDataset(wrongOffset)).toThrow(/Incorrect scriptOffset/)
  })
  it('resolves notification recipients as logical transactions, not matching integer IDs', () => {
    const a = fixture(10), b = fixture(100)
    a.provenTxReqs = [{ provenTxReqId: 20, txid: 'notification', notify: '{"transactionIds":[12]}' }]
    b.provenTxReqs = [{ provenTxReqId: 200, txid: 'notification', notify: '{"transactionIds":[102]}' }]
    expect(projectDataset(a)).toEqual(projectDataset(b))
    b.provenTxReqs[0]!.notify = '{"transactionIds":[12]}'
    expect(() => projectDataset(b)).toThrow(/Dangling/)
  })
})

describe('pinned TS2.13 / Go0.191.4 wire representation adapter', () => {
  it('preserves source input and logical proof relationships in both directions', () => {
    const raw = { transactions: [{ proveTxId: 7, isOutgoing: false }], provenTxReqs: [{ wasBroadcast: 1 }] }
    const canonical = canonicalSyncChunk(raw, 'go')
    expect(canonical).toEqual({ transactions: [{ provenTxId: 7, isOutgoing: false }], provenTxReqs: [{ wasBroadcast: true }] })
    expect(raw.transactions[0]).toHaveProperty('proveTxId', 7)
    expect(goSyncChunk(canonical)).toEqual({ transactions: [{ proveTxId: 7, isOutgoing: false }], provenTxReqs: [{ wasBroadcast: true }] })
  })
  it('rejects ambiguous keys and invalid boolean encodings', () => {
    expect(() => canonicalSyncChunk({ transactions: [{ provenTxId: 1, proveTxId: 2 }] }, 'go')).toThrow(/Ambiguous/)
    expect(() => canonicalSyncChunk({ provenTxReqs: [{ wasBroadcast: 2 }] }, 'typescript')).toThrow(/Invalid boolean/)
  })
})
