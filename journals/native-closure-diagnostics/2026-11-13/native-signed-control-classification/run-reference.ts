import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { P2PKH, PublicKey } from '@bsv/sdk'
import { ControlledWalletServices } from '../../synthesis/src/wallet-lab/services.js'
import { createCandidateFixtureWallet } from './candidate-fixture.js'
import { runTransactionBranches } from '../../synthesis/src/wallet-lab/native/coverage-completion/transaction-branches-driver.js'
import { createIsolatedKnownSource } from '../../synthesis/src/wallet-lab/native/coverage-completion/transaction-known-source.js'
import { evaluateTransactionBranches } from '../../synthesis/src/wallet-lab/native/coverage-completion/transaction-branches-parent.js'
import { encodeCoverageObservation } from '../../synthesis/src/wallet-lab/native/coverage-observation.js'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(import.meta.dirname,`attempt-${Date.now()}`);fs.mkdirSync(out)
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),write=(name:string,value:any)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n')
const manifestPath=path.join(root,'out/itcve-go-storage-caller-known-inputs.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),binary=manifestPath.slice(0,-5);assert.equal(hash(binary),manifest.binarySha256)
const sourcePaths=[import.meta.filename,path.join(import.meta.dirname,'candidate-fixture.ts'),"/Users/tyeverett/tmp/network-ops/worktrees/ty-everett/yours-wallet/codex/ghsa-5vmp-dependency-upgrade/node_modules/@bsv/wallet-toolbox-client/out/index.client.mjs","/Users/tyeverett/tmp/network-ops/worktrees/ty-everett/yours-wallet/codex/ghsa-5vmp-dependency-upgrade/patches/@bopen-io%2Fwallet-toolbox-client@2.14.8.patch",manifestPath,...Object.keys({...manifest.inputs,...manifest.patchInputs}).map(p=>path.join(root,p)),...fs.readdirSync(path.join(root,'synthesis/src/wallet-lab/native/coverage-completion')).filter(n=>n.startsWith('transaction-')).map(n=>path.join(root,'synthesis/src/wallet-lab/native/coverage-completion',n)),...['services.ts','go-services.ts','go-batch-build.ts','native-transaction-knowledge-inventory.ts','native-owned-inventories.ts'].map(n=>path.join(root,'synthesis/src/wallet-lab',n))];const capture=()=>Object.fromEntries(sourcePaths.map(p=>[p,hash(p)])),before=capture();write('source-before.json',before);for(const p of sourcePaths){const target=path.join(out,'source',path.relative(root,p).startsWith('..')?'external/yours-wallet/'+path.relative('/Users/tyeverett/tmp/network-ops/worktrees/ty-everett/yours-wallet/codex/ghsa-5vmp-dependency-upgrade',p):path.relative(root,p));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(p,target)}
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixtures/teranode/wab-funding-v1.json'),'utf8'))
const services=new ControlledWalletServices({webroot:out,components:{storage:'go'},go:{binary,storageCallerKnownInputsPatch:true,terminalRejectionReceipts:true}})
let wallet:any,funder:any,unknown:any,report:any,primary:unknown
try{
 await services.start();await services.fundRemoteWalletFromTeranode('77'.repeat(32),fixture)
 wallet=await createCandidateFixtureWallet(services,'78'.repeat(32));funder=await createCandidateFixtureWallet(services,'77'.repeat(32))
 const identity=(await wallet.getPublicKey({identityKey:true})).publicKey,senderIdentityKey=(await funder.getPublicKey({identityKey:true})).publicKey,derivationPrefix=Buffer.from('transaction completion reference').toString('base64'),derivationSuffix=Buffer.from('single shared reserve').toString('base64')
 const key=await funder.getPublicKey({protocolID:[2,'3241645161d8'],keyID:`${derivationPrefix} ${derivationSuffix}`,counterparty:identity}),fundingArgs={description:'Single transaction completion reference reserve',outputs:[{satoshis:50000,lockingScript:new P2PKH().lock(PublicKey.fromString(key.publicKey).toAddress()).toHex(),outputDescription:'Declared reference funds'}],options:{randomizeOutputs:false,acceptDelayedBroadcast:false}}
 const funding=await funder.createAction(fundingArgs),internalizeArgs={tx:funding.tx,outputs:[{outputIndex:0,protocol:'wallet payment',paymentRemittance:{derivationPrefix,derivationSuffix,senderIdentityKey}}],description:'Accept reference funds'},internalized=await wallet.internalizeAction(internalizeArgs);write('funding.json',{identity,senderIdentityKey,fundingArgs,funding,internalizeArgs,internalized})
 unknown=await createIsolatedKnownSource(services,funder)
 const port=(process.env.TPNIL_REFERENCE_MISSING_STAGE==='1'||process.env.TPNIL_REFERENCE_SIGNED_CONTROL_FAILURE==='1')?new Proxy(wallet,{get:(target,method)=>method==='createAction'?async(args:any)=>{if(process.env.TPNIL_REFERENCE_SIGNED_CONTROL_FAILURE==='1'&&args.description==='TPNIL transaction branches valid-signed-change')throw Error('Injected valid signed-control failure: LAB_SELF_TEST_ONLY');if(process.env.TPNIL_REFERENCE_MISSING_STAGE==='1'&&args.description==='TPNIL transaction branches batch-stage')throw Error('Injected fixture staging failure: LAB_SELF_TEST_ONLY');return target.createAction(args)}:target[method].bind(target)}):wallet
 report=await runTransactionBranches({wallet:port,funder,services,identity,unknownSource:unknown,onProgress:(r:any)=>write('report-progress.json',encodeCoverageObservation(r))})
 await unknown.close();unknown=undefined
 report.observedStorage=await services.nativeTransactions();report.finalRoutes=structuredClone(services.routes);report.finalSubmissions=services.submissions.map(row=>({txid:row.txid,verdict:row.verdict,beefHex:Buffer.from(row.bytes).toString('hex')}));report.fixture=fixture;report.declaredNativePayments=[`${funding.txid}.0`]
 write('report.json',encodeCoverageObservation(report));write('verification.json',await evaluateTransactionBranches(report));console.log(JSON.stringify({out,walletCalls:report.walletCalls,funderCalls:report.funderCalls,cuts:report.cuts.length,sections:report.sections}))
}catch(error:any){primary=error;write('execution-error.json',{name:error.name,message:error.message,stack:error.stack})}
finally{
 const errors=[];for(const close of[()=>unknown?.close(),()=>wallet?.destroy(),()=>funder?.destroy()])try{await close()}catch(e){errors.push(String(e))}
 if(report)write('report-final.json',encodeCoverageObservation(report));write('output-observations.json',services.nativeOutputSnapshotObservations);write('knowledge-observations.json',services.nativeTransactionKnowledgeInventoryObservations);write('registry.json',services.nativeOutputProviderRegistry);write('routes.json',services.routes)
 const closure=services.observeSubmissionClosure();try{write('storage.json',await services.nativeTransactions())}catch(e){errors.push(String(e))}try{await services.close()}catch(e){errors.push(String(e))}write('final-providers.json',closure.readFinalProviders());write('action-ledgers.json',services.nativeFinalActionQueryLedgers);write('cleanup.json',{errors});const after=capture();write('source-after.json',after);assert.deepEqual(before,after);if(errors.length&&!primary)primary=Error(errors.join('; '))
}
if(primary)throw primary
