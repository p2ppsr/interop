import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { verifyNativeSynthesis } from '../../../synthesis/src/wallet-lab/native/verify-synthesis.js'
const retained = path.resolve(import.meta.dirname, '../../../journals/services-integration/2026-11-06/go-joined-02/synthesis')
test('joined real Go storage result verifies signed receipts, transactions, content and overlay evidence offline', async () => {
  const result = await verifyNativeSynthesis(retained)
  assert.equal(result.outcome, 'PASS'); assert.equal(result.transactions, 4); assert.equal(result.receipts, 2)
})
for (const scenario of ['receipt', 'plaintext', 'replica', 'recipient'] as const) test(`forged ${scenario} cannot retain a successful native-synthesis result`, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tpnil-native-synthesis-mutation-'))
  try {
    await fs.cp(retained, directory, { recursive: true })
    const file = path.join(directory, scenario === 'replica' ? 'events.json' : 'lch.json'), value = JSON.parse(await fs.readFile(file, 'utf8'))
    if (scenario === 'receipt') value.receipts[0][value.receipts[0].length - 1] ^= 1
    if (scenario === 'plaintext') value.plaintext[0] ^= 1
    if (scenario === 'replica') value.find((entry: any) => entry.boardReplicaLookup).boardReplicaLookup.outputs = []
    if (scenario === 'recipient') value.payeeOutputs[0][0].satoshis = 4
    await fs.writeFile(file, JSON.stringify(value))
    await assert.rejects(verifyNativeSynthesis(directory))
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
