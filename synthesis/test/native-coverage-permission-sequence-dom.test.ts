import fs from 'node:fs'
import { chromium } from 'playwright'
import { describe,it,expect } from 'vitest'
import { observeCardBoundRevoke } from '../src/wallet-lab/native/coverage-completion/permissions-driver.js'
import { config } from '../src/wallet-lab/native/coverage-completion/permissions-model.js'
describe.skipIf(!fs.existsSync(chromium.executablePath()))('LAB_SELF_TEST_ONLY real DOM card-origin capture, no wallet',()=>{
 it('captures the actually clicked alternate card despite identical permission rows elsewhere',async()=>{
  const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();const primary=new URL(config.origins.primary).host,alternate=new URL(config.origins.alternate).host,detail='Certificate access (name)'
   await page.setContent([primary,alternate].map((host,i)=>`<div id="card-${i}"><button><span>${host}</span></button><div id="row-${i}"><span>Certificate</span><span>${detail}</span><button id="revoke-${i}" onclick="this.parentElement.remove()"><svg width="10" height="10"></svg></button></div></div>`).join(''))
   const bytes=new Map<string,Buffer>(),context={evidence:{addBytes:(name:string,value:Buffer)=>bytes.set(name,value)}} as any
   const receipt=await observeCardBoundRevoke(context,page,page.locator('#revoke-1'),'dom-alternate',()=>page.locator('#row-1').waitFor({state:'hidden'}),page.locator('#card-1'))
   expect(receipt.dispatch.isTrusted).toBe(true);expect(receipt.dispatch.cardOrigin).toBe(alternate);expect(receipt.dispatch.cardBody).toContain(alternate);expect(receipt.dispatch.cardBody).not.toContain(primary);expect(receipt.beforeBody).toContain(primary);expect(receipt.beforeBody).toContain(alternate);expect(receipt.afterCardBody).not.toContain(detail);expect(receipt.afterBody).toContain(detail);expect(await page.locator('#row-0').count()).toBe(1);expect(bytes.size).toBe(2)
  }finally{await browser.close()}
 })
})
