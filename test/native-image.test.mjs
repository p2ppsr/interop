import test from 'node:test'
import assert from 'node:assert/strict'
import {overlayInventory,compareInventory,compareConfig,copyOverlay} from '../scripts/verify-native-image.mjs'
import fs from 'node:fs'
import path from 'node:path'
const dir={type:'directory',mode:493,uid:0,gid:0},file={type:'file',mode:420,uid:0,gid:0,bytes:1,sha256:'a'.repeat(64)}
test('image audit preserves every inherited path and rejects altered bytes, modes, owners, links and extra or missing files',()=>{
 const base={'/work':dir,'/work/lib':dir,'/work/lib/keep':file,'/work/link':{type:'symlink',mode:511,uid:0,gid:0,target:'lib/keep'}}
 const expected=overlayInventory(base,{'/work/new':file});compareInventory(expected,structuredClone(expected))
 for(const change of [x=>delete x['/work/lib/keep'],x=>x['/work/extra']=file,x=>x['/work/new'].sha256='b'.repeat(64),x=>x['/work/new'].mode=511,x=>x['/work/new'].uid=1000,x=>x['/work/link'].target='new']){
  const actual=structuredClone(expected);change(actual);assert.throws(()=>compareInventory(expected,actual))
 }
 assert.throws(()=>overlayInventory(base,{'/work/link/escape':file}),/symlink/)
})
test('image audit permits exactly the declared environment additions and retains all runtime config',()=>{
 const base={User:'pwuser',WorkingDir:'/work',Cmd:['node','worker'],Env:['HOME=/tmp/home']}
 const actual={...base,Env:[...base.Env,'TPNIL_NATIVE_CONFORMANCE=1','TPNIL_NATIVE_IDENTITY_TRUST=1']};compareConfig(base,actual)
 for(const changed of [{...actual,User:'root'},{...actual,Cmd:['sh']},{...actual,Env:[...actual.Env,'BYPASS=1']}])assert.throws(()=>compareConfig(base,changed))
})
test('complete source overlay includes every staged file and the exact two generated storage inputs',()=>{
 const text=fs.readFileSync('infra/native/conformance/Dockerfile','utf8')
 // LAB_SELF_TEST_ONLY: offline CI has no compiled Go host. Bind two owned
 // inert files to the real COPY parser; never overwrite a prepared artifact.
 fs.mkdirSync('out',{recursive:true})
 const fixture=fs.mkdtempSync(path.resolve('out/image-audit-unit-'))
 const binary='itcve-go-storage-caller-known-inputs'
 fs.writeFileSync(path.join(fixture,binary),'synthetic binary bytes')
 fs.writeFileSync(path.join(fixture,binary+'.json'),'{}')
 let names
 try{names=Object.keys(copyOverlay(text.replaceAll('out/${TPNIL_STORAGE_BINARY}',path.relative(process.cwd(),fixture)+'/${TPNIL_STORAGE_BINARY}'),binary))}
 finally{fs.rmSync(fixture,{recursive:true})}
 assert.ok(names.includes('/work/synthesis/test/fixtures/native-pagination/report.json.gz'))
 assert.ok(names.includes('/work/scripts/verify-native-image.mjs'))
 assert.ok(names.includes('/opt/tpnil/itcve-go-storage-caller-known-inputs'))
 assert.ok(names.includes('/opt/tpnil/itcve-go-storage-caller-known-inputs.json'))
 assert.equal(text.split(/^FROM /m).length-1,2)
 assert.equal(text.split(/^FROM /m)[2].split('\n').filter(l=>l.startsWith('COPY ')).length,2)
})
