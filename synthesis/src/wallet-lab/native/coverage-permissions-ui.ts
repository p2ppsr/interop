// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from 'node:crypto'
import type { Locator, Page } from 'playwright'
import type { NativeScenarioContext } from '../yours-driver.js'
import type { ExtensionControl, ExtensionImage } from './coverage-permissions-model.js'
const now = () => new Date().toISOString()
export async function permissionExtensionImage(context: NativeScenarioContext, page: Page, name: string): Promise<ExtensionImage> {
  const bytes = await page.screenshot({ type: 'png', timeout: 5000 }); context.evidence.addBytes(name, bytes)
  return { name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
/** Observe the exact visible control, including icon-only revoke buttons and
 * the wallet's div-based Lock Wallet control. Never invokes wallet internals. */
export async function observeExtensionControl(context: NativeScenarioContext, page: Page, locator: Locator, id: string, settle?: () => Promise<void>): Promise<ExtensionControl> {
  const nonce = randomUUID(), binding = `__tpnilExtensionControl_${nonce.replaceAll('-', '')}`
  const receipt: ExtensionControl = { id, nonce, url: page.url(), startedAt: now(), endedAt: '', beforeBody: await page.locator('body').innerText(), afterBody: '', before: await permissionExtensionImage(context, page, `conformance/extension-ui-${id}-before.png`), after: undefined as any, dispatch: null, automation: { status: 'rejected', message: 'Not attempted' } }
  let receive!: () => void
  const received = new Promise<void>(resolve => { receive = resolve })
  await page.exposeBinding(binding, (source, event) => {
    if (receipt.dispatch !== null) return
    receipt.dispatch = { ...event, receivedAt: now(), expectedPage: source.page === page, expectedMainFrame: source.frame === page.mainFrame() }; receive()
  })
  await locator.evaluate((element, { nonce, binding }) => {
    element.addEventListener('click', (event: Event) => {
      if (!(event instanceof MouseEvent)) return
      const box = element.getBoundingClientRect()
      void (window as any)[binding]({ nonce, url: location.href, text: (element as HTMLElement).innerText.trim(), parentText: (element.parentElement as HTMLElement)?.innerText ?? '', tag: element.tagName, body: document.body.innerText, type: event.type, isTrusted: event.isTrusted, visible: box.width > 0 && box.height > 0, disabled: element instanceof HTMLButtonElement ? element.disabled : false, button: event.button, eventPhase: event.eventPhase, dispatchedAt: new Date().toISOString() })
    }, { capture: true, passive: true, once: true })
  }, { nonce, binding })
  try { await locator.click({ timeout: 5000 }); if (settle) await settle(); receipt.automation = { status: 'fulfilled' } }
  catch (error) { receipt.automation = { status: 'rejected', message: error instanceof Error ? error.message : String(error) } }
  if (receipt.dispatch === null) {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([received, new Promise<void>(resolve => { timer = setTimeout(resolve, 1000) })]); if (timer) clearTimeout(timer)
  }
  receipt.afterBody = await page.locator('body').innerText()
  receipt.after = await permissionExtensionImage(context, page, `conformance/extension-ui-${id}-after.png`); receipt.endedAt = now()
  return receipt
}
