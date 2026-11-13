import fs from 'node:fs'
import { chromium } from 'playwright'
import { describe, it, expect } from 'vitest'
import { observeExtensionControl } from '../src/wallet-lab/native/coverage-permissions-ui.js'
describe.skipIf(!fs.existsSync(chromium.executablePath()))('LAB_SELF_TEST_ONLY delayed control DOM', () => {
  it('captures the destination screen before arming the trusted click', async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage(); await page.setContent('<main>Coins</main>')
      await page.evaluate(() => { setTimeout(() => { document.body.innerHTML = '<main>Settings<button id="lock">Lock Wallet</button></main>' }, 200) })
      const images = new Map<string, Buffer>()
      const receipt = await observeExtensionControl({ evidence: { addBytes: (n: string, b: Buffer) => images.set(n, b) } } as any, page, page.locator('#lock'), 'lock')
      expect(receipt.beforeBody).toContain('Settings'); expect(receipt.beforeBody).not.toContain('Coins')
      expect(receipt.dispatch!.body).toBe(receipt.beforeBody); expect(receipt.dispatch!.isTrusted).toBe(true)
      expect(receipt.automation.status).toBe('fulfilled'); expect(images.size).toBe(2)
    } finally { await browser.close() }
  })
})

import { verifyPermissionExtensionPromptScope } from '../src/wallet-lab/native/coverage-permissions-verifier.js'
it('binds the revealed peer separately from the verifier in new linkage prompts', () => {
  const step = { origin: 'https://permission-extension.itcve.test', method: 'revealSpecificKeyLinkage', args: { counterparty: 'peer-a', verifier: 'verifier-a', protocolID: [2, 'scope protocol'], keyID: 'scope key' } } as any
  const prompt = { body: 'Protocol Permission\nOrigin\npermission-extension.itcve.test\nProtocol\nspecific key linkage revelation peer-a scope protocol scope key\nCounterparty\nverifier-a\nSecurity\nLevel 2 · this app and this recipient only', checkboxStates: [] } as any
  expect(() => verifyPermissionExtensionPromptScope(step, prompt, 'peer-protocol-key-v2')).not.toThrow()
  expect(() => verifyPermissionExtensionPromptScope({ ...step, args: { ...step.args, counterparty: 'peer-b' } }, prompt, 'peer-protocol-key-v2')).toThrow()
  expect(() => verifyPermissionExtensionPromptScope({ ...step, args: { ...step.args, verifier: 'verifier-b' } }, prompt, 'peer-protocol-key-v2')).toThrow()
  expect(() => verifyPermissionExtensionPromptScope(step, prompt)).toThrow()
})
