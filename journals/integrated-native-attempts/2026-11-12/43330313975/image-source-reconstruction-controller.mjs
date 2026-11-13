import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyOverlay, overlayInventory, compareInventory, compareConfig } from '../../source10-replay/source/scripts/verify-native-image.mjs'
const home=import.meta.dirname,old=home+'/../original/',frozen=home+'/../../source10-replay/source',read=n=>JSON.parse(fs.readFileSync(old+n+'.json')),sha=b=>createHash('sha256').update(b).digest('hex')
const base=read('base-filesystem'),actual=read('final-filesystem'),capturedOverlay=read('overlay'),manifest=JSON.parse(fs.readFileSync(home+'/linux-storage-manifest.json'))
const dockerfile=fs.readFileSync(frozen+'/infra/native/conformance/Dockerfile','utf8')
const host=copyOverlay(dockerfile.replace(/^COPY out\/\$\{TPNIL_STORAGE_BINARY\}.*\n/m,''),'itcve-go-storage-caller-known-inputs')
const dynamic=['/opt/tpnil/itcve-go-storage-caller-known-inputs','/opt/tpnil/itcve-go-storage-caller-known-inputs.json']
assert.equal(manifest.binarySha256,actual[dynamic[0]].sha256)
assert.equal(sha(fs.readFileSync(home+'/linux-storage-manifest.json')),actual[dynamic[1]].sha256)
// Runtime Linux entries bind to the original independently logged build manifest.
for(const name of dynamic)host[name]=actual[name]
// Removing the dynamic COPY also omits its independently specified parent directory.
host['/opt/tpnil']={type:'directory',mode:493,uid:0,gid:0}
compareInventory(host,capturedOverlay)
compareInventory(overlayInventory(base,host),actual)
compareConfig(read('base-image').Config,read('final-image').Config)
const changed=structuredClone(host),name=Object.keys(host).find(name=>host[name].type==='file'&&!dynamic.includes(name));delete changed[name]
assert.throws(()=>compareInventory(changed,capturedOverlay))
const result={schema:'tpnil-native-image-source-reconstruction@1',source:'b83489c2d5c2763cd9d7c958756dd0cb47686a51',run:43330313975,verified:true,sourceOverlayEntries:Object.keys(host).length,finalEntries:Object.keys(actual).length,allSourceCopyBytesMatch:true,independentLinuxManifest:true,completeRuntimeConfig:true,seededMissingFileRejected:true,nativeQualification:false}
fs.writeFileSync(home+'/result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result))
