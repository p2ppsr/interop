import { randomUUID,createHash } from 'node:crypto'
import { PrivateKey,ProtoWallet,KeyDeriver,MasterCertificate,Transaction,Script } from '@bsv/sdk'
import { issueFixtureCertificateForSubject } from '../../../src/wallet-lab/certificate-fixture.js'
import { captureNativePermissionSequence,type Ports } from '../../../src/wallet-lab/native/coverage-completion/permissions-driver.js'
import { config,program,manifest,manifestLabels,digest,peer,verifier,type Anchor,type CallSpec } from '../../../src/wallet-lab/native/coverage-completion/permissions-model.js'
/** Synthetic UI/transport observations only, paired with real SDK cryptography.
 * These bytes never represent a browser action and cannot yield native PASS. */
export async function selftestFixture(funded=false){
 const subject=new ProtoWallet(PrivateKey.fromHex('8b'.repeat(32))),issuer=new ProtoWallet(PrivateKey.fromHex(config.fixtureIssuerKey)),identity=(await subject.getPublicKey({identityKey:true})).publicKey
 const source=new Transaction(1,[],[{lockingScript:Script.fromHex('51'),satoshis:config.basketAmount+1}])
 const transaction=new Transaction(1,funded?[{sourceTransaction:source,sourceOutputIndex:0,unlockingScript:Script.fromHex(''),sequence:0xffffffff}]:[],[{lockingScript:Script.fromHex('51'),satoshis:config.basketAmount}]),outpoint=`${transaction.id('hex')}.0`
 const certificate=await issueFixtureCertificateForSubject(issuer,identity,config.fields,config.certificateType,async()=>outpoint,config.certificateSerial,()=>Buffer.alloc(32,7))
 const plain=JSON.parse(JSON.stringify(certificate));delete plain.masterKeyring
 const proof={keyringForVerifier:await MasterCertificate.createKeyringForVerifier(subject,certificate.certifier,verifier,certificate.fields,['name'],certificate.masterKeyring,certificate.serialNumber)}
 const anchor:Anchor={identity,certificate:plain,basket:config.basket,outpoint,satoshis:config.basketAmount,lockingScript:'51',rawTxHex:transaction.toHex(),sourceEvidencePath:'LAB_SELF_TEST_ONLY/unfunded-fixture.json',sourceEvidenceSha256:'c'.repeat(64)}
 const evidence=new Map<string,Buffer>(),png=Buffer.from('89504e470d0a1a0a00000000','hex'),at=()=>new Date().toISOString(),extensionId='a'.repeat(32),profile='b'.repeat(64)
 const image=(name:string)=>{evidence.set(name,png);return{name,sha256:createHash('sha256').update(png).digest('hex'),size:png.length}}
 const manifests=Object.values(config.origins).slice(2).map(origin=>({origin,value:manifest(anchor),sha256:digest(manifest(anchor)),requests:[] as Array<{at:string;sha256:string}>}));let sequence=4
 const body=(s:CallSpec)=>s.category==='identity'?`Protocol Permission\nAn application is requesting permission to use protocol "identity key retrieval" with security level 1.\nOrigin\n${new URL(s.origin).host}\nProtocol\nidentity key retrieval\nSecurity\nLevel 1 · this app only\nAllow\nDeny`:s.grouped?`Permission Request\n${new URL(s.origin).host} is requesting the following permissions\n${manifest(anchor).metanet.groupPermissions.description}`:s.category==='basket'?`Basket Access\nOrigin\n${new URL(s.origin).host}\nBasket\n${config.basket}`:s.category==='certificate'?`Certificate Access\nOrigin\n${new URL(s.origin).host}\nCert Type\n${anchor.certificate.type}\nFields\nname`:`Protocol Permission\nOrigin\n${new URL(s.origin).host}\nProtocol\n${s.category==='protocol'?config.protocol[1]:s.category==='counterparty-linkage'?`counterparty key linkage revelation ${peer}`:`specific key linkage revelation ${config.linkageProtocol[1]} ${config.linkageKeyID}`}\nCounterparty\n${s.category==='protocol'?peer:verifier}\nSecurity\nLevel 2 · this app and this recipient only`
 const ports:Ports={mode:'LAB_SELF_TEST_ONLY',extensionId,contextBaseSequence:4,contextProfileBinding:profile,submissions:()=>[],close:async()=>true,
  freshness:async()=>({kind:'PUBLIC_UI_OBSERVATION',origins:Object.values(config.origins),at:at(),body:'No apps connected',image:image('conformance/sequence-fresh-origins.png')}),
  installManifests:async()=>({records:manifests,close(){}}),
  async request(s){const startedAt=at(),requestNonce=randomUUID();let value:any
   if(s.expect!=='deny'){
    if(s.category==='identity')value={publicKey:identity}
    else if(s.category==='grouped')value={authenticated:true}
    else if(s.category==='protocol')value={publicKey:new KeyDeriver(PrivateKey.fromHex(config.peerKey)).derivePublicKey(config.protocol,config.keyID,identity,false).toString()}
    else if(s.category==='basket')value={totalOutputs:1,outputs:[{outpoint,satoshis:config.basketAmount,spendable:true}],BEEF:transaction.toBEEF()}
    else if(s.category==='certificate')value=structuredClone(proof)
    else value=await (subject as any)[s.method](s.args)
   }
   const endedAt=at(),url=`chrome-extension://${extensionId}/prompt.html`,button=s.grouped?s.expect==='allow'?'Allow Selected':'Deny All':s.expect==='allow'?'Allow':'Deny',text=body(s),nonce=randomUUID()
   const m=manifests.find(m=>m.origin===s.origin);if(m&&m.requests.length===0)m.requests.push({at:startedAt,sha256:m.sha256})
   return{id:s.id,origin:s.origin,pageUrl:s.origin+'/',method:s.method,args:structuredClone(s.args),requestNonce,startedAt,endedAt,submissionStart:0,submissionEnd:0,outcome:s.expect==='deny'?{status:'rejected',requestNonce,settledAt:endedAt,error:{name:'Error',status:'error',code:'ERR_PERMISSION_DENIED',description:'The user denied the requested permission.',message:'User has denied permission'}}:{status:'fulfilled',requestNonce,settledAt:endedAt,value},prompts:s.expect==='cached'?[]:[{url,body:text,observedAt:startedAt,button,decision:s.expect,pendingBeforeDecision:true,clickedAt:startedAt,clickCompletedAt:startedAt,selections:[],checkboxStates:s.grouped?manifestLabels(anchor).map(label=>({label,checked:true})):[],screenshot:image(`conformance/extension-${s.id}-0.png`),trustedClick:{schema:'tpnil-native-permission-click@2',nonce,callNonce:requestNonce,popupUrl:url,button,armedAt:startedAt,attemptStartedAt:startedAt,completedAt:startedAt,automation:{status:'fulfilled',endedAt:startedAt},dispatch:{nonce,url,button,body:text,type:'click',isTrusted:true,visible:true,disabled:false,mouseButton:0,eventPhase:1,dispatchedAt:startedAt,receivedAt:startedAt,expectedPage:true,expectedMainFrame:true}}}]}
  },
  async revoke(s){const time=at(),nonce=randomUUID(),url=`chrome-extension://${extensionId}/index.html`,beforeBody=`${new URL(s.origin).host}\n${s.detail}`,afterBody=`${new URL(s.origin).host}\nOther grants retained`;return{id:`sequence-${s.id}`,nonce,url,startedAt:time,endedAt:time,beforeBody,afterBody,beforeCardBody:beforeBody,afterCardBody:afterBody,before:image(`conformance/extension-ui-sequence-${s.id}-before.png`),after:image(`conformance/extension-ui-sequence-${s.id}-after.png`),automation:{status:'fulfilled'},dispatch:{nonce,url,text:'',parentText:`${s.category==='protocol'?'Protocol':'Certificate'}\n${s.detail}`,cardOrigin:new URL(s.origin).host,cardBody:beforeBody,tag:'BUTTON',body:beforeBody,type:'click',isTrusted:true,visible:true,disabled:false,button:0,eventPhase:2,dispatchedAt:time,receivedAt:time,expectedPage:true,expectedMainFrame:true}}},
  async restart(){sequence++;const time=at();evidence.set(`native-sandbox-restart-${sequence}.txt`,Buffer.from('PID namespaces Yes\nSeccomp-BPF sandbox Yes'));image(`conformance/restart-${sequence}-unlocked.png`);return{schema:'tpnil-native-browser-restart@1',sequence,profileBinding:profile,extensionId,startedAt:time,closedAt:time,openedAt:time,unlockedAt:time,endedAt:time,oldPageCount:1,oldPagesClosed:true,version:'yours-wallet-5.1.1',identity,sandboxEvidence:`native-sandbox-restart-${sequence}.txt`}}
 }
 return{report:await captureNativePermissionSequence(anchor,ports),transaction,source,evidence,read:(name:string)=>{const value=evidence.get(name);if(!value)throw Error('Missing evidence '+name);return Buffer.from(value)},program:program(anchor)}
}
