import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
const root=path.resolve(import.meta.dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex')
export function overlayInventory(base,overlay){
  const result=structuredClone(base)
  for(const [name,row]of Object.entries(overlay)){
    let parent=path.posix.dirname(name)
    while(parent!=='/'){
      assert.notEqual(result[parent]?.type,'symlink',`Overlay traverses inherited symlink: ${parent}`)
      parent=path.posix.dirname(parent)
    }
    result[name]=row
  }
  return result
}
export function compareInventory(expected,actual){
  const differences=[]
  for(const name of new Set([...Object.keys(expected),...Object.keys(actual)]))if(!isDeepStrictEqual(expected[name],actual[name]))differences.push({path:name,expected:expected[name]??null,actual:actual[name]??null})
  assert.equal(differences.length,0,`Image filesystem differs in ${differences.length} entries: ${JSON.stringify(differences.slice(0,20))}`)
}
export function compareConfig(base,actual){
  const expected=structuredClone(base)
  const env=new Map(expected.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}))
  env.set('TPNIL_NATIVE_CONFORMANCE','1');env.set('TPNIL_NATIVE_IDENTITY_TRUST','1')
  expected.Env=[...env].map(([k,v])=>`${k}=${v}`)
  assert.deepEqual(actual,expected,'Image runtime configuration differs from the inherited base and declared ENV additions')
}
export function copyOverlay(dockerfile,storageBinary){
  assert.match(storageBinary,/^[a-zA-Z0-9_-]+$/)
  const result={}
  const directory=name=>{if(!result[name])result[name]={type:'directory',mode:0o755,uid:0,gid:0}}
  function put(src,dest){
    let parent=path.posix.dirname(dest)
    while(parent==='/work'||parent.startsWith('/work/')||parent==='/opt/tpnil'||parent.startsWith('/opt/tpnil/')){directory(parent);parent=path.posix.dirname(parent)}
    const st=fs.lstatSync(src);assert.ok(!st.isSymbolicLink(),`Unadmitted source symlink: ${src}`)
    const common={mode:st.mode&0o7777,uid:0,gid:0}
    if(st.isDirectory()){
      result[dest]={type:'directory',...common}
      for(const name of fs.readdirSync(src).sort())put(path.join(src,name),path.posix.join(dest,name))
    }else{
      assert.ok(st.isFile(),`Unsupported COPY source: ${src}`)
      result[dest]={type:'file',...common,bytes:st.size,sha256:sha(fs.readFileSync(src))}
    }
  }
  const payload=dockerfile.split(/^FROM /m)[1];assert.ok(payload?.startsWith('scratch AS conformance_files\n'))
  for(const line of payload.split('\n')){
    if(!line.startsWith('COPY '))continue
    const args=line.slice(5).trim().replaceAll('${TPNIL_STORAGE_BINARY}',storageBinary).split(/\s+/),dest=args.pop()
    assert.ok(dest.startsWith('/work/')||dest==='/opt/tpnil/')
    for(const pattern of args){
      const sources=[...fs.globSync(pattern,{cwd:root})];assert.ok(sources.length,`Missing COPY source: ${pattern}`)
      for(const name of sources){const src=path.join(root,name),dir=fs.statSync(src).isDirectory();put(src,dir?dest.replace(/\/$/,''):dest.endsWith('/')?dest+path.basename(name):dest)}
    }
  }
  return result
}
const collector=String.raw`const fs=require('fs'),crypto=require('crypto');const rows={};function walk(p){const s=fs.lstatSync(p),r={type:s.isDirectory()?'directory':s.isSymbolicLink()?'symlink':'file',mode:s.mode&4095,uid:s.uid,gid:s.gid};if(r.type==='symlink')r.target=fs.readlinkSync(p);else if(r.type==='file'){if(!s.isFile())throw Error('Unsupported type '+p);r.bytes=s.size;const h=crypto.createHash('sha256'),fd=fs.openSync(p,'r'),b=Buffer.alloc(1048576);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));}finally{fs.closeSync(fd)}r.sha256=h.digest('hex')}rows[p]=r;if(r.type==='directory')for(const n of fs.readdirSync(p).sort())walk(p+'/'+n)}walk('/work');walk('/opt/tpnil');process.stdout.write(JSON.stringify(rows))`
export function verifyImage(baseImage,image,storageBinary,output){
  assert.equal(process.platform,'linux');assert.equal(process.arch,'x64')
  assert.ok(!fs.existsSync(output),'Image audit output already exists');fs.mkdirSync(output,{recursive:true})
  const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024})
  const before=JSON.parse(docker(['image','inspect',baseImage]))[0],after=JSON.parse(docker(['image','inspect',image]))[0]
  assert.equal(after.Os,'linux');assert.equal(after.Architecture,'amd64')
  // Image names and build-history fields are outside Config. Every runtime
  // Config field, including command, entrypoint, user and workdir, is compared.
  for(const[name,data]of [['base-image.json',before],['final-image.json',after]])fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'})
  compareConfig(before.Config,after.Config)
  assert.deepEqual(after.RootFS.Layers.slice(0,before.RootFS.Layers.length),before.RootFS.Layers)
  assert.equal(after.RootFS.Layers.length-before.RootFS.Layers.length,2)
  const inventories=[]
  for(const [label,target]of [['base',baseImage],['final',image]]){
    const name=path.join(output,`${label}-filesystem.json`),fd=fs.openSync(name,'wx')
    try{execFileSync('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--entrypoint','/usr/local/bin/node',target,'-e',collector],{stdio:['ignore',fd,'inherit'],timeout:180000})}finally{fs.closeSync(fd)}
    inventories.push(JSON.parse(fs.readFileSync(name)))
  }
  const overlay=copyOverlay(fs.readFileSync(path.join(root,'infra/native/conformance/Dockerfile'),'utf8'),storageBinary)
  fs.writeFileSync(path.join(output,'overlay.json'),JSON.stringify(overlay,null,2)+'\n',{flag:'wx'})
  compareInventory(overlayInventory(inventories[0],overlay),inventories[1])
  const receipt={schema:'tpnil-native-image-filesystem-audit@1',verified:true,baseImageId:before.Id,imageId:after.Id,baseLayers:before.RootFS.Layers.length,finalLayers:after.RootFS.Layers.length,addedLayers:2,baseEntries:Object.keys(inventories[0]).length,overlayEntries:Object.keys(overlay).length,finalEntries:Object.keys(inventories[1]).length,runtimeConfigEqualWithDeclaredEnvironment:true,compared:['all paths in /work and /opt/tpnil','file bytes','file and directory modes','uid/gid','symlink targets','complete inherited runtime Config'],excluded:['inode numbers','build timestamps'],claim:'IMAGE_PACKAGING_ONLY_NOT_NATIVE_QUALIFICATION'}
  for(const [name,data]of [['audit.json',receipt]])fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'})
  return receipt
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){
  const [base,image,binary,output]=process.argv.slice(2);assert.ok(base&&image&&binary&&output)
  console.log(JSON.stringify(verifyImage(base,image,binary,path.resolve(output))))
}
