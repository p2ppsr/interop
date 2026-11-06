import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { SQLitePaymentReplayStore } from '../replay-store.mjs'

test('separate processes admit exactly one claim and preserve it after restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-replay-')), filename = path.join(dir, 'claims.sqlite')
  const seed = new SQLitePaymentReplayStore(filename); seed.close()
  try {
    const program = `import {SQLitePaymentReplayStore} from ${JSON.stringify(new URL('../replay-store.mjs', import.meta.url).href)};
      const store=new SQLitePaymentReplayStore(process.argv[1]); console.log(store.claim('a'.repeat(64), Date.now()+60000)); store.close();`
    const results = await Promise.all(Array.from({length: 8}, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', program, filename]); let output = '', error = ''
      child.stdout.on('data', b => output += b); child.stderr.on('data', b => error += b)
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(error)))
    })))
    assert.equal(results.filter(x => x === 'true').length, 1)
    const restarted = new SQLitePaymentReplayStore(filename)
    assert.equal(restarted.claim('a'.repeat(64), Date.now()+60000), false); restarted.close()
  } finally { fs.rmSync(dir, {recursive:true,force:true}) }
})

test('expiry, inclusive boundary, capacity and invalid values fail closed', () => {
  let now = 10
  const store = new SQLitePaymentReplayStore(':memory:', { now: () => now, maxEntries: 1 })
  try {
    assert.equal(store.claim('a'.repeat(64), 11), true)
    now = 11; assert.equal(store.claim('a'.repeat(64), 12), false)
    assert.throws(() => store.claim('b'.repeat(64), 12), /capacity/)
    now = 12; assert.equal(store.claim('b'.repeat(64), 13), true)
    assert.throws(() => store.claim('../x', 15), /transaction/)
    assert.throws(() => store.claim('c'.repeat(64), 1), /lifetime/)
  } finally { store.close() }
})
