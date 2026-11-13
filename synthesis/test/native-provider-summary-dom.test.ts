// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import {chromium} from 'playwright'
import {describe,expect,it} from 'vitest'
import {observeActiveStorageSummary} from '../src/wallet-lab/native/coverage-completion/provider-summary-observer.js'

describe.skipIf(!fs.existsSync(chromium.executablePath()))('LAB_SELF_TEST_ONLY exact active-summary DOM, no wallet',()=>{
 it('opens the summary detail when the backup button has no active badge',async()=>{
  const browser=await chromium.launch({headless:true})
  try {
   const page=await browser.newPage(),allowed=[{id:'source',providerUrl:'https://wallet.1sat.app'},{id:'replacement',providerUrl:'https://replacement-wallet.itcve.test'}]
   await page.setContent('<div class="w-full rounded-xl"><div><span style="text-transform:uppercase">Active Storage</span><button id="edit"><svg width="11" height="11"></svg></button></div><p>replacement-wallet.itcve.test</p></div><button class="w-full">wallet.1sat.app<br>Backup copy</button>')
   await page.locator('#edit').evaluate(element=>element.addEventListener('click',()=>{
    document.body.innerHTML='<div class="w-full rounded-xl"><p>replacement-wallet.itcve.test</p><span style="text-transform:uppercase">In use</span><p>https://replacement-wallet.itcve.test</p></div>'
   }))
   const bytes=new Map<string,Buffer>(),evidence={addBytes:(name:string,value:Buffer)=>bytes.set(name,value)} as any
   const receipt=await observeActiveStorageSummary(page,allowed,'initial',evidence)
   expect(receipt.id).toBe('replacement');expect(receipt.representation).toBe('ACTIVE_STORAGE_SUMMARY_V2')
   expect(receipt.activeSummary).toContain('ACTIVE STORAGE');expect(receipt.card).toContain('IN USE')
   expect(receipt.candidates.every(row=>row.present)).toBe(true);expect(bytes.size).toBe(2)
  } finally {await browser.close()}
 })
})
