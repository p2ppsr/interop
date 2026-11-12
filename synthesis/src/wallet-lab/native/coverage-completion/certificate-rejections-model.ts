// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {conditionalConfig} from '../conformance-conditional-model.js'
export const canonical=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
export const digest=(v:any)=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex')
export const config={issuerOrigin:conditionalConfig.issuerOrigin,certificateType:conditionalConfig.certificateType,issuanceType:conditionalConfig.issuanceType,fields:conditionalConfig.fields,revealerKey:conditionalConfig.revealerKeyHex,verifierKey:conditionalConfig.verifierKeyHex,pageSize:32,maxInventory:128,maxPages:5,maxCalls:248,inventoryCuts:44,restarts:1,additionalApplicationPayments:0}
export const negativeCases=[
 ...[['missing-certificate','missing-certificate'],['missing-serverNonce','missing-server-nonce'],['invalid-serverNonce','bad-server-nonce'],['invalid-serial-HMAC','bad-serial'],['wrong-type','bad-type'],['wrong-subject','bad-subject'],['wrong-certifier','bad-certifier'],['altered-field','bad-fields'],['invalid-signature','bad-signature']].map(([id,mode])=>({id:`issuance.${id}`,row:`certificate.issuance/${id}`,kind:'issuance',mode})),
 ...['serialNumber','revocationOutpoint','signature','keyringRevealer','keyringForSubject'].map(field=>({id:`direct.missing-${field}`,row:`certificate.conditional-parameters/direct-missing-${field}`,kind:'direct',field})),
 {id:'issuance.missing-url',row:'certificate.conditional-parameters/issuance-missing-certifierUrl',kind:'missing-url'},
 ...['wrong-revealer','missing-field-key','wrong-field-key','tampered-signature'].map(mode=>({id:`direct.${mode}`,row:`certificate.direct-keyrings/${mode}`,kind:'direct',mode}))
] as Array<{id:string;row:string;kind:string;field?:string;mode?:string}>
assert.equal(negativeCases.length,19)
export const rows=[...negativeCases.map(c=>c.row),'certificate.direct-keyrings/distinct-revealer']
export const certificateKeys=['type','serialNumber','subject','certifier','revocationOutpoint','signature','fields']
export const certificateValue=(c:any)=>Object.fromEntries(certificateKeys.map(k=>[k,c[k]]))
export const tuple=(c:any)=>canonical([c.type,c.certifier,c.serialNumber])
export const serial=(runNonce:string,id:string)=>Buffer.from(digest(`tpnil:certificate-rejection:${runNonce}:${id}`),'hex').toString('base64')
export const listArgs=(offset:number)=>({certifiers:[],types:[],limit:config.pageSize,offset})
export interface RegistryRow {id:string;identityKey:string;componentIdentity:any}
export type OwnedSnapshot = import('../../native-owned-inventories.js').OwnedNativeCertificateInventories
export type Observation = import('../../native-owned-inventories.js').NativeInventoryObservation<OwnedSnapshot>
export interface Ports {
 wallet:any;identity:string;revocationOutpoint:string;runNonce:string;providerRegistry:RegistryRow[]
 submissions():any[];routes():any[];certificateObservations():Observation[];observeCertificates(identity:string):Promise<OwnedSnapshot>
 registerIssuer(handler:any):()=>void
 restart?():Promise<{wallet:any;receipt:any;kind:'NATIVE_BROWSER_RESTART'|'REFERENCE_CLIENT_REOPEN'}>
 progress?(report:any):void
}
export function issuanceArgs(issuer:string){return{type:config.issuanceType,certifier:issuer,acquisitionProtocol:'issuance',certifierUrl:config.issuerOrigin,fields:config.fields}}
export function directArgs(c:any,distinct=false){return{...certificateValue(c),acquisitionProtocol:'direct',keyringRevealer:distinct?c.revealer:'certifier',keyringForSubject:distinct?c.alternateKeyring:c.masterKeyring}}
export function negativeArgs(spec:typeof negativeCases[number],fixture:any,issuer:string){
 if(spec.kind==='issuance')return issuanceArgs(issuer)
 if(spec.kind==='missing-url'){const a:any=issuanceArgs(issuer);delete a.certifierUrl;return a}
 const a:any=directArgs(fixture,spec.mode==='wrong-revealer')
 if(spec.field)delete a[spec.field]
 if(spec.mode==='wrong-revealer')a.keyringRevealer='certifier'
 if(spec.mode==='missing-field-key')a.keyringForSubject={name:a.keyringForSubject.name}
 if(spec.mode==='wrong-field-key')a.keyringForSubject={...a.keyringForSubject,name:Buffer.alloc(32,1).toString('base64')}
 if(spec.mode==='tampered-signature')a.signature='00'.repeat(70)
 return a
}
