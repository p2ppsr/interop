// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import type {Page} from 'playwright'
import type {EvidenceBundle} from '../../evidence.js'

type Provider = {id:string;providerUrl:string}
const lines = (text:string) => text.split('\n').map(line=>line.trim().toLowerCase())

export function selectActiveStorageSummary(summary:string, backups:string[], allowed:Provider[]) {
  const summaryLines=lines(summary)
  assert.equal(summaryLines.filter(line=>line==='active storage').length,1,'Exactly one Active Storage heading is required')
  const selected=allowed.filter(provider=>summaryLines.includes(new URL(provider.providerUrl).host.toLowerCase()))
  assert.equal(selected.length,1,'Active Storage must name exactly one admitted remote provider')
  const cards=[summary,...backups]
  const candidates=allowed.map(provider=>{
    const matches=cards.filter(card=>lines(card).includes(new URL(provider.providerUrl).host.toLowerCase()))
    assert.ok(matches.length<=1,'Duplicate provider cards are ambiguous')
    return {...provider,present:matches.length===1,card:matches[0]??null}
  })
  return {...selected[0]!,candidates}
}

/** Read the pinned wallet's Active Storage summary and its own detail view.
 * Backup-row buttons are not the active summary and carry no active badge. */
export async function observeActiveStorageSummary(page:Page, allowed:Provider[], stage:string, evidence:EvidenceBundle) {
  const startedAt=new Date().toISOString(),label=page.getByText('Active Storage',{exact:true})
  await label.waitFor({state:'visible'});assert.equal(await label.count(),1)
  const summary=label.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " w-full ") and contains(concat(" ", normalize-space(@class), " "), " rounded-xl ")][1]')
  assert.equal(await summary.count(),1)
  const activeSummary=await summary.innerText(),backups=await page.locator('button.w-full').allInnerTexts()
  const {id,providerUrl,candidates}=selectActiveStorageSummary(activeSummary,backups,allowed)
  const edit=summary.locator(':scope > div').first().locator('button'),sync=summary.getByRole('button',{name:'Sync Now',exact:true})
  const summaryButtons=await summary.locator('button').count(),summaryEditButtons=await edit.count(),summarySyncButtons=await sync.count()
  assert.equal(summaryButtons,2);assert.equal(summaryEditButtons,1);assert.equal(summarySyncButtons,1)
  const mainScreenshot=`conformance/transaction-branches-provider-cards-${stage}.png`,mainBytes=await page.screenshot();evidence.addBytes(mainScreenshot,mainBytes)
  await edit.click()
  await page.getByText(providerUrl,{exact:true}).waitFor()
  const card=await page.getByText(providerUrl,{exact:true}).evaluate(element=>{
    let current:Element|null=element
    while(current&&!(current.classList.contains('w-full')&&current.classList.contains('rounded-xl')))current=current.parentElement
    if(!current)throw Error('Exact remote provider detail card is absent')
    return(current as HTMLElement).innerText
  })
  assert.ok(lines(card).includes('in use'));assert.ok(!lines(card).includes('backup copy'))
  const makeActiveButtons=await page.getByRole('button',{name:'Make Active',exact:true}).count();assert.equal(makeActiveButtons,0)
  const screenshot=`conformance/transaction-branches-active-provider-${stage}.png`,bytes=await page.screenshot();evidence.addBytes(screenshot,bytes)
  return {kind:'NATIVE_REMOTE_BACKUP_UI',representation:'ACTIVE_STORAGE_SUMMARY_V3',id,providerUrl,candidates,
    activeSummary,summaryButtons,summaryEditButtons,summarySyncButtons,makeActiveButtons,activeCards:[activeSummary],mainScreenshot,
    mainScreenshotSha256:createHash('sha256').update(mainBytes).digest('hex'),url:page.url(),card,screenshot,
    screenshotSha256:createHash('sha256').update(bytes).digest('hex'),startedAt,endedAt:new Date().toISOString()}
}
