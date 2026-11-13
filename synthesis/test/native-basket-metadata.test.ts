// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {gunzipSync} from 'node:zlib'
import {SymmetricKey} from '@bsv/sdk'
import {WalletPermissionsManager} from '@bsv/wallet-toolbox'
import {expect,it} from 'vitest'
import {nativeArgs,selectedBasketPolicy} from '../src/wallet-lab/native/coverage-completion/baskets-model.js'
import {fixtureMetadataQueries,expectedInstructionsAt,assertOpaqueStoredInstructions,verifyPublicFixtureMetadata} from '../src/wallet-lab/native/coverage-completion/basket-metadata.js'
import {verifyBasketObservations} from '../src/wallet-lab/native/coverage-completion/baskets-verifier.js'
import {ControlledWalletServices} from '../src/wallet-lab/services.js'
import {createFixtureWallet} from '../src/storage-sync/fixture-wallet.js'

const retained=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/native-basket-boundaries/report.json.gz',import.meta.url))).toString())
// LAB_SELF_TEST_ONLY: encrypted adaptation of retained transactions. Public
// plaintext is declared independently; these added reads are not native proof.
function sample() {
 const report=structuredClone(retained),key=new SymmetricKey(1234),cipher=new Map<string,string>()
 report.schema='tpnil-native-basket-boundaries@1.0.0';report.claim='ENGINEERING_OBSERVATION_ONLY';report.mode='LAB_SELF_TEST_ONLY'
 report.policySha256=selectedBasketPolicy(3).sha256;report.reopen.kind='PUBLIC_CWI_HANDLE_REFRESH'
 for(const snapshot of report.snapshots)for(const provider of snapshot.observation.snapshots.providers)for(const output of provider.snapshot.outputs) {
  if(typeof output.customInstructions!=='string'||output.customInstructions==='')continue
  const tuple=`${provider.id}:${output.outputId}:${output.customInstructions}`
  if(!cipher.has(tuple))cipher.set(tuple,Buffer.from(key.encrypt(output.customInstructions) as number[]).toString('base64'))
  output.customInstructions=cipher.get(tuple)
 }
 for(const[prefix,afterId,ownedRows]of[
  ['fixture-metadata','fixture-external',report.snapshots[0].observation.snapshots.providers[0].snapshot.outputs],
  ['reopened-metadata','reopened-identity',report.snapshots.at(-1).observation.snapshots.providers[0].snapshot.outputs]
 ] as const) {
  let index=report.trace.findIndex((row:any)=>row.id===afterId)
  for(const query of fixtureMetadataQueries(prefix)) {
   const after=report.trace[index],row:any={...query,actor:'wallet',method:'listOutputs',startedAt:after.endedAt,endedAt:after.endedAt,
    submissionStart:after.submissionEnd,submissionEnd:after.submissionEnd,result:{outputs:[],totalOutputs:0}}
   report.trace.splice(++index,0,row)
   row.result.outputs=ownedRows.filter((owned:any)=>owned.spendable&&owned.basketName===query.args.basket).map((owned:any)=>({
    outpoint:owned.outpoint,satoshis:owned.satoshis,lockingScript:owned.lockingScript,tags:owned.tags,
    customInstructions:expectedInstructionsAt(report,row.id,owned.outpoint)}))
   row.result.totalOutputs=row.result.outputs.length
  }
 }
 return report
}
it('requires exact public plaintext with opaque private frames across all39 mutations',async()=>{
 const report=sample(),result=await verifyBasketObservations(report,3)
 expect(result.fixtureError).toBe(null);expect(result.counts).toEqual({SCOPED_PASS:39,FAIL:0,BLOCKED:0})
 const legacy=structuredClone(report);legacy.policySha256=selectedBasketPolicy(2).sha256
 expect((await verifyBasketObservations(legacy,2)).fixtureValid).toBe(false)
})
it.each(['public-ciphertext','wrong-plaintext','missing-output','duplicate-output','wrong-tags','raw-plaintext','raw-size','raw-noncanonical','changed-cipher','denied-mutation'])(
 'rejects encrypted metadata defect %s',async(kind)=>{
  const report=sample(),query=report.trace.find((row:any)=>row.id==='reopened-metadata.sources'),outputs=query.result.outputs
  const last=report.snapshots.at(-1).observation.snapshots.providers[0].snapshot.outputs
  const native=report.trace.find((row:any)=>row.id==='fixture-native').result.txid
  const stored=last.find((row:any)=>row.outpoint===`${native}.0`)
  if(kind==='public-ciphertext')outputs[0].customInstructions=stored.customInstructions
  if(kind==='wrong-plaintext')outputs[0].customInstructions='attacker-selected'
  if(kind==='missing-output')outputs.shift()
  if(kind==='duplicate-output')outputs.push(structuredClone(outputs[0]))
  if(kind==='wrong-tags')outputs[0].tags=['wrong tag']
  if(kind==='raw-plaintext')stored.customInstructions=nativeArgs().outputs[0]!.customInstructions
  if(kind==='raw-size')stored.customInstructions=Buffer.from('wrong').toString('base64')
  if(kind==='raw-noncanonical')stored.customInstructions+='\n'
  if(kind==='changed-cipher')stored.customInstructions=Buffer.from(new SymmetricKey(4567).encrypt(nativeArgs().outputs[0]!.customInstructions) as number[]).toString('base64')
  if(kind==='denied-mutation') {
   const snapshot=report.snapshots.find((row:any)=>row.id==='ascii-301.internalizeAction'&&row.phase==='after')
   snapshot.observation.snapshots.providers[0].snapshot.outputs[0].customInstructions=stored.customInstructions.slice(0,-4)+'AAAA'
  }
  expect((await verifyBasketObservations(report,3)).counts.SCOPED_PASS).toBeLessThan(39)
 })
it('opaque frame checks never accept plaintext, malformed base64 or a truncated tag',()=>{
 const plain='metadata',value=Buffer.from(new SymmetricKey(1234).encrypt(plain) as number[]).toString('base64')
 expect(()=>assertOpaqueStoredInstructions(value,plain)).not.toThrow()
 for(const bad of[plain,value+'\n',value.slice(0,-4),null])expect(()=>assertOpaqueStoredInstructions(bad,plain)).toThrow()
})

it.skipIf(process.env.TPNIL_BASKET_METADATA_GO_TESTS!=='1')('actual Go storage and public permission manager preserve encrypted/plaintext metadata',async()=>{
 const binary=path.resolve(import.meta.dirname,'../../out/itcve-go-storage-caller-known-inputs')
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-basket-metadata-'))
 const services=new ControlledWalletServices({webroot:directory,submissionOrdering:'tpnil-owned-submission-order@1',components:{storage:'go'},go:{binary,storageCallerKnownInputsPatch:true,terminalRejectionReceipts:true}})
 let underlying:Awaited<ReturnType<typeof createFixtureWallet>>|undefined
 try {
  await services.start()
  await services.fundRemoteWalletFromTeranode('77'.repeat(32),JSON.parse(fs.readFileSync(new URL('../../fixtures/teranode/wab-funding-v1.json',import.meta.url),'utf8')))
  underlying=await createFixtureWallet(services,'77'.repeat(32))
  const manager=new WalletPermissionsManager(underlying,'lab-admin.test'),args={...nativeArgs(),options:{...nativeArgs().options,signAndProcess:true}}
  const creation=await manager.createAction(structuredClone(args),'lab-admin.test')
  const identity=(await underlying.getPublicKey({identityKey:true})).publicKey,snapshot=await services.nativeOutputSnapshots(identity)
  const rows=snapshot.providers.flatMap(provider=>provider.snapshot.outputs)
  const report:any={trace:[{id:'fixture-native',actor:'wallet',result:creation}]}
  for(const query of fixtureMetadataQueries('fixture-metadata'))report.trace.push({...query,actor:'wallet',method:'listOutputs',result:await manager.listOutputs(query.args,'lab-admin.test')})
  verifyPublicFixtureMetadata(report,'fixture-metadata',rows)
  const retained=path.resolve(import.meta.dirname,'../../out/source11-metadata-go');fs.mkdirSync(retained,{recursive:true})
  fs.writeFileSync(path.join(retained,'observation.json'),JSON.stringify({claim:'LAB_SELF_TEST_ONLY',nativeQualification:false,managerPackage:'@bsv/wallet-toolbox@2.13.0',report,snapshot},null,2)+'\n')
 } finally {await underlying?.destroy();await services.close();fs.rmSync(directory,{recursive:true,force:true})}
},120_000)
