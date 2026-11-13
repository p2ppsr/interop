import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root=fs.realpathSync(process.cwd()),home=fs.realpathSync(import.meta.dirname)
const sha=b=>createHash('sha256').update(b).digest('hex')
const read=name=>JSON.parse(fs.readFileSync(path.join(home,name)))
const audit=read('package-byte-audit.json'),closure=read('dependency-byte-closure-v3.json'),tests=read('dependency-guard-tests-v3.json'),sdk=read('messaging-sdk-byte-closure.json')
const rust=read('rust-dependency-byte-closure.json'),isolation=read('cache-isolation.json')
const profile=path.join(home,'replay-dependency-guard-v3.sb')
assert.equal(process.versions.node,'24.22.1')
assert.equal(process.env.NODE_OPTIONS,undefined,'Unexpected ambient Node code injection')
assert.equal(process.env.NODE_PATH,undefined,'Unexpected ambient Node module path')
assert.equal(tests.result,'PASS');assert.equal(tests.tests,16)
assert.equal(sha(fs.readFileSync(profile)),closure.guard.sha256)
assert.equal(sha(fs.readFileSync(path.join(home,'package-byte-audit.json'))),closure.auditSha256)
assert.equal(sha(fs.readFileSync('/usr/bin/sandbox-exec')),tests.sandboxExecSha256)
assert.equal(sha(fs.readFileSync(process.execPath)),tests.nodeSha256)
function walk(directory,base=directory,excluded=new Set()){
 const files=[]
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  const f=path.join(directory,item.name)
  if(excluded.has(f)){assert.ok(item.isDirectory()&&!item.isSymbolicLink());continue}
  assert.ok(!item.isSymbolicLink(),`Unexpected package symlink ${f}`)
  if(item.isDirectory())files.push(...walk(f,base,excluded));else{assert.ok(item.isFile());files.push(path.relative(base,f))}
 }
 return files.sort()
}
function packageRoots(modules,prefix='node_modules'){
 assert.equal(fs.realpathSync(modules),modules,'Retargeted module tree')
 const found=[]
 for(const item of fs.readdirSync(modules,{withFileTypes:true})){
  if(item.name==='.bin'||item.name==='.package-lock.json')continue
  if(closure.excludedGeneratedCacheDirectories.includes(path.join(modules,item.name))){assert.ok(item.isDirectory()&&!item.isSymbolicLink());continue}
  assert.ok(item.isDirectory()&&!item.isSymbolicLink(),`Unexpected node_modules entry ${item.name}`)
  if(item.name.startsWith('@'))for(const sub of fs.readdirSync(path.join(modules,item.name),{withFileTypes:true})){
   assert.ok(sub.isDirectory()&&!sub.isSymbolicLink());found.push(`${prefix}/${item.name}/${sub.name}`)
  }else found.push(`${prefix}/${item.name}`)
 }
 return found
}
function verifyBins(modules,pkgs,dependency,expected){
 const bin=path.join(modules,'.bin');if(!fs.existsSync(bin))return
 assert.ok(fs.lstatSync(bin).isDirectory()&&!fs.lstatSync(bin).isSymbolicLink())
 for(const item of fs.readdirSync(bin,{withFileTypes:true})){
  const file=path.join(bin,item.name);assert.ok(item.isSymbolicLink(),`Unexpected executable bin entry ${file}`)
  const target=fs.realpathSync(file),rel=path.relative(path.join(root,dependency),target)
  assert.ok(expected.has(rel),`Bin target outside verified bytes ${file}`)
  const matching=pkgs.filter(p=>{
   const dir=path.join(root,dependency,p.package),meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json')))
   const bins=typeof meta.bin==='string'?{[meta.name.split('/').at(-1)]:meta.bin}:meta.bin??{}
   return Object.hasOwn(bins,item.name)&&path.resolve(dir,bins[item.name])===target
  })
  assert.ok(matching.length>0,`Bin target not declared by verified package ${file}`)
 }
}
function verifyRustBytes(){
 assert.equal(sha(fs.readFileSync(path.join(home,'rust-dependency-byte-closure.json'))),closure.rustByteClosureSha256)
 assert.equal(sha(fs.readFileSync(path.join(home,'cache-isolation.json'))),closure.cacheIsolationSha256)
 assert.equal(fs.realpathSync(isolation.rustTargetLink),isolation.freshTarget)
 for(const t of isolation.tools)assert.equal(sha(fs.readFileSync(t.path)),t.sha256)
 for(const p of rust.results){
  if(p.archive)assert.equal(sha(fs.readFileSync(p.archive)),p.archiveSha256)
  if(p.notMaterialized){assert.ok(!fs.existsSync(p.root));continue}
  assert.equal(fs.realpathSync(p.root),p.root)
  const expected=new Map(p.files.map(f=>[f.path,f])),actual=[]
  function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,e.name),rel=path.relative(p.root,file)
   if(rel==='.git'&&p.gitCommit){assert.ok(e.isDirectory()&&!e.isSymbolicLink());continue}
   if(e.isDirectory()){scan(file);continue}
   actual.push(rel);const row=expected.get(rel);assert.ok(row,`Extra Rust dependency file ${file}`)
   if(row.symlink){assert.ok(e.isSymbolicLink());assert.equal(fs.readlinkSync(file),row.symlink);assert.ok(!fs.existsSync(file))}
   else{assert.ok(e.isFile()&&!e.isSymbolicLink());const b=fs.readFileSync(file);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256)}
  }}
  scan(p.root);assert.deepEqual(actual.sort(),[...expected.keys()].sort())
 }
 return {lockedPackages:23,materializedPackages:22,verifiedInventoryEntries:1745,verifiedSourceBytes:17687793,unmaterializedSandboxDeniedPackages:1}
}
function verifyBytes(){
 let files=0,bytes=0
 const dependencyMetadata=read('dependencies.json')
 for(const dependency of ['synthesis','integrations/services','components/transport']){
  const base=path.join(root,dependency),modules=path.join(base,'node_modules'),meta=dependencyMetadata.dependencies.find(d=>d.dependency===dependency)
  assert.equal(fs.realpathSync(modules),meta.modules);assert.equal(meta.modules,modules)
  const hiddenBytes=fs.readFileSync(path.join(modules,'.package-lock.json'))
  assert.equal(sha(hiddenBytes),meta.installedLockSha256)
  const hidden=JSON.parse(hiddenBytes),lockBytes=fs.readFileSync(path.join(base,'package-lock.json'))
  assert.equal(sha(lockBytes),sha(fs.readFileSync(path.join(home,'source',dependency,'package-lock.json'))))
  const lock=JSON.parse(lockBytes)
  const pkgs=audit.results.filter(p=>p.dependency===dependency),known=pkgs.map(p=>p.package).sort(),actual=packageRoots(modules)
  assert.deepEqual(Object.keys(hidden.packages).sort(),known)
  const moduleDirs=[modules],expected=new Map([['node_modules/.package-lock.json',{bytes:hiddenBytes.length,sha256:sha(hiddenBytes)}]])
  for(const p of pkgs){
   assert.equal(p.problems.length,0);assert.equal(p.integrity,lock.packages[p.package].integrity);assert.equal(p.version,lock.packages[p.package].version)
   const dir=path.join(base,p.package);assert.equal(fs.realpathSync(dir),dir)
   for(const f of p.files){expected.set(`${p.package}/${f.path}`,f)}
   for(const f of p.extraFiles){const full=path.join(dir,f.path);assert.ok(f.sha256&&!f.symlink);assert.ok(full===closure.addon.path||closure.excludedGeneratedBuildMetadata.includes(full));expected.set(`${p.package}/${f.path}`,f)}
   for(const f of new Map(p.files.map(f=>[f.path,f])).values()){files++;bytes+=f.bytes}
   const nested=path.join(dir,'node_modules');if(fs.existsSync(nested)){actual.push(...packageRoots(nested,`${p.package}/node_modules`));moduleDirs.push(nested)}
  }
  assert.deepEqual(actual.sort(),known,`Installed package inventory differs ${dependency}`)
  const excluded=new Set([...closure.excludedGeneratedCacheDirectories,...moduleDirs.map(d=>path.join(d,'.bin'))])
  assert.deepEqual(walk(modules,base,excluded),[...expected.keys()].sort(),`Full installed file inventory differs ${dependency}`)
  for(const [name,f]of expected){const b=fs.readFileSync(path.join(base,name));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256)}
  for(const d of moduleDirs)verifyBins(d,pkgs,dependency,expected)
 }
 assert.equal(files,19350);assert.equal(bytes,321859027)
 assert.equal(sha(fs.readFileSync(closure.addon.path)),closure.addon.sha256)
 assert.equal(sdk.result,'PASS');assert.equal(sdk.fileCount,1951);assert.equal(sdk.nonBuiltinExternalDependencies,0)
 assert.equal(fs.realpathSync(sdk.root),sdk.root)
 assert.deepEqual(walk(sdk.root),sdk.files.map(f=>f.path).sort())
 for(const f of sdk.files){const b=fs.readFileSync(path.join(sdk.root,f.path));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256)}
 return {packages:526,files:files+sdk.fileCount,bytes:bytes+sdk.bytes,additionalVerifiedNativeAddonBytes:closure.addon.bytes,excludedMetadataFiles:10,excludedGeneratedCaches:1,completePackageInventory:true,completeFileInventory:true,declaredBinTargets:true,canonicalPackageRoots:true,hiddenLockAndFrozenLocks:true}
}
const verified=verifyBytes(),verifiedRust=verifyRustBytes()
if(process.argv[2]==='--verify-dependencies-only'){
 console.log(JSON.stringify({verified:true,...verified,rust:verifiedRust,semanticReplayExecuted:false}));process.exit(0)
}
for(const key of ['NODE_COMPILE_CACHE','ESBUILD_BINARY_PATH','TSX_TSCONFIG_PATH','RUSTC_WRAPPER','RUSTC_WORKSPACE_WRAPPER','RUSTC','RUSTFLAGS','CARGO_ENCODED_RUSTFLAGS','CARGO_BUILD_TARGET','CARGO_TARGET_DIR'])assert.equal(process.env[key],undefined,`Unexpected ambient build override ${key}`)
assert.deepEqual(fs.readdirSync(isolation.freshTarget),[],'Rust target must be empty before this single replay')
assert.deepEqual(fs.readdirSync(isolation.freshTemp),[],'Replay temp must be empty before this single replay')
const original=fs.realpathSync(process.argv[2]);assert.ok(original.startsWith(path.join(root,'out')+path.sep))
assert.match(process.argv[3] ?? '', /^\d+$/, 'Exact original run is required')
const args=['-f',profile,process.execPath,path.join(home,'replay-when-authorized.mjs'),original,process.argv[3]]
const startedAt=new Date().toISOString()
const r=spawnSync('/usr/bin/sandbox-exec',args,{cwd:root,env:{...process.env,...isolation.environment,TPNIL_DEPENDENCY_BYTE_GUARD:'mandatory-sandbox-v1'},encoding:'utf8',timeout:4500000,maxBuffer:64*1024*1024})
for(const[name,b]of[['guarded-replay.stdout.log',r.stdout??''],['guarded-replay.stderr.log',r.stderr??'']])fs.writeFileSync(path.join(home,name),b,{flag:'wx'})
assert.deepEqual(verifyBytes(),verified);assert.deepEqual(verifyRustBytes(),verifiedRust);assert.equal(sha(fs.readFileSync(profile)),closure.guard.sha256)
const receipt={schema:'tpnil-native-byte-closed-replay-execution@1',source:'ec3a554d433845e9aa8209d9eb20dde48cba6a2a',run:Number(process.argv[3]),command:['/usr/bin/sandbox-exec',...args],startedAt,completedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?.message,verifiedDependencies:verified,verifiedRustDependencies:verifiedRust,cacheIsolation: isolation.environment,packageBytesAndInventoryUnchanged:true,guardRequired:true,guardSha256:closure.guard.sha256,byteClosureSha256:sha(fs.readFileSync(path.join(home,'dependency-byte-closure-v3.json'))),messagingSdkClosureSha256:sha(fs.readFileSync(path.join(home,'messaging-sdk-byte-closure.json'))),replayReceipt:fs.existsSync(path.join(home,'replay.json'))?sha(fs.readFileSync(path.join(home,'replay.json'))):null}
fs.writeFileSync(path.join(home,'guarded-replay.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));if(r.status!==0)process.exitCode=1
