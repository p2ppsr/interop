// SPDX-License-Identifier: Apache-2.0
import {randomBytes} from 'node:crypto'
import {Certificate,PrivateKey,ProtoWallet,Utils} from '@bsv/sdk'
import {createConditionalIssuer,type ConditionalIssuanceMode} from '../conformance-conditional-issuer.js'
import {issueFixtureCertificateForSubject} from '../../certificate-fixture.js'
import {captureClauseError} from '../conformance-clauses.js'
import {config,negativeCases,digest,serial,listArgs,directArgs,negativeArgs,issuanceArgs,certificateValue,tuple,type Ports} from './certificate-rejections-model.js'
const now=()=>new Date().toISOString()
export async function createDirectFixture(identity:string,outpoint:string,runNonce:string,id:string,distinct=false){
 const issuer=createConditionalIssuer(),certificate=JSON.parse(JSON.stringify(await issueFixtureCertificateForSubject(issuer.wallet,identity,config.fields,config.certificateType,async()=>outpoint,serial(runNonce,id))));
 if(distinct){const revealer=new ProtoWallet(PrivateKey.fromHex(config.revealerKey));certificate.revealer=(await revealer.getPublicKey({identityKey:true})).publicKey;certificate.alternateKeyring={};for(const[field,wrapped]of Object.entries(certificate.masterKeyring)){const details=Certificate.getCertificateFieldEncryptionDetails(field),{plaintext}=await issuer.wallet.decrypt({ciphertext:Utils.toArray(wrapped as string,'base64'),...details,counterparty:identity}),{ciphertext}=await revealer.encrypt({plaintext,...details,counterparty:identity});certificate.alternateKeyring[field]=Utils.toBase64(ciphertext)}}
 return certificate
}
export async function captureCertificateRejections(ports:Ports){
 let wallet=ports.wallet;const issuer=createConditionalIssuer();issuer.setRevocationOutpoint(ports.revocationOutpoint);const remove=ports.registerIssuer(issuer.handle)
 const report:any={schema:'tpnil-native-certificate-rejections@1.0.0',programSha256:digest({config,negativeCases}),claim:'ENGINEERING_OBSERVATION_ONLY',mode:'PUBLIC_WALLET_OBSERVATION',completeBRC100Conformance:false,identity:ports.identity,runNonce:ports.runNonce,revocationOutpoint:ports.revocationOutpoint,providerRegistry:structuredClone(ports.providerRegistry),startedAt:now(),endedAt:'',trace:[],inventories:[],fixtures:{},issuer:{},errors:[],restart:null,cleanup:{issuerRemoved:false},submissionStart:ports.submissions().length,submissionPrefix:structuredClone(ports.submissions()),submissionEnd:ports.submissions().length,submissions:[],routeStart:ports.routes().length,routeEnd:ports.routes().length,routes:[],snapshotStart:ports.certificateObservations().length,snapshotEnd:ports.certificateObservations().length}
 const progress=()=>ports.progress?.(report)
 const call=async(id:string,method:string,args:any)=>{if(report.trace.length>=config.maxCalls)throw Error('Fixed CWI budget exceeded');const row:any={id,method,args:structuredClone(args),startedAt:now(),endedAt:'',submissionStart:ports.submissions().length,submissionEnd:ports.submissions().length,routeStart:ports.routes().length,routeEnd:ports.routes().length,issuerStart:issuer.receipts.length,issuerEnd:issuer.receipts.length};report.trace.push(row);try{row.result=structuredClone(await wallet[method](structuredClone(args)))}catch(e){row.error=captureClauseError(e)}row.endedAt=now();row.submissionEnd=ports.submissions().length;row.issuerEnd=issuer.receipts.length;row.routeEnd=ports.routes().length;progress();return row}
 const inventory=async(id:string)=>{if(report.inventories.length>=config.inventoryCuts)throw Error('Inventory bound exceeded');const item:any={id,startedAt:now(),endedAt:'',pages:[],observation:null};report.inventories.push(item);let done=false;for(let page=0;page<config.maxPages;page++){const row=await call(`${id}.page-${page}`,'listCertificates',listArgs(page*config.pageSize));item.pages.push(row.id);if(row.error)break;const certificates=row.result?.certificates;if(!Array.isArray(certificates))break;if(certificates.length===0){done=true;break}}item.terminalEmptyPage=done;const index=ports.certificateObservations().length;try{await ports.observeCertificates(ports.identity)}catch{/* independently retained observer error */}item.observation=ports.certificateObservations()[index]??null;item.endedAt=now();progress();return item}
 try{
  await call('identity','getPublicKey',{identityKey:true});await inventory('baseline')
  for(const id of ['control-direct','control-distinct']){report.fixtures[id]=await createDirectFixture(ports.identity,ports.revocationOutpoint,ports.runNonce,id,id==='control-distinct');await call(id,'acquireCertificate',directArgs(report.fixtures[id],id==='control-distinct'));await inventory(`${id}.inventory`)}
  const verifier=PrivateKey.fromHex(config.verifierKey).toPublicKey().toString(),proof={certificate:certificateValue(report.fixtures['control-distinct']),fieldsToReveal:['name'],verifier}
  await call('distinct-proof-before','proveCertificate',proof)
  issuer.setMode('valid');await call('control-issuance','acquireCertificate',issuanceArgs(issuer.identity));await inventory('control-issuance.inventory')
  for(const spec of negativeCases){
   if(spec.kind==='direct')report.fixtures[spec.id]=await createDirectFixture(ports.identity,ports.revocationOutpoint,ports.runNonce,spec.id,spec.mode==='wrong-revealer')
   issuer.setMode((spec.kind==='issuance'?spec.mode:'valid') as ConditionalIssuanceMode)
   await inventory(`${spec.id}.before`);await call(spec.id,'acquireCertificate',negativeArgs(spec,report.fixtures[spec.id],issuer.identity));await inventory(`${spec.id}.after`)
  }
  if(ports.restart){const startedAt=now();const restarted=await ports.restart();wallet=restarted.wallet;report.restart={...restarted, wallet:undefined,startedAt,endedAt:now()};await inventory('after-restart');await call('distinct-proof-after','proveCertificate',proof)}else{report.restart={kind:'UNAVAILABLE'};await inventory('after-restart');await call('distinct-proof-after','proveCertificate',proof)}
  for(const id of ['control-direct','control-distinct','control-issuance']){const c=report.trace.find((r:any)=>r.id===id)?.result;if(c)await call(`cleanup-${id}`,'relinquishCertificate',{type:c.type,certifier:c.certifier,serialNumber:c.serialNumber})}
  await inventory('cleanup.inventory')
 }catch(e){report.errors.push(String(e))}
 finally{remove();report.cleanup.issuerRemoved=true;report.issuer={identity:issuer.identity,receipts:issuer.receipts,authMessages:issuer.authMessages,exchanges:issuer.exchanges};report.endedAt=now();report.submissionEnd=ports.submissions().length;report.submissions=structuredClone(ports.submissions().slice(report.submissionStart));report.snapshotEnd=ports.certificateObservations().length;report.routeEnd=ports.routes().length;report.routes=structuredClone(ports.routes().slice(report.routeStart));progress()}
 return report
}
