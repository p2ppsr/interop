import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import { readCommittedBlob, maximumCommittedBlobBytes } from '../scripts/read-committed-blob.mjs'
import { checkNativeWalletSelector } from '../scripts/check-native-wallet-selector.mjs'
import { selectNativeWalletProfile } from '../scripts/native-wallet-profiles.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-blob-test-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']}).toString().trim()
  git('init', '-q')
  const bytes = Buffer.alloc(3_181_608)
  for(let i=0;i<bytes.length;i++) bytes[i] = (i * 31 + 17) % 256
  fs.mkdirSync(path.join(root, 'fixture'))
  fs.writeFileSync(path.join(root, 'fixture/large.bin'), bytes)
  fs.writeFileSync(path.join(root, 'fixture/empty'), '')
  const planPath = selectNativeWalletProfile(undefined).planPath
  fs.mkdirSync(path.dirname(path.join(root, planPath)), {recursive: true})
  fs.writeFileSync(path.join(root, planPath), JSON.stringify({conformanceInputs:{'fixture/large.bin':sha(bytes)}}))
  git('add', '.')
  git('-c', 'user.name=TPNIL fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Exact source fixture')
  return {root, bytes, git, source:git('rev-parse', 'HEAD')}
}

test('actual Git blob above the old stdout limit is exact, including binary NUL bytes', t => {
  const f=fixture(t)
  assert.throws(()=>execFileSync('git',['show',`${f.source}:fixture/large.bin`],{cwd:f.root,stdio:['ignore','pipe','pipe']}), error=>error.code==='ENOBUFS')
  assert.deepEqual(readCommittedBlob(f.root,f.source,'fixture/large.bin'),f.bytes)
  assert.deepEqual(readCommittedBlob(f.root,f.source,'fixture/empty'),Buffer.alloc(0))
  assert.deepEqual(readCommittedBlob(f.root,f.source,'fixture/empty',{maxBytes:0}),Buffer.alloc(0))
  fs.writeFileSync(path.join(f.root,'fixture/large.bin'),'uncommitted replacement')
  assert.deepEqual(readCommittedBlob(f.root,f.source,'fixture/large.bin'),f.bytes)
})

test('selector still rejects current and committed byte tampering with a large input', async t => {
  const f=fixture(t), read=name=>fs.readFileSync(path.join(f.root,name)), readCommitted=(source,name)=>readCommittedBlob(f.root,source,name)
  const result=await checkNativeWalletSelector('all-go-native',{source:f.source,read,readCommitted})
  assert.equal(result.verifiedSource,true)
  const changed=Buffer.from(f.bytes);changed[changed.length-1]^=1
  fs.writeFileSync(path.join(f.root,'fixture/large.bin'),changed)
  await assert.rejects(checkNativeWalletSelector('all-go-native',{source:f.source,read,readCommitted}),/Current conformance input differs/)
  f.git('add','fixture/large.bin');f.git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Changed bytes')
  const changedSource=f.git('rev-parse','HEAD')
  fs.writeFileSync(path.join(f.root,'fixture/large.bin'),f.bytes)
  await assert.rejects(checkNativeWalletSelector('all-go-native',{source:changedSource,read,readCommitted}),/Conformance input differs at execution/)
})

test('bounded metadata rejects oversize, missing and non-blob source before reading payload', t => {
  const f=fixture(t)
  assert.throws(()=>readCommittedBlob(f.root,f.source,'fixture/large.bin',{maxBytes:f.bytes.length-1}),/byte bound/)
  assert.throws(()=>readCommittedBlob(f.root,f.source,'fixture/large.bin',{maxBytes:maximumCommittedBlobBytes+1}),/Invalid committed blob byte bound/)
  assert.throws(()=>readCommittedBlob(f.root,f.source,'missing'),/exactly one blob/)
  assert.throws(()=>readCommittedBlob(f.root,f.source,'fixture'),/exactly one blob/)
  for(const file of ['/absolute','../escape','fixture/../large.bin','fixture\nextra','fixture\\large.bin','fixture//large.bin']) assert.throws(()=>readCommittedBlob(f.root,f.source,file),/Unsafe committed source path/)
  assert.throws(()=>readCommittedBlob(f.root,'HEAD','fixture/empty'),/exact object ID/)
  assert.throws(()=>readCommittedBlob(f.root,f.git('rev-parse',`${f.source}:fixture`),'empty'),/Source object must be the exact commit/)
})

test('same-size corrupted Git object is rejected by its pinned object identity and cleans temporary output', t => {
  const f=fixture(t), oid=f.git('rev-parse',`${f.source}:fixture/large.bin`)
  const object=path.join(f.root,'.git/objects',oid.slice(0,2),oid.slice(2)), original=fs.readFileSync(object)
  const changed=Buffer.from(f.bytes);changed[99]^=1
  fs.chmodSync(object,0o600)
  fs.writeFileSync(object,deflateSync(Buffer.concat([Buffer.from(`blob ${changed.length}\0`),changed])))
  const before=fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('tpnil-committed-blob-')).sort()
  assert.throws(()=>readCommittedBlob(f.root,f.source,'fixture/large.bin'),/differ from their Git object identity/)
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('tpnil-committed-blob-')).sort(),before)
  fs.writeFileSync(object,original)
  assert.deepEqual(readCommittedBlob(f.root,f.source,'fixture/large.bin'),f.bytes)
})

test('Git replace refs cannot substitute a different committed blob', t => {
  const f=fixture(t), oid=f.git('rev-parse',`${f.source}:fixture/large.bin`), empty=f.git('rev-parse',`${f.source}:fixture/empty`)
  f.git('replace',oid,empty)
  assert.deepEqual(readCommittedBlob(f.root,f.source,'fixture/large.bin'),f.bytes)
})
