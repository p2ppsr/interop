import { createHash, randomUUID } from 'node:crypto'
import type { Page } from 'playwright'
import type { NativeScenarioContext } from '../yours-driver.js'
import { observePermissionClick, type PermissionClickReceipt } from './permission-click.js'

export interface CoverageCheckboxReceipt {
  nonce: string; callNonce: string; label: string; url: string; before: boolean; after: boolean
  startedAt: string; endedAt: string
  dispatch: null | { nonce: string; label: string; url: string; checked: boolean; type: string; isTrusted: boolean; expectedPage: boolean; expectedMainFrame: boolean; dispatchedAt: string; receivedAt: string }
}

export interface CoveragePermissionCall {
  id: string; origin: string; pageUrl: string; method: string; args: any; requestNonce: string
  startedAt: string; endedAt: string
  outcome: { status: 'pending' | 'fulfilled' | 'rejected' | 'timeout' | 'observer-error'; requestNonce?: string; settledAt?: string; value?: any; error?: any; message?: string }
  prompts: Array<{ url: string; body: string; observedAt: string; button: string; decision: 'allow' | 'deny'; pendingBeforeDecision: boolean; clickedAt: string; clickCompletedAt: string; trustedClick: PermissionClickReceipt; selections: CoverageCheckboxReceipt[]; screenshot: { name: string; sha256: string; size: number } }>
}
const now = () => new Date().toISOString()
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** One public request at a time, with passive trusted-click evidence. Unexpected
 * permission prompts are denied and retained; they cannot count as cache hits. */
export function createCoveragePermissionObserver(context: NativeScenarioContext) {
  const pages = new Map<string, Page>(), prompts = new Set<Page>(), steps: CoveragePermissionCall[] = [], screenshots = new Map<string, Buffer>()
  const pageFor = async (origin: string) => {
    if (origin === 'https://todo.itcve.test') return context.application
    let page = pages.get(origin)
    if (!page || page.isClosed()) {
      page = await context.context.newPage(); pages.set(origin, page)
      await page.goto(`${origin}/`, { timeout: 30_000 })
      await page.getByText('TPNIL boundary fixture', { exact: true }).waitFor({ timeout: 30_000 })
      await page.waitForFunction(() => typeof (window as any).CWI?.getPublicKey === 'function', undefined, { timeout: 30_000 })
    }
    return page
  }
  const request = async (id: string, origin: string, method: string, args: any, options: { decision?: 'allow' | 'deny'; promptText?: string[]; selectSpending?: boolean } = {}) => {
    if (steps.some(step => step.id === id)) throw new Error(`Duplicate permission coverage request ${id}`)
    const page = await pageFor(origin)
    const step: CoveragePermissionCall = { id, origin, pageUrl: page.url(), method, args: structuredClone(args), requestNonce: randomUUID(), startedAt: now(), endedAt: '', outcome: { status: 'pending' }, prompts: [] }
    steps.push(step)
    try {
      await page.evaluate(({ id, method, args, nonce }) => {
        const state = ((window as any).__tpnilCoverageRequests ??= {})
        state[id] = { status: 'pending', requestNonce: nonce }
        void Promise.resolve().then(() => (window as any).CWI[method](args)).then(value => {
          state[id] = { status: 'fulfilled', value, requestNonce: nonce, settledAt: new Date().toISOString() }
        }, error => {
          const fields: any = {}
          for (const key of new Set(['name', 'message', 'code', 'status', 'description', ...Object.getOwnPropertyNames(error ?? {})])) {
            if (key !== 'stack' && typeof error?.[key] !== 'function' && error?.[key] !== undefined) fields[key] = error[key]
          }
          state[id] = { status: 'rejected', error: fields, requestNonce: nonce, settledAt: new Date().toISOString() }
        })
      }, { id, method, args, nonce: step.requestNonce })
      const deadline = Date.now() + 25_000, handled = new Set<Page>()
      for (;;) {
        const state = await page.evaluate(id => (window as any).__tpnilCoverageRequests[id], id)
        if (state.status !== 'pending') { step.outcome = state; break }
        if (Date.now() >= deadline) { step.outcome = { status: 'timeout', message: 'Public request exceeded the declared 25-second interval' }; break }
        for (const popup of context.context.pages()) {
          if (popup.isClosed() || handled.has(popup) || !popup.url().startsWith(`chrome-extension://${context.extensionId}/prompt.html`)) continue
          let body: string
          try { body = await popup.locator('body').innerText({ timeout: 500 }) } catch { continue }
          if (!body.includes(new URL(origin).host) || !/Allow|Deny/.test(body)) continue
          if (options.promptText?.some(text => !body.includes(text))) continue
          const decision = options.decision ?? 'deny'
          const selections: CoverageCheckboxReceipt[] = []
          if (options.selectSpending && decision === 'allow') {
            // The manifest's spending grant is opt-in in the released native UI.
            const checkboxes = popup.getByRole('checkbox')
            for (const checkbox of await checkboxes.all()) {
              const label = await checkbox.evaluate(element => element.closest('label')?.textContent ?? element.parentElement?.textContent ?? '')
              if (/spend up to/i.test(label)) {
                const nonce = randomUUID(), binding = `__tpnilCheckbox_${nonce.replaceAll('-', '')}`
                const selection: CoverageCheckboxReceipt = { nonce, callNonce: step.requestNonce, label, url: popup.url(), before: await checkbox.isChecked(), after: false, startedAt: now(), endedAt: '', dispatch: null }
                let receive!: () => void
                const received = new Promise<void>(resolve => { receive = resolve })
                await popup.exposeBinding(binding, (source, event) => { if (!selection.dispatch) { selection.dispatch = { ...event, receivedAt: now(), expectedPage: source.page === popup, expectedMainFrame: source.frame === popup.mainFrame() }; receive() } })
                await popup.evaluate(({ nonce, binding, label }) => {
                  document.addEventListener('change', (event: Event) => {
                    const input = event.target
                    if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox' || (input.closest('label')?.textContent ?? input.parentElement?.textContent ?? '') !== label) return
                    void (window as any)[binding]({ nonce, label, url: location.href, checked: input.checked, type: event.type, isTrusted: event.isTrusted, dispatchedAt: new Date().toISOString() })
                  }, { capture: true, passive: true, once: true })
                }, { nonce, binding, label })
                await checkbox.check({ timeout: 5000 })
                if (!selection.dispatch) await Promise.race([received, pause(1000)])
                selection.after = await checkbox.isChecked(); selection.endedAt = now(); selections.push(selection)
              }
            }
            body = await popup.locator('body').innerText()
          }
          const buttonLocator = popup.getByRole('button', { name: decision === 'allow' ? /^Allow(?: Selected)?$/ : /^Deny(?: All)?$/ }).first()
          if (!(await buttonLocator.isVisible().catch(() => false))) continue
          const button = (await buttonLocator.innerText()).trim(), observedAt = now()
          const name = `conformance/coverage-${id}-${step.prompts.length}.png`
          const bytes = await popup.screenshot({ type: 'png', timeout: 5000 }); context.evidence.addBytes(name, bytes); screenshots.set(name, Buffer.from(bytes))
          prompts.add(popup); handled.add(popup)
          const pendingBeforeDecision = await page.evaluate(id => (window as any).__tpnilCoverageRequests[id]?.status === 'pending', id)
          const trustedClick = await observePermissionClick(popup, button, step.requestNonce)
          step.prompts.push({ url: trustedClick.popupUrl, body, observedAt, button, decision, pendingBeforeDecision, clickedAt: trustedClick.attemptStartedAt, clickCompletedAt: trustedClick.completedAt, trustedClick, selections, screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length } })
        }
        await pause(75)
      }
    } catch (error) { step.outcome = { status: 'observer-error', message: error instanceof Error ? error.message : String(error) } }
    step.endedAt = now()
    return step
  }
  return {
    steps, request, pageFor,
    readEvidence(name: string) { const bytes = screenshots.get(name); if (!bytes) throw new Error(`Missing coverage screenshot ${name}`); return Buffer.from(bytes) },
    async closePages() { for (const page of pages.values()) if (!page.isClosed()) await page.close(); pages.clear() },
    async close() {
      for (const page of [...pages.values(), ...prompts]) if (!page.isClosed()) await page.close()
      return { pagesClosed: [...pages.values(), ...prompts].every(page => page.isClosed()) }
    }
  }
}
