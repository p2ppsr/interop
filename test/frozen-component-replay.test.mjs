import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { prepareFrozenComponentReplay, requireVerifierReceipt } from '../scripts/frozen-component-replay.mjs'
test('component3 frozen replay survives current source drift but rejects dependency drift and Git links',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-frozen-replay-test-')),root=path.join(temporary,'repository')
 fs.mkdirSync(root);const write=(name,value)=>{const f=path.join(root,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,value)}
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'})
 try{
  for(const directory of ['infra','fixtures','itcves','programs'])write(`${directory}/.keep`,'fixture')
  write('.github/workflows/native.yml','name: frozen-native-policy\n');write('.nvmrc',process.versions.node+'\n');write('scripts/oracle.mjs','export const marker="frozen"\n');write('package.json','{}')
  write('scripts/guarded.mjs','if(process.argv[1]===import.meta.filename)console.log(JSON.stringify({verified:true,marker:"executed"}))\n')
  for(const dir of ['synthesis','integrations/services','components/transport']){write(`${dir}/package-lock.json`,'{"lockfileVersion":3}');fs.mkdirSync(path.join(root,dir,'node_modules'))}
  write('components/rust/Cargo.lock','# pinned\n');fs.mkdirSync(path.join(root,'out'));fs.mkdirSync(path.join(root,'components/rust/target'))
  git('init','-q');git('add','.');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Frozen fixture')
  const revision=git('rev-parse','HEAD').trim();write('scripts/oracle.mjs','throw new Error("current drift")\n')
  const alias=path.join(temporary,'alias');fs.symlinkSync(fs.realpathSync(temporary),alias,'dir')
  const copy=path.join(alias,'frozen');const result=prepareFrozenComponentReplay(root,revision,copy)
  assert.equal(result.root,fs.realpathSync(copy),'CLI entry points must use canonical paths even through an alias')
  const execution=spawnSync(process.execPath,[path.join(result.root,'scripts/guarded.mjs')],{encoding:'utf8'})
  assert.equal(execution.status,0);assert.deepEqual(requireVerifierReceipt(execution.stdout),{verified:true,marker:'executed'})
  assert.equal(fs.readFileSync(path.join(copy,'.github/workflows/native.yml'),'utf8'),'name: frozen-native-policy\n');assert.equal(fs.readFileSync(path.join(copy,'scripts/oracle.mjs'),'utf8'),'export const marker="frozen"\n');assert.equal(result.source,revision);assert.ok(result.reused.includes('synthesis/node_modules'))
  fs.rmSync(copy,{recursive:true});assert.ok(fs.existsSync(path.join(root,'out')),'Removing replay cannot remove original cache')
  write('synthesis/package-lock.json','{"lockfileVersion":2}');assert.throws(()=>prepareFrozenComponentReplay(root,revision,path.join(temporary,'bad-lock')),/frozen dependencies/)
  write('synthesis/package-lock.json','{"lockfileVersion":3}');fs.symlinkSync('/outside',path.join(root,'scripts/link'));git('add','scripts/link');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Unsupported link')
  assert.throws(()=>prepareFrozenComponentReplay(root,git('rev-parse','HEAD').trim(),path.join(temporary,'bad-link')),/Git symlinks/)
 }finally{fs.rmSync(temporary,{recursive:true,force:true})}
})

test('verification requires a complete final receipt, not a zero exit or diagnostic output',()=>{
 const noop=spawnSync(process.execPath,['-e',''],{encoding:'utf8'});assert.equal(noop.status,0)
 for(const output of [noop.stdout,'diagnostic only\n','{"verified":false}\n','{"verified":true}\ntrailing diagnostics\n','{"verified":true','{"unfinished":\n  {"verified":true}\n'])assert.throws(()=>requireVerifierReceipt(output))
 assert.deepEqual(requireVerifierReceipt('dotenv: loaded\n'+JSON.stringify({verified:true,assertions:48},null,2)+'\n'),{verified:true,assertions:48})
 const expected={schema:'tpnil-native-integrated-qualification@2',source:'frozen',qualifiedEnvironment:true}
 assert.throws(()=>requireVerifierReceipt('{"verified":true,"qualifiedEnvironment":true}\n',expected),/schema/)
 assert.throws(()=>requireVerifierReceipt(JSON.stringify({...expected,source:'changed'}),expected),/source/)
 assert.deepEqual(requireVerifierReceipt('{"verified":true}\n'+JSON.stringify(expected)+'\n',expected),expected)
 assert.throws(()=>requireVerifierReceipt('{"verified":true,"assertions":47,"parentInputsBound":4,"independentReplay":true,"outcome":"FAIL"}',{verified:true,assertions:48,parentInputsBound:4,independentReplay:true,outcome:'FAIL'}),/assertions/)
})

test('replays a Git archive larger than128MiB and rejects archive attribute transformations', {timeout:60000},()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-large-replay-test-')),root=path.join(temporary,'repository')
 fs.mkdirSync(root)
 const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value)}
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000})
 try {
  write('.nvmrc',process.versions.node+'\n');write('package.json','{}');write('scripts/marker.mjs','export const source="$Format:%H$"\n')
  for(const name of ['synthesis','integrations/services','components/transport']){write(`${name}/package-lock.json`,'{"lockfileVersion":3}');fs.mkdirSync(path.join(root,name,'node_modules'))}
  write('components/rust/Cargo.lock','# pinned\n')
  const large=path.join(root,'fixtures/large-owned-fixture.bin');fs.mkdirSync(path.dirname(large))
  const fd=fs.openSync(large,'wx'),chunk=Buffer.alloc(1024*1024,0x5a)
  try {for(let i=0;i<129;i++)fs.writeSync(fd,chunk)} finally {fs.closeSync(fd)}
  git('init','-q');git('add','.');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Large owned self-test fixture')
  const source=git('rev-parse','HEAD').trim(),result=prepareFrozenComponentReplay(root,source,path.join(temporary,'large-copy'))
  assert.equal(fs.statSync(path.join(result.root,'fixtures/large-owned-fixture.bin')).size,129*1024*1024)
  assert.equal(git('hash-object',path.join(result.root,'fixtures/large-owned-fixture.bin')),git('hash-object',large))
  assert.equal(fs.readdirSync(temporary).some(name=>name.startsWith('.tpnil-replay-archive-')),false)
  fs.rmSync(result.root,{recursive:true})
  // Git archive can apply export attributes even when the selected tree only
  // contains regular blobs. Such a transformation is not exact source replay.
  fs.rmSync(large);write('.gitattributes','scripts/marker.mjs export-subst\n')
  git('add','-A');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Counterfactual altered archive bytes')
  assert.throws(()=>prepareFrozenComponentReplay(root,git('rev-parse','HEAD').trim(),path.join(temporary,'transformed')),/Frozen source (size|Git blob) differs/)
  assert.equal(fs.readdirSync(temporary).some(name=>name.startsWith('.tpnil-replay-archive-')),false)
 } finally {fs.rmSync(temporary,{recursive:true,force:true})}
})
