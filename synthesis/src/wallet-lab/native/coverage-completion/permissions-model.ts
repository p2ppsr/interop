// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PrivateKey } from '@bsv/sdk'
import type { CoveragePermissionCall } from '../coverage-permissions-observer.js'
import type { ExtensionControl } from '../coverage-permissions-model.js'
import type { NativeBrowserRestartReceipt } from '../../yours-driver.js'
import { permissionCoverageConfig } from '../conformance-permission-coverage-model.js'
export const canonical = (v: any): string => JSON.stringify(v, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value)
export const digest = (v: any): string => createHash('sha256').update(typeof v === 'string' ? v : canonical(v)).digest('hex')
export const rows = ['permissions.restart-persistence/denial-not-grant','permissions.restart-persistence/alternate-origin','permissions.revoke-persistence/single-immediate','permissions.revoke-persistence/unaffected-scope','permissions.linkage-decisions/counterparty-deny','permissions.linkage-decisions/specific-deny','permissions.manifest-selection/all-denied','permissions.manifest-selection/alternate-origin'] as const
export const categories = ['protocol','basket','certificate'] as const
export const allCategories = [...categories,'counterparty-linkage','specific-linkage'] as const
export type Category = typeof allCategories[number]
export const config = {
  origins: { primary:'https://permission-sequence.itcve.test',alternate:'https://permission-sequence-alt.itcve.test',denied:'https://permission-sequence-denied.itcve.test',grouped:'https://permission-sequence-group.itcve.test',groupedAlternate:'https://permission-sequence-group-alt.itcve.test' },
  protocol:[2,'tpnil prospective permission sequence'] as [2,string], keyID:'permission sequence key',
  linkageProtocol:[2,'tpnil prospective specific linkage'] as [2,string], linkageKeyID:'permission sequence linkage key',
  peerKey:'89'.repeat(32),verifierKey:'8a'.repeat(32), basket:permissionCoverageConfig.basket,
  basketAmount:permissionCoverageConfig.basketAmount,fixtureIssuerKey:permissionCoverageConfig.issuerKeyHex,certificateSerial:Buffer.alloc(32,permissionCoverageConfig.certificateSerialByte).toString('base64'),
  certificateType:Buffer.alloc(32,permissionCoverageConfig.certificateTypeByte).toString('base64'), fields:{name:permissionCoverageConfig.fields.name},
  maximumCalls:83,additionalRestarts:3,individualRevocations:2,callTimeoutMs:25000,restartBudgetMs:120000,
  promotionRequired:['new explicit profile and admitted origins','complete prior and final browser-context chain','independent original fixture/funding and provider ledger joins','exact authorization of permission-token mints and revocations','new bounded work order; current1500-second lane cannot absorb the worst-case sequence']
} as const
export const peer = PrivateKey.fromHex(config.peerKey).toPublicKey().toString(), verifier = PrivateKey.fromHex(config.verifierKey).toPublicKey().toString()
export interface Anchor { identity:string; certificate:any; basket:string; outpoint:string; satoshis:number; lockingScript:string; rawTxHex:string; sourceEvidencePath:string; sourceEvidenceSha256:string }
export type CallSpec={kind:'call';id:string;origin:string;category:Category|'identity'|'grouped';method:string;args:any;expect:'deny'|'allow'|'cached';grouped?:boolean}
export type Action=CallSpec|{kind:'restart';id:string}|{kind:'revoke';id:string;origin:string;category:'protocol'|'certificate';detail:string}
export function categoryCall(category:Category,anchor:Anchor){
 if(category==='protocol')return{method:'getPublicKey',args:{protocolID:config.protocol,keyID:config.keyID,counterparty:peer,forSelf:true,seekPermission:true}}
 if(category==='basket')return{method:'listOutputs',args:{basket:config.basket,include:'entire transactions',includeTags:true,includeCustomInstructions:true}}
 if(category==='certificate')return{method:'proveCertificate',args:{certificate:anchor.certificate,fieldsToReveal:['name'],verifier}}
 if(category==='counterparty-linkage')return{method:'revealCounterpartyKeyLinkage',args:{counterparty:peer,verifier}}
 return{method:'revealSpecificKeyLinkage',args:{counterparty:peer,verifier,protocolID:config.linkageProtocol,keyID:config.linkageKeyID}}
}
export function manifest(anchor:Anchor){return{name:'TPNIL prospective permission sequence',metanet:{groupPermissions:{description:'Prospective nonspending permission sequence',protocolPermissions:[{protocolID:config.protocol,counterparty:peer,description:'Sequence protocol access'}],basketAccess:[{basket:config.basket,description:'Sequence basket access'}],certificateAccess:[{type:anchor.certificate.type,verifierPublicKey:verifier,fields:['name'],description:'Sequence selective proof'}]}}}}
export function manifestLabels(anchor:Anchor){return[`${config.protocol[1]} (level 2) — ${peer.slice(0,10)}...Sequence protocol access`,`${config.basket}Sequence basket access`,`${anchor.certificate.type}Sequence selective proof — fields: name`]}
export function program(anchor:Anchor):Action[]{
 const actions:Action[]=[],o=config.origins
 const call=(id:string,origin:string,category:Category,expect:CallSpec['expect'],grouped=false)=>actions.push({kind:'call',id,origin,category,...categoryCall(category,anchor),expect,...grouped?{grouped:true}:{}})
 const identity=(id:string)=>actions.push({kind:'call',id,origin:o.primary,category:'identity',method:'getPublicKey',args:{identityKey:true},expect:id==='identity'?'allow':'cached'})
 const group=(id:string,origin:string,expect:'allow'|'deny')=>actions.push({kind:'call',id,origin,category:'grouped',method:'waitForAuthentication',args:{},expect,grouped:true})
 identity('identity')
 for(const c of allCategories)for(const [suffix,expect] of [['deny-first','deny'],['deny-repeat','deny'],['approve','allow'],['cached','cached']] as const)call(`${c}-${suffix}`,o.primary,c,expect)
 for(const c of categories)call(`${c}-alternate-before-restart`,o.alternate,c,'deny')
 actions.push({kind:'restart',id:'restart-grants'});identity('identity-after-grant-restart')
 for(const c of categories){call(`${c}-primary-after-restart`,o.primary,c,'cached');call(`${c}-alternate-after-restart`,o.alternate,c,'deny')}
 for(const c of categories){call(`${c}-alternate-approve`,o.alternate,c,'allow');call(`${c}-alternate-cached`,o.alternate,c,'cached')}
 for(const revoked of ['protocol','certificate'] as const){
  actions.push({kind:'revoke',id:`revoke-${revoked}`,origin:o.primary,category:revoked,detail:revoked==='protocol'?`${config.protocol[1]} · Level 2`:'Certificate access (name)'})
  for(const c of categories){call(`${c}-after-${revoked}-revoke`,o.primary,c,c===revoked?'deny':'cached');call(`${c}-alternate-after-${revoked}-revoke`,o.alternate,c,'cached')}
  actions.push({kind:'restart',id:`restart-${revoked}-revoke`});identity(`identity-after-${revoked}-restart`)
  for(const c of categories){call(`${c}-after-${revoked}-restart`,o.primary,c,c===revoked?'deny':'cached');call(`${c}-alternate-after-${revoked}-restart`,o.alternate,c,'cached')}
  if(revoked==='protocol'){call('protocol-reapprove',o.primary,'protocol','allow');call('protocol-reapproved-cached',o.primary,'protocol','cached')}
 }
 group('manifest-first-deny',o.denied,'deny');for(const c of categories)call(`${c}-after-manifest-deny`,o.denied,c,'deny',true)
 group('manifest-primary-approve',o.grouped,'allow');for(const c of categories)call(`${c}-grouped-primary`,o.grouped,c,'cached')
 for(const c of categories)call(`${c}-grouped-alternate-deny`,o.groupedAlternate,c,'deny',true)
 group('manifest-alternate-approve',o.groupedAlternate,'allow');for(const c of categories)call(`${c}-grouped-alternate`,o.groupedAlternate,c,'cached')
 for(const c of categories)call(`${c}-grouped-primary-unaffected`,o.grouped,c,'cached')
 assert.equal(actions.filter(a=>a.kind==='call').length,83);return actions
}
export type CallObservation=CoveragePermissionCall&{submissionStart:number;submissionEnd:number}
export interface Report {schema:'tpnil-native-permission-sequence@1.0.0';claim:'ENGINEERING_OBSERVATION_ONLY';mode:'LAB_SELF_TEST_ONLY'|'REFERENCE'|'NATIVE_OBSERVATION';nativeAdmission:false;identity:string;extensionId:string;programSha256:string;anchor:Anchor;startedAt:string;endedAt:string;observations:Array<{kind:'call';id:string;value:CallObservation}|{kind:'restart';id:string;value:NativeBrowserRestartReceipt|null;reason?:string}|{kind:'revoke';id:string;value:ExtensionControl|null;reason?:string}>;freshness:{kind:'PUBLIC_UI_OBSERVATION'|'UNAVAILABLE';origins:string[];at:string;body?:string;image?:{name:string;sha256:string;size:number}};manifests:Array<{origin:string;value:any;sha256:string;requests:Array<{at:string;sha256:string}>}>;contextBaseSequence:number;contextProfileBinding:string;errors:string[];cleanup:{pagesClosed:boolean;routesUnregistered:boolean};submissionStart:number;submissionEnd:number;submissionPrefix:any[];submissionSuffix:any[]}
