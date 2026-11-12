// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
export const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../../../..')
export const hash=(b:any)=>createHash('sha256').update(b).digest('hex')
export const config={sourceSatoshis:100,membershipSatoshis:2,sourceScript:'7551',membershipScript:'51',sourceBasket:'tpnil bb sources',ordinaryBasket:'tpnil bb removals',label:'tpnil-basket-boundary-prototype',maximumPublicCalls:80,maximumMutations:39,maximumSnapshots:80,maximumSignedTransactions:12,maximumActualFees:10000}
const lengths=[299,300,301,399,400,401]
const ascii=(length:number)=>`tpnil ${'a'.repeat(length-6)}`
const utf8=(length:number)=>`tpnil ${'é'.repeat(Math.floor((length-6)/2))}${(length-6)%2?'a':''}`
export const variants=[...lengths.map(n=>({id:`ascii-${n}`,row:`basket.ascii-length/bytes-${n}`,name:ascii(n),bytes:n,accepted:n<=300,methods:['internalizeAction','relinquishOutput']})),...lengths.map(n=>({id:`utf8-${n}`,row:`basket.unicode-and-namespace/utf8-${n}`,name:utf8(n),bytes:n,accepted:false,methods:['createAction','internalizeAction','relinquishOutput']})),...([{id:'admin-prefix',name:'admin bb'}, {id:'default',name:'default'}, {id:'reserved-p-prefix',name:'p tpnil bb'}].map(v=>({...v,row:`basket.unicode-and-namespace/${v.id}`,bytes:Buffer.byteLength(v.name),accepted:false,methods:['createAction','internalizeAction','relinquishOutput']})))]
for(const v of variants)assert.equal(Buffer.byteLength(v.name),v.bytes)
export const operations=variants.flatMap((v,index)=>v.methods.map(method=>({id:`${v.id}.${method}`,row:v.row,variantIndex:index,method,accepted:v.accepted,basket:v.name,sourceIndex:index-6,relinquishIndex:9+index,externalIndex:index})))
assert.equal(operations.length,39)
export const nativeArgs=()=>({description:'Basket boundary native source fixture',labels:[config.label],outputs:[...Array.from({length:9},(_,i)=>({satoshis:config.sourceSatoshis,lockingScript:config.sourceScript,basket:config.sourceBasket,outputDescription:`Boundary create source ${i}`,tags:[`bb source ${i}`],customInstructions:`bb:source:${i}`})),...variants.map((v,i)=>({satoshis:config.membershipSatoshis,lockingScript:config.membershipScript,basket:v.accepted?v.name:config.ordinaryBasket,outputDescription:`Boundary remove source ${i}`,tags:[`bb remove ${i}`],customInstructions:`bb:remove:${i}`}))],options:{randomizeOutputs:false,acceptDelayedBroadcast:false}})
export const externalArgs=()=>({description:'Basket boundary external insertion fixture',labels:[config.label],outputs:Array.from({length:16},(_v,i)=>({satoshis:config.membershipSatoshis,lockingScript:config.membershipScript,outputDescription:`Boundary insert source ${i}`})),options:{randomizeOutputs:false,acceptDelayedBroadcast:false}})
export function requestFor(operation:any,native:any,external:any){
 const {id,method,basket}=operation
 if(method==='createAction')return {description:`Basket boundary ${id}`,labels:[config.label],inputBEEF:native.tx,inputs:[{outpoint:`${native.txid}.${operation.sourceIndex}`,unlockingScript:'51',inputDescription:`Boundary isolated source ${operation.sourceIndex}`}],outputs:[{satoshis:2,lockingScript:'51',basket,outputDescription:'Boundary attempted create',tags:['bb created'],customInstructions:'bb:created'}],options:{randomizeOutputs:false,acceptDelayedBroadcast:false}}
 if(method==='internalizeAction')return {tx:external.tx,outputs:[{outputIndex:operation.externalIndex,protocol:'basket insertion',insertionRemittance:{basket,tags:[`bb inserted ${operation.externalIndex}`],customInstructions:`bb:inserted:${operation.externalIndex}`}}],labels:[config.label],description:`Basket boundary ${id}`}
 return {basket,output:`${native.txid}.${operation.relinquishIndex}`}
}
export const ordinaryControlArgs=(external:any)=>({tx:external.tx,outputs:[{outputIndex:15,protocol:'basket insertion',insertionRemittance:{basket:'tpnil bb insertion control',tags:['bb valid control'],customInstructions:'bb:control'}}],description:'Basket boundary valid insertion control',labels:[config.label]})
export const queryArgs=(basket:string)=>({basket,include:'locking scripts',includeTags:true,includeCustomInstructions:true,limit:10000})
export const policy={schema:'tpnil-native-basket-boundaries-policy@1.0.0',claim:'ENGINEERING_OBSERVATION_ONLY',completeBRC100Conformance:false,
 interpretation:'The pinned typed-interface300-byte and narrative400-byte limits conflict. ASCII301/399/400 remain interpretation-blocked. Unicode independently rejects the namespace grammar.',
 reservedRejection:{name:'Error',message:'Unsupported P-module scheme: p tpnil'},reservedRequestRejections:{createAction:'Unsupported P-basket scheme: p tpnil',internalizeAction:'Unsupported P-basket scheme: p tpnil',relinquishOutput:'Unsupported P-module scheme: p tpnil'},adminRejections:['admin bb','default'].map(basket=>({basket,name:'Error',message:`Basket “${basket}” is admin-only.`})),config,variants,operations,
 limits:['39 named mutation observations; planning-row acceptance requires the existing public listOutputs observations as well.','Reacquiring the public CWI handle establishes no browser restart or persisted-state claim.','Relinquishment retains the selected Go profile output metadata; the BRC membership obligation remains separate.','Complete native source, browser, funding, owned storage and final-provider ledger joins are mandatory.','No module refill: inputs derive from the completion profile declared native payments.']}
export const policySha256=hash(JSON.stringify(policy))
export function sourceCheck(){return {policy:policy.schema,policySha256}}
