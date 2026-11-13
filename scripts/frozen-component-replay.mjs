import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const paths=['package.json','.nvmrc','.github','scripts','synthesis','infra','fixtures','components','integrations','itcves','programs','config','src','bin','adapters','schemas','suts','test','docs']
/** Replay an integration pack against its recorded Git source. The caller owns and
 * removes `directory`; installed dependencies are reused only with exact locks. */
export function prepareFrozenComponentReplay(root,source,directory,{repository=process.env.TPNIL_REPLAY_GIT_ROOT??root}={}) {
  assert.match(source,/^[0-9a-f]{40}$/)
  assert.ok(!fs.existsSync(directory),'Frozen replay requires a new owned directory')
  const tree=execFileSync('git',['ls-tree','-r','-l','-z',source,'--',...paths],{cwd:repository,maxBuffer:32*1024*1024,timeout:30000}).toString().split('\0').filter(Boolean)
  assert.ok(tree.length>0&&tree.length<=100000,'Frozen source is absent or exceeds the file limit')
  const files=new Map(),directories=new Set()
  let paddedBytes=0
  for(const row of tree) {
    const match=/^(100(?:644|755)) blob ([a-f0-9]{40}) +([0-9]+)\t([\s\S]+)$/.exec(row)
    assert.ok(match,'Frozen replay rejects Git symlinks and non-file objects')
    const [,mode,blob,length,name]=match,size=Number(length),parts=name.split('/')
    assert.ok(!path.isAbsolute(name)&&Buffer.byteLength(name)<=4096&&parts.every(part=>part&&part!=='.'&&part!=='..'),'Unsafe frozen source path')
    assert.ok(Number.isSafeInteger(size)&&size>=0&&size<=256*1024*1024,'Frozen source file exceeds the size limit')
    assert.ok(!files.has(name),'Duplicate frozen source path')
    files.set(name,{mode,blob,size});paddedBytes+=Math.ceil(size/512)*512
    for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'))
  }
  // Account for content padding, directory headers and bounded long-name/PAX
  // metadata before allocating disk. The archive itself is checked again below.
  const maximumArchiveBytes=768*1024*1024
  assert.ok(paddedBytes+(files.size+directories.size+1)*8192+10240<=maximumArchiveBytes,'Frozen source archive exceeds the disk budget')
  fs.mkdirSync(directory,{recursive:true})
  // Node canonicalizes import.meta.filename. Legacy CLI guards compare it to
  // argv[1], so every extracted entry point must use the same physical path.
  directory=fs.realpathSync(directory)
  const present=[...new Set([...files.keys()].map(name=>name.split('/')[0]))]
  const scratch=fs.mkdtempSync(path.join(path.dirname(directory),'.tpnil-replay-archive-'))
  try {
    const archive=path.join(scratch,'source.tar')
    // Direct file output avoids Node's128MiB stdout buffer. This is a local
    // replay artifact, removed on both success and failure, not another clone.
    execFileSync('git',['archive','--format=tar',`--output=${archive}`,source,'--',...present],{cwd:repository,timeout:60000,maxBuffer:1024*1024})
    assert.ok(fs.statSync(archive).size<=maximumArchiveBytes,'Frozen source archive exceeds the disk budget')
    const unpack=spawnSync('tar',['-xf',archive,'-C',directory],{timeout:60000,maxBuffer:1024*1024})
    assert.equal(unpack.status,0,String(unpack.error??unpack.stderr))
  } finally { fs.rmSync(scratch,{recursive:true,force:true}) }
  const extracted=[]
  function inspect(current) {
    for(const entry of fs.readdirSync(current,{withFileTypes:true})) {
      const file=path.join(current,entry.name)
      assert.ok(!entry.isSymbolicLink(),'Frozen archive contains a symlink')
      if(entry.isDirectory())inspect(file)
      else {assert.ok(entry.isFile(),'Frozen archive contains a non-file object');extracted.push(path.relative(directory,file))}
    }
  }
  inspect(directory)
  assert.deepEqual(extracted.sort(),[...files.keys()].sort(),'Frozen archive inventory differs from the Git tree')
  const buffer=Buffer.alloc(1024*1024)
  for(const [name,expected] of files) {
    const file=path.join(directory,name),stat=fs.statSync(file)
    assert.equal(stat.size,expected.size,`Frozen source size differs: ${name}`)
    assert.equal(Boolean(stat.mode&0o111),expected.mode==='100755',`Frozen source executable mode differs: ${name}`)
    const digest=createHash('sha1').update(`blob ${expected.size}\0`),fd=fs.openSync(file,'r')
    try {let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,count))}
    finally {fs.closeSync(fd)}
    assert.equal(digest.digest('hex'),expected.blob,`Frozen source Git blob differs: ${name}`)
  }
  const expectedNode=fs.readFileSync(path.join(directory,'.nvmrc'),'utf8').trim().replace(/^v/,'')
  assert.equal(process.versions.node,expectedNode,'Use the recorded Node runtime for integration replay')
  const reused=[]
  for(const dependency of ['synthesis','integrations/services','components/transport']) {
    const lock=`${dependency}/package-lock.json`
    assert.equal(hash(fs.readFileSync(path.join(root,lock))),hash(fs.readFileSync(path.join(directory,lock))),`Install the frozen dependencies before replay: ${lock}`)
    const modules=path.join(root,dependency,'node_modules');assert.ok(fs.statSync(modules).isDirectory())
    fs.symlinkSync(modules,path.join(directory,dependency,'node_modules'),'dir');reused.push(`${dependency}/node_modules`)
  }
  assert.equal(hash(fs.readFileSync(path.join(root,'components/rust/Cargo.lock'))),hash(fs.readFileSync(path.join(directory,'components/rust/Cargo.lock'))),'Install the frozen Rust dependency closure before replay')
  // Cargo still rebuilds and checks its locked exact-source program offline.
  for(const cache of ['components/rust/target','out']) if(fs.existsSync(path.join(root,cache))) {
    fs.symlinkSync(path.join(root,cache),path.join(directory,cache),'dir');reused.push(cache)
  }
  return {root:directory,source,files:tree.length,reused}
}

/** A successful process exit alone cannot prove that a guarded CLI executed.
 * Accept the final complete JSON receipt, allowing earlier diagnostic lines. */
export function requireVerifierReceipt(stdout,expected={verified:true}) {
  assert.equal(typeof stdout,'string')
  let receipt
  // These CLIs emit top-level receipts at column zero. An indented nested
  // object in a truncated pretty-printed envelope is not a receipt.
  const starts=[...stdout.matchAll(/^\{/gm)].map(match=>match.index)
  for(const start of starts.reverse()) {
    try {receipt=JSON.parse(stdout.slice(start).trim());break} catch {}
  }
  assert.ok(receipt&&typeof receipt==='object'&&!Array.isArray(receipt),'Verifier did not emit a complete JSON receipt')
  for(const [key,value] of Object.entries(expected))assert.deepEqual(receipt[key],value,`Verifier receipt field differs: ${key}`)
  return receipt
}
