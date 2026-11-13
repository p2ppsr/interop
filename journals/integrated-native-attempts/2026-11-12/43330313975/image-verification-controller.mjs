import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {compareInventory,overlayInventory,compareConfig} from '../source10-replay/source/scripts/verify-native-image.mjs'
const home=import.meta.dirname,read=n=>JSON.parse(fs.readFileSync(`${home}/original/${n}.json`)),sha=b=>createHash('sha256').update(b).digest('hex')
const original=new Map(fs.readdirSync(`${home}/original`).map(n=>[n,sha(fs.readFileSync(`${home}/original/${n}`))]))
const base=read('base-image'),final=read('final-image'),before=read('base-filesystem'),after=read('final-filesystem'),overlay=read('overlay'),audit=read('audit')
compareConfig(base.Config,final.Config)
assert.equal(final.Os,'linux');assert.equal(final.Architecture,'amd64')
assert.deepEqual(final.RootFS.Layers.slice(0,base.RootFS.Layers.length),base.RootFS.Layers)
assert.equal(final.RootFS.Layers.length-base.RootFS.Layers.length,2)
assert.ok(Object.keys(overlay).every(n=>n==='/work'||n.startsWith('/work/')||n==='/opt/tpnil'||n.startsWith('/opt/tpnil/')))
compareInventory(overlayInventory(before,overlay),after)
assert.equal(audit.baseImageId,base.Id);assert.equal(audit.imageId,final.Id)
assert.equal(audit.baseEntries,Object.keys(before).length);assert.equal(audit.finalEntries,Object.keys(after).length)
assert.equal(audit.overlayEntries,Object.keys(overlay).length);assert.equal(audit.verified,true)
for(const[n,h]of original)assert.equal(sha(fs.readFileSync(`${home}/original/${n}`)),h)
const result={schema:'tpnil-native-image-audit-independent-replay@1',source:'b83489c2d5c2763cd9d7c958756dd0cb47686a51',run:43330313975,verified:true,baseEntries:Object.keys(before).length,finalEntries:Object.keys(after).length,addedLayers:2,configVerified:true,allInventoryEntriesCompared:true,hostOverlaySourceReconstruction:'Pending terminal Linux build manifest',nativeQualification:false,originalHashes:Object.fromEntries(original)}
fs.writeFileSync(`${home}/replay.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result))
