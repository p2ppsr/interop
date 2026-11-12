// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Page,Locator } from 'playwright'
import { withNativePortabilitySettingsPage } from '../conformance-portability.js'
import path from 'node:path'
import type { NativeScenarioContext } from '../../yours-driver.js'
import { createExtendedPermissionObserver,waitForCoverageRevocationSnapshot } from '../coverage-permissions-observer.js'
import { permissionExtensionImage } from '../coverage-permissions-ui.js'
import { config,program,manifest,canonical,digest,type Action,type Anchor,type Report,type CallSpec } from './permissions-model.js'
const now=()=>new Date().toISOString()
export interface Ports {
 promptScopeRevision?:2;mode:Report['mode'];extensionId:string;contextBaseSequence:number;contextProfileBinding:string
 freshness():Promise<Report['freshness']>
 installManifests(anchor:Anchor):Promise<{records:Report['manifests'];close():void}>
 request(spec:CallSpec):Promise<Extract<Report['observations'][number],{kind:'call'}>['value']>
 revoke(spec:Extract<Action,{kind:'revoke'}>):Promise<Extract<Report['observations'][number],{kind:'revoke'}>['value']>
 restart():Promise<Extract<Report['observations'][number],{kind:'restart'}>['value']>
 submissions():any[];close():Promise<boolean>
}
/** Public observations only. The independent parent supplies whole-run
 * identities, browser chain, fixture/funding and authorization joins. */
export async function captureNativePermissionSequence(anchor:Anchor,ports:Ports):Promise<Report>{
 const actions=program(anchor),initial=ports.submissions(),report:Report={...(ports.promptScopeRevision?{promptScopeRevision:ports.promptScopeRevision}:{}),schema:'tpnil-native-permission-sequence@1.0.0',claim:'ENGINEERING_OBSERVATION_ONLY',mode:ports.mode,nativeAdmission:false,identity:anchor.identity,extensionId:ports.extensionId,programSha256:digest(actions),anchor:structuredClone(anchor),startedAt:now(),endedAt:'',observations:[],freshness:{kind:'UNAVAILABLE',origins:Object.values(config.origins),at:now()},manifests:[],contextBaseSequence:ports.contextBaseSequence,contextProfileBinding:ports.contextProfileBinding,errors:[],cleanup:{pagesClosed:false,routesUnregistered:false},submissionStart:initial.length,submissionEnd:initial.length,submissionPrefix:initial,submissionSuffix:[]}
 let installed:Awaited<ReturnType<Ports['installManifests']>>|undefined
 try{
  report.freshness=await ports.freshness();installed=await ports.installManifests(anchor);report.manifests=installed.records
  for(const action of actions){
   if(action.kind==='call')report.observations.push({kind:'call',id:action.id,value:await ports.request(action)})
   else if(action.kind==='revoke')report.observations.push({kind:'revoke',id:action.id,value:await ports.revoke(action)})
   else report.observations.push({kind:'restart',id:action.id,value:await ports.restart()})
  }
 }catch(error){report.errors.push(error instanceof Error?error.message:String(error))}
 finally{
  try{report.cleanup.pagesClosed=await ports.close()}catch(error){report.errors.push(String(error))}
  try{installed?.close();report.cleanup.routesUnregistered=Boolean(installed)}catch(error){report.errors.push(String(error))}
  const final=ports.submissions();report.submissionEnd=final.length;report.submissionSuffix=final.slice(initial.length);report.endedAt=now()
 }
 return report
}
/** Existing public observer/UI interfaces only. Construction does not run it.
 * No wallet permission manager, storage write, credential or grant seeding API. */
export function nativePermissionSequencePorts(context:NativeScenarioContext,contextBaseSequence:number,contextProfileBinding:string):Ports{
 const observer=createExtendedPermissionObserver(context),services=context.services
 const withSettings = <T>(operation: (page: Page) => Promise<T>): Promise<T> => withNativePortabilitySettingsPage(context.application, context.extensionId, async page => {
  await page.getByText('Settings',{exact:true}).last().click({timeout:10000})
  await page.getByText('Permissions',{exact:true}).first().click({timeout:10000})
  await page.getByText('Loading permissions...',{exact:true}).waitFor({state:'hidden',timeout:10000})
  return operation(page)
 })
 return{
  ...(services.submissionOrdering?{promptScopeRevision:2 as const}:{}),mode:'NATIVE_OBSERVATION',extensionId:context.extensionId,contextBaseSequence,contextProfileBinding,
  submissions:()=>structuredClone(services.submissions.map(row=>({txid:row.txid,beefHex:Buffer.from(row.bytes).toString('hex'),verdict:row.verdict}))),
  async freshness(){return withSettings(async p=>{return{kind:'PUBLIC_UI_OBSERVATION',origins:Object.values(config.origins),at:now(),body:await p.locator('body').innerText(),image:await permissionExtensionImage(context,p,'conformance/sequence-fresh-origins.png')}})},
  async installManifests(anchor){const records:Report['manifests']=[],remove:Array<()=>void>=[];for(const[key,origin]of Object.entries(config.origins)){
   const grouped=['denied','grouped','groupedAlternate'].includes(key),value=manifest(anchor),record={origin,value,sha256:digest(value),requests:[] as Array<{at:string;sha256:string}>};if(grouped)records.push(record)
   remove.push(services.registerControlledRoute(new URL(origin).host,async(req,res)=>{const url=new URL(req.url??'/',origin);if(req.method==='GET'&&url.pathname==='/manifest.json'&&!url.search&&grouped){record.requests.push({at:now(),sha256:digest(value)});res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(canonical(value))}else if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><h1>TPNIL boundary fixture</h1><p>Prospective permission sequence</p>')}else{res.writeHead(404);res.end('Not found')}}))
  }return{records,close(){for(const fn of remove)fn()}}},
  async request(spec){const start=services.submissions.length;const value=await observer.request(spec.id,spec.origin,spec.method,spec.args,{decision:spec.expect==='allow'?'allow':'deny'});return Object.assign(value,{submissionStart:start,submissionEnd:services.submissions.length})},
  async revoke(spec){return withSettings(async p=>{const header=p.getByRole('button').filter({has:p.getByText(new URL(spec.origin).host,{exact:true})});await header.click();const card=header.locator('..'),detail=card.getByText(spec.detail,{exact:true});if(await detail.count()!==1)throw Error('Exact individual permission row is ambiguous');const row=detail.locator('..'),button=row.getByRole('button');if(await button.count()!==1)throw Error('Exact individual revoke control is ambiguous');return await observeCardBoundRevoke(context,p,button,`sequence-${spec.id}`,()=>detail.waitFor({state:'hidden',timeout:10000}),card)})},
  async restart(){if(!context.restartBrowser)return null;await observer.closePages();const next=await context.restartBrowser();context.context=next.context;context.application=next.application;return next.receipt},
  async close(){const result=await observer.close();context.evidence.flush();return result.pagesClosed}
 }
}
export const readNativeSequenceEvidence=(context:NativeScenarioContext)=>(name:string)=>fs.readFileSync(path.join(context.evidence.directory,'evidence',name))

/** Same passive public UI contract, with the actual clicked card's origin
 * captured inside the very same event as the existing dispatch fields. */
export async function observeCardBoundRevoke(context:NativeScenarioContext,page:Page,locator:Locator,id:string,settle:()=>Promise<void>,card:Locator){
 const snapshot=await waitForCoverageRevocationSnapshot(page,card)
 const nonce=randomUUID(),binding=`__tpnilSequenceRevoke_${nonce.replaceAll('-','')}`,receipt:any={id,nonce,url:page.url(),startedAt:now(),endedAt:'',beforeBody:snapshot.beforeBody,beforeCardBody:snapshot.cardBody,afterBody:'',afterCardBody:'',before:await permissionExtensionImage(context,page,`conformance/extension-ui-${id}-before.png`),after:undefined,dispatch:null,automation:{status:'rejected',message:'Not attempted'}}
 let receive!:()=>void;const received=new Promise<void>(resolve=>{receive=resolve})
 await page.exposeBinding(binding,(source,event)=>{if(receipt.dispatch)return;receipt.dispatch={...event,receivedAt:now(),expectedPage:source.page===page,expectedMainFrame:source.frame===page.mainFrame()};receive()})
 await locator.evaluate((element,{nonce,binding,origins})=>{
  element.addEventListener('click',(event:Event)=>{
   if(!(event instanceof MouseEvent))return
   let card:Element|null=element.parentElement,labels:string[]=[]
   while(card){labels=origins.filter(origin=>Array.from(card!.querySelectorAll('button *')).some(child=>child.childElementCount===0&&child.textContent?.trim()===origin));if(labels.length)break;card=card.parentElement}
   const box=element.getBoundingClientRect()
   void(window as any)[binding]({nonce,url:location.href,text:(element as HTMLElement).innerText.trim(),parentText:(element.parentElement as HTMLElement)?.innerText??'',tag:element.tagName,body:document.body.innerText,cardOrigin:labels.length===1?labels[0]:null,cardBody:(card as HTMLElement|null)?.innerText??'',type:event.type,isTrusted:event.isTrusted,visible:box.width>0&&box.height>0,disabled:element instanceof HTMLButtonElement?element.disabled:false,button:event.button,eventPhase:event.eventPhase,dispatchedAt:new Date().toISOString()})
  },{capture:true,passive:true,once:true})
 },{nonce,binding,origins:Object.values(config.origins).map(origin=>new URL(origin).host)})
 try{await locator.click({timeout:5000});await settle();receipt.automation={status:'fulfilled'}}catch(error){receipt.automation={status:'rejected',message:String(error)}}
 if(!receipt.dispatch){let timer:ReturnType<typeof setTimeout>|undefined;await Promise.race([received,new Promise<void>(resolve=>{timer=setTimeout(resolve,1000)})]);if(timer)clearTimeout(timer)}
 receipt.afterCardBody=await card.innerText();receipt.afterBody=await page.locator('body').innerText();receipt.after=await permissionExtensionImage(context,page,`conformance/extension-ui-${id}-after.png`);receipt.endedAt=now();return receipt
}
