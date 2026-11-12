// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { Beef,BigNumber,KeyDeriver,Point,PrivateKey,ProtoWallet,PublicKey,Schnorr,Transaction,Utils,VerifiableCertificate } from '@bsv/sdk'
import { verifyPermissionCallNonces,verifyPermissionClick } from '../permission-click.js'
import { config,rows,categories,allCategories,program,manifest,manifestLabels,canonical,digest,peer,verifier,type Report,type Category,type CallSpec } from './permissions-model.js'
const same=(a:any,b:any)=>assert.equal(canonical(a),canonical(b))
const instant=(x:string)=>{const n=Date.parse(x);assert.ok(Number.isFinite(n),'Invalid timestamp');return n}
class PrerequisiteUnavailable extends Error{}
export async function verifyApprovedLinkage(category:Category,value:any,identity:string,startedAt:string,endedAt:string){
 assert.equal(value.prover,identity);assert.equal(value.counterparty,peer);assert.equal(value.verifier,verifier)
 const recipient=new ProtoWallet(PrivateKey.fromHex(config.verifierKey)),peerKey=PrivateKey.fromHex(config.peerKey)
 if(category==='counterparty-linkage'){
  assert.ok(instant(startedAt)<=instant(value.revelationTime)&&instant(value.revelationTime)<=instant(endedAt))
  const args={protocolID:[2,'counterparty linkage revelation'] as [2,string],keyID:value.revelationTime,counterparty:identity}
  const clear=(await recipient.decrypt({...args,ciphertext:value.encryptedLinkage})).plaintext
  same(clear,PublicKey.fromString(identity).mul(peerKey).encode(true))
  const proof=(await recipient.decrypt({...args,ciphertext:value.encryptedLinkageProof})).plaintext
  assert.equal(proof.length,98);assert.ok(new Schnorr().verifyProof(PublicKey.fromString(identity),peerKey.toPublicKey(),Point.fromDER(clear),{R:Point.fromDER(proof.slice(0,33)),SPrime:Point.fromDER(proof.slice(33,66)),z:new BigNumber(proof.slice(66))}))
 }else{
  assert.equal(category,'specific-linkage');same(value.protocolID,config.linkageProtocol);assert.equal(value.keyID,config.linkageKeyID);assert.equal(value.proofType,0)
  const args={protocolID:[2,`specific linkage revelation ${config.linkageProtocol[0]} ${config.linkageProtocol[1]}`] as [2,string],keyID:config.linkageKeyID,counterparty:identity}
  same((await recipient.decrypt({...args,ciphertext:value.encryptedLinkage})).plaintext,new ProtoWallet(peerKey).keyDeriver!.revealSpecificSecret(identity,config.linkageProtocol,config.linkageKeyID))
  same((await recipient.decrypt({...args,ciphertext:value.encryptedLinkageProof})).plaintext,[0])
 }
}
/** This prototype deliberately has no promotion override. Even coherent native
 * receipts stay BLOCKED until a new source-owned parent integrates the full
 * browser chain, fixture/funding, provider and permission-token ledger joins. */
export async function evaluatePermissionSequence(report:Report,read:(name:string)=>Buffer){
 const actions=program(report.anchor),specs=new Map(actions.map(a=>[a.id,a]));let commonError:Error|undefined
 const observation=(id:string)=>{const found=report.observations.filter(o=>o.id===id);assert.equal(found.length,1,`Exactly one observation ${id}`);return found[0]!}
 const call=(id:string)=>{const o=observation(id);assert.equal(o.kind,'call');return (o as Extract<Report['observations'][number],{kind:'call'}>).value}
 const image=(i:{name:string;sha256:string;size:number})=>{assert.ok(i);assert.match(i.name,/^conformance\/[a-z0-9-]+\.png$/);const b=read(i.name);assert.equal(b.length,i.size);assert.equal((awaitlessSha(b)),i.sha256);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a')}
 const scope=(spec:CallSpec,p:any)=>{
  const lines=p.body.split('\n').map((x:string)=>x.trim()).filter(Boolean),after=(name:string)=>{assert.equal(lines.filter((x:string)=>x===name).length,1);return lines[lines.indexOf(name)+1]}
  if(spec.grouped){assert.equal(lines[0],'Permission Request');assert.equal(lines[1],`${new URL(spec.origin).host} is requesting the following permissions`);assert.equal(lines[2],manifest(report.anchor).metanet.groupPermissions.description);same(p.checkboxStates.map((r:any)=>r.label).sort(),manifestLabels(report.anchor).sort());assert.ok(p.checkboxStates.every((r:any)=>r.checked===true));assert.equal(p.selections.length,0);return}
  assert.equal(after('Origin'),new URL(spec.origin).host);assert.equal(p.checkboxStates.length,0);assert.equal(p.selections.length,0)
  if(spec.category==='identity'){same(lines,['Protocol Permission','An application is requesting permission to use protocol \"identity key retrieval\" with security level 1.','Origin',new URL(spec.origin).host,'Protocol','identity key retrieval','Security','Level 1 · this app only','Allow','Deny']);return}
  if(spec.category==='basket'){assert.equal(lines[0],'Basket Access');assert.equal(after('Basket'),config.basket)}
  else if(spec.category==='certificate'){assert.equal(lines[0],'Certificate Access');assert.equal(after('Cert Type'),report.anchor.certificate.type);assert.equal(after('Fields'),'name')}
  else{assert.equal(lines[0],'Protocol Permission');assert.equal(after('Protocol'),spec.category==='protocol'?config.protocol[1]:spec.category==='counterparty-linkage'?`counterparty key linkage revelation ${peer}`:`specific key linkage revelation ${config.linkageProtocol[1]} ${config.linkageKeyID}`);assert.equal(after('Counterparty'),spec.category==='protocol'?peer:verifier);assert.equal(after('Security'),'Level 2 · this app and this recipient only')}
 }
 const check=async(id:string)=>{
  const s=call(id),spec=specs.get(id) as CallSpec;assert.equal(s.id,id);assert.equal(s.origin,spec.origin);assert.equal(new URL(s.pageUrl).origin,spec.origin);assert.equal(s.method,spec.method);same(s.args,spec.args)
  if(spec.expect==='cached'){assert.equal(s.prompts.length,0);assert.equal(s.submissionStart,s.submissionEnd)}else{
   assert.equal(s.prompts.length,1);const p=s.prompts[0]!;assert.equal(p.decision,spec.expect);assert.equal(p.pendingBeforeDecision,true);assert.equal(new URL(p.url).protocol,'chrome-extension:');assert.equal(new URL(p.url).hostname,report.extensionId);assert.equal(new URL(p.url).pathname,'/prompt.html');assert.equal(p.button,spec.grouped?spec.expect==='allow'?'Allow Selected':'Deny All':spec.expect==='allow'?'Allow':'Deny');scope(spec,p);verifyPermissionClick(p.trustedClick,p,s);image(p.screenshot)
  }
  assert.ok(Number.isSafeInteger(s.submissionStart)&&s.submissionStart>=report.submissionStart&&s.submissionEnd>=s.submissionStart&&s.submissionEnd<=report.submissionEnd)
  if(spec.expect==='deny'){assert.equal(s.outcome.status,'rejected');assert.equal(s.outcome.value,undefined);assert.match(s.outcome.error?.message??'',/permission.*denied|denied by user|user has denied|no user consent/i);assert.doesNotMatch(s.outcome.error.message,/timeout|timed out|unsupported|not implemented|network|fetch failed|insufficient|invalid parameter/i);assert.equal(s.submissionStart,s.submissionEnd);return}
  assert.equal(s.outcome.status,'fulfilled');assert.equal(s.outcome.error,undefined);const v=s.outcome.value
  if(spec.category==='identity')assert.equal(v.publicKey,report.identity)
  else if(spec.category==='grouped')assert.equal(v.authenticated,true)
  else if(spec.category==='protocol')assert.equal(v.publicKey,new KeyDeriver(PrivateKey.fromHex(config.peerKey)).derivePublicKey(config.protocol,config.keyID,report.identity,false).toString())
  else if(spec.category==='basket'){
   assert.equal(v.totalOutputs,1);assert.equal(v.outputs.length,1);const o=v.outputs[0];assert.equal(o.outpoint.replace('_','.'),report.anchor.outpoint);assert.equal(o.satoshis,report.anchor.satoshis);assert.equal(o.spendable,true)
   assert.ok(Array.isArray(v.BEEF)&&v.BEEF.length>0);for(let i=0;i<v.BEEF.length;i++)assert.ok(Object.hasOwn(v.BEEF,i)&&Number.isInteger(v.BEEF[i])&&v.BEEF[i]>=0&&v.BEEF[i]<=255,'Dense BEEF bytes required');const reader=new Utils.Reader(v.BEEF),beef=Beef.fromReader(reader);assert.ok(reader.eof(),'Trailing basket BEEF');const tx=Transaction.fromAtomicBEEF(beef.toBinaryAtomic(report.anchor.outpoint.split('.')[0]!)),index=Number(report.anchor.outpoint.split('.')[1]);assert.equal(tx.toHex(),report.anchor.rawTxHex);assert.equal(tx.outputs[index]?.satoshis,report.anchor.satoshis);assert.equal(tx.outputs[index]?.lockingScript.toHex(),report.anchor.lockingScript)
  }else if(spec.category==='certificate'){same(Object.keys(v.keyringForVerifier),['name']);const c=VerifiableCertificate.fromCertificate(report.anchor.certificate,v.keyringForVerifier);assert.ok(await c.verify());same(await c.decryptFields(new ProtoWallet(PrivateKey.fromHex(config.verifierKey))),config.fields)}
  else await verifyApprovedLinkage(spec.category,v,report.identity,s.startedAt,s.endedAt)
 }
 const restart=(id:string)=>{
  const o=observation(id);assert.equal(o.kind,'restart');const r=o.value as any;if(!r||report.mode==='REFERENCE')throw new PrerequisiteUnavailable('Real same-profile browser close/relaunch/unlock receipt unavailable')
  const index=actions.filter(a=>a.kind==='restart').findIndex(a=>a.id===id);assert.equal(r.schema,'tpnil-native-browser-restart@1');assert.equal(r.sequence,report.contextBaseSequence+index+1);assert.equal(r.profileBinding,report.contextProfileBinding);assert.equal(r.extensionId,report.extensionId);assert.equal(r.identity,report.identity);assert.equal(r.oldPagesClosed,true);assert.ok(Number.isSafeInteger(r.oldPageCount)&&r.oldPageCount>0);assert.equal(r.version,'yours-wallet-5.1.1');assert.equal(r.sandboxEvidence,`native-sandbox-restart-${r.sequence}.txt`);const sandbox=read(r.sandboxEvidence).toString();assert.match(sandbox,/PID namespaces\s+Yes/);assert.match(sandbox,/Seccomp-BPF sandbox\s+Yes/);assert.equal(read(`conformance/restart-${r.sequence}-unlocked.png`).subarray(0,8).toString('hex'),'89504e470d0a1a0a');const times=[r.startedAt,r.closedAt,r.openedAt,r.unlockedAt,r.endedAt].map(instant);assert.ok(times.every((n,i)=>!i||times[i-1]!<=n))
 }
 const revoke=(id:string)=>{
  const o=observation(id),spec=specs.get(id);assert.equal(o.kind,'revoke');assert.equal(spec?.kind,'revoke');const r=o.value as any;if(!r)throw new PrerequisiteUnavailable('Visible individual Settings revocation unavailable');const s=spec as Extract<typeof spec,{kind:'revoke'}>,e=r.dispatch;assert.equal(r.id,`sequence-${id}`);assert.equal(r.url,`chrome-extension://${report.extensionId}/index.html`);assert.ok(e);assert.equal(e.nonce,r.nonce);assert.equal(e.url,r.url);assert.equal(e.body,r.beforeBody);assert.equal(e.type,'click');assert.equal(e.isTrusted,true);assert.equal(e.visible,true);assert.equal(e.disabled,false);assert.equal(e.button,0);assert.ok([1,2].includes(e.eventPhase));assert.equal(e.expectedPage,true);assert.equal(e.expectedMainFrame,true);assert.equal(e.tag,'BUTTON');assert.equal(e.cardOrigin,new URL(s.origin).host);assert.equal(e.cardBody.split('\n').map((x:string)=>x.trim()).filter(Boolean)[0],e.cardOrigin);assert.ok(e.cardBody.includes(s.detail));assert.equal(e.cardBody,r.beforeCardBody);assert.ok(r.beforeBody.includes(e.cardBody));assert.ok(r.afterBody.includes(r.afterCardBody));assert.equal(r.afterCardBody.split('\n').map((x:string)=>x.trim()).filter(Boolean)[0],e.cardOrigin);assert.equal(e.text,'');assert.equal(r.automation.status,'fulfilled');same(e.parentText.split('\n').map((x:string)=>x.trim()).filter(Boolean),[s.category==='protocol'?'Protocol':'Certificate',s.detail]);assert.ok(r.beforeBody.includes(new URL(s.origin).host));assert.ok(r.beforeBody.includes(s.detail));assert.ok(!r.afterCardBody.includes(s.detail));assert.ok(instant(r.startedAt)<=instant(e.dispatchedAt)&&instant(e.dispatchedAt)<=instant(e.receivedAt)&&instant(e.receivedAt)<=instant(r.endedAt));image(r.before);image(r.after)
 }
 try{
  assert.equal(report.schema,'tpnil-native-permission-sequence@1.0.0');assert.equal(report.claim,'ENGINEERING_OBSERVATION_ONLY');assert.equal(report.nativeAdmission,false);assert.ok(['LAB_SELF_TEST_ONLY','REFERENCE','NATIVE_OBSERVATION'].includes(report.mode));assert.equal(report.identity,report.anchor.identity);assert.equal(report.programSha256,digest(actions));assert.match(report.identity,/^(02|03)[a-f0-9]{64}$/);assert.match(report.extensionId,/^[a-p]{32}$/);assert.equal(report.anchor.basket,config.basket);assert.equal(report.anchor.certificate.type,config.certificateType);assert.equal(report.anchor.satoshis,config.basketAmount);assert.equal(report.anchor.lockingScript,'51');assert.equal(report.anchor.certificate.serialNumber,config.certificateSerial);assert.equal(report.anchor.certificate.certifier,PrivateKey.fromHex(config.fixtureIssuerKey).toPublicKey().toString());assert.equal(report.anchor.certificate.subject,report.identity);assert.equal(report.anchor.certificate.revocationOutpoint,report.anchor.outpoint);assert.ok(await VerifiableCertificate.fromCertificate(report.anchor.certificate,{}).verify());assert.match(report.anchor.sourceEvidenceSha256,/^[a-f0-9]{64}$/);assert.match(report.contextProfileBinding,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(report.contextBaseSequence)&&report.contextBaseSequence>=0)
  same(report.observations.map(o=>[o.kind,o.id]),actions.map(a=>[a.kind,a.id]));assert.deepEqual(report.errors,[]);assert.ok(report.cleanup.pagesClosed&&report.cleanup.routesUnregistered);assert.equal(report.submissionPrefix.length,report.submissionStart);assert.equal(report.submissionSuffix.length,report.submissionEnd-report.submissionStart)
  await check('identity')
  const calls=report.observations.filter(o=>o.kind==='call').map(o=>(o as any).value);verifyPermissionCallNonces(calls);let last=instant(report.startedAt),lastSubmission=report.submissionStart
  for(const o of report.observations){if(!o.value)continue;const v=o.value as any;assert.ok(last<=instant(v.startedAt)&&instant(v.startedAt)<=instant(v.endedAt)&&instant(v.endedAt)<=instant(report.endedAt),'Exact sequential action intervals required');last=instant(v.endedAt);if(o.kind==='call'){assert.ok(v.submissionStart>=lastSubmission);lastSubmission=v.submissionEnd;assert.equal(v.outcome.requestNonce,v.requestNonce);assert.ok(instant(v.startedAt)<=instant(v.outcome.settledAt)&&instant(v.outcome.settledAt)<=instant(v.endedAt))}}
  same(report.freshness.origins,Object.values(config.origins));assert.ok(instant(report.startedAt)<=instant(report.freshness.at)&&instant(report.freshness.at)<=instant(calls[0].startedAt));if(report.freshness.kind==='PUBLIC_UI_OBSERVATION'){assert.ok(typeof report.freshness.body==='string');for(const origin of Object.values(config.origins))assert.ok(!report.freshness.body!.includes(new URL(origin).host),'Origin already has visible grants');image(report.freshness.image!)}
  same(report.manifests.map(m=>m.origin),[config.origins.denied,config.origins.grouped,config.origins.groupedAlternate]);for(const m of report.manifests){same(m.value,manifest(report.anchor));assert.equal(m.sha256,digest(m.value));assert.ok(m.requests.length>0);const first=calls.find(c=>c.origin===m.origin)!;assert.ok(instant(first.startedAt)<=instant(m.requests[0]!.at)&&instant(m.requests[0]!.at)<=instant(first.endedAt));for(const r of m.requests){assert.equal(r.sha256,m.sha256);assert.ok(instant(report.startedAt)<=instant(r.at)&&instant(r.at)<=instant(report.endedAt))}}
 }catch(error){commonError=error as Error}
 const chain=async(c:Category)=>{for(const suffix of ['deny-first','deny-repeat','approve','cached'])await check(`${c}-${suffix}`)}
 const predicates:Array<()=>Promise<void>>=[
  async()=>{for(const c of categories)await chain(c);restart('restart-grants');for(const c of categories)await check(`${c}-primary-after-restart`)},
  async()=>{restart('restart-grants');await check('identity-after-grant-restart');for(const c of categories){await check(`${c}-alternate-before-restart`);await check(`${c}-alternate-after-restart`);await check(`${c}-primary-after-restart`)}},
  async()=>{for(const c of ['protocol','certificate']){revoke(`revoke-${c}`);await check(`${c}-after-${c}-revoke`)}},
  async()=>{for(const c of categories){await check(`${c}-alternate-approve`);await check(`${c}-alternate-cached`)}for(const revoked of ['protocol','certificate']){revoke(`revoke-${revoked}`);restart(`restart-${revoked}-revoke`);await check(`identity-after-${revoked}-restart`);for(const c of categories)for(const suffix of [`after-${revoked}-revoke`,`alternate-after-${revoked}-revoke`,`after-${revoked}-restart`,`alternate-after-${revoked}-restart`])await check(`${c}-${suffix}`)}await check('protocol-reapprove');await check('protocol-reapproved-cached')},
  ()=>chain('counterparty-linkage'),()=>chain('specific-linkage'),
  async()=>{await check('manifest-first-deny');for(const c of categories)await check(`${c}-after-manifest-deny`)},
  async()=>{await check('manifest-primary-approve');for(const c of categories){await check(`${c}-grouped-primary`);await check(`${c}-grouped-alternate-deny`)}await check('manifest-alternate-approve');for(const c of categories){await check(`${c}-grouped-alternate`);await check(`${c}-grouped-primary-unaffected`)}}
 ]
 const outcomes=[]
 for(let i=0;i<rows.length;i++)try{if(commonError)throw commonError;await predicates[i]!();outcomes.push({id:rows[i]!,result:'BLOCKED',structuralAndCryptographicChecks:'SATISFIED',detail:'Prototype only: real provenance and complete parent browser/funding/authorization joins remain mandatory; no promotion override exists.'})}catch(error){outcomes.push({id:rows[i]!,result:error instanceof PrerequisiteUnavailable?'BLOCKED':'FAIL',structuralAndCryptographicChecks:error instanceof PrerequisiteUnavailable?'PREREQUISITE_MISSING':'REJECTED',detail:error instanceof Error?error.message:String(error)})}
 return{claim:'ENGINEERING_OBSERVATION_ONLY',nativeSessions:0,completeBRC100Conformance:false,acceptedNativeAssertions:0,outcomes,requiredPromotion:config.promotionRequired}
}
import { createHash } from 'node:crypto'
function awaitlessSha(bytes:Buffer){return createHash('sha256').update(bytes).digest('hex')}
