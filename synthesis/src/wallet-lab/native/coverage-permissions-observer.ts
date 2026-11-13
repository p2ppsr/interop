import { createHash, randomUUID } from 'node:crypto'
import type { Page, Locator } from 'playwright'
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
  prompts: Array<{ url: string; body: string; observedAt: string; button: string; decision: 'allow' | 'deny'; pendingBeforeDecision: boolean; clickedAt: string; clickCompletedAt: string; trustedClick: PermissionClickReceipt; selections: CoverageCheckboxReceipt[]; checkboxStates: Array<{ label: string; checked: boolean }>; screenshot: { name: string; sha256: string; size: number } }>
}
const now = () => new Date().toISOString()
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** A displayed spending grant is not ready while its asynchronous monthly
 * usage is absent. This parser admits no arbitrary suffix or changed cap. */
export function coverageSpendingSummary(cardBody: string, expectedCap: number): { cap: number; spent: number; remaining: number } | undefined {
  const lines = cardBody.split('\n').filter(line => line.startsWith('Up to '))
  if (lines.length !== 1) throw new Error('Exactly one expanded standing allowance is required')
  if (lines[0] === `Up to ${expectedCap} sats`) return undefined
  const match = /^Up to ([0-9]+) sats · ([0-9]+) sats spent this month · ([0-9]+) sats remaining$/.exec(lines[0]!)
  if (!match) throw new Error('Standing allowance usage has an unsupported visible shape')
  const [cap, spent, remaining] = match.slice(1).map(Number)
  if (![cap, spent, remaining].every(value => Number.isSafeInteger(value) && value! >= 0) || cap !== expectedCap || remaining !== Math.max(0, cap! - spent!)) throw new Error('Standing allowance usage cap or arithmetic changed')
  return { cap: cap!, spent: spent!, remaining: remaining! }
}

/** Wait for the public UI query, then require three unchanged body/card reads.
 * The subsequent trusted click still has to match this exact captured body.
 * A failed usage query is retained as an observer failure, never normalized. */
export async function waitForCoverageRevocationSnapshot(page: Pick<Page, 'locator'>, card: Pick<Locator, 'innerText'>, allowanceSatoshis?: number, timeoutMs = 10_000): Promise<{ beforeBody: string; cardBody: string }> {
  const deadline = Date.now() + timeoutMs
  let previous: { beforeBody: string; cardBody: string } | undefined, consecutive = 0
  do {
    const cardBody = await card.innerText({ timeout: Math.min(timeoutMs, 1000) })
    const beforeBody = await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 1000) })
    const ready = allowanceSatoshis === undefined || coverageSpendingSummary(cardBody, allowanceSatoshis) !== undefined
    if (ready && beforeBody.includes(cardBody)) {
      consecutive = previous?.beforeBody === beforeBody && previous.cardBody === cardBody ? consecutive + 1 : 1
      previous = { beforeBody, cardBody }
      if (consecutive >= 3) return previous
    } else { previous = undefined; consecutive = 0 }
    await pause(50)
  } while (Date.now() < deadline)
  throw new Error('Expanded permission card did not settle with visible spending usage before revocation')
}

/** Prospective permission-extension observer. Concurrent requests require distinct
 * IDs and exact promptText so their decisions cannot cross-bind. Unexpected
 * permission prompts are denied and retained; they cannot count as cache hits. */
export function createExtendedPermissionObserver(context: NativeScenarioContext, imageNamespace: 'extension' | 'sequence-v1' = 'extension') {
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
  const request = async (id: string, origin: string, method: string, args: any, options: { decision?: 'allow' | 'deny'; promptText?: string[]; selectSpending?: boolean; selectOnlyProtocol?: boolean } = {}) => {
    if (steps.some(step => step.id === id)) throw new Error(`Duplicate permission coverage request ${id}`)
    const page = await pageFor(origin)
    const step: CoveragePermissionCall = { id, origin, pageUrl: page.url(), method, args: structuredClone(args), requestNonce: randomUUID(), startedAt: now(), endedAt: '', outcome: { status: 'pending' }, prompts: [] }
    steps.push(step)
    try {
      await page.evaluate(({ id, method, args, nonce }) => {
        const state = ((window as any).__tpnilExtendedPermissionRequests ??= {})
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
        const state = await page.evaluate(id => (window as any).__tpnilExtendedPermissionRequests[id], id)
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
          if ((options.selectSpending || options.selectOnlyProtocol) && decision === 'allow') {
            // The manifest's spending grant is opt-in in the released native UI.
            const checkboxes = popup.getByRole('checkbox')
            for (const checkbox of await checkboxes.all()) {
              const label = await checkbox.evaluate(element => element.closest('label')?.textContent ?? element.parentElement?.textContent ?? '')
              const wanted = options.selectOnlyProtocol ? /protocol/i.test(label) : /spend up to/i.test(label) ? true : await checkbox.isChecked()
              if ((options.selectOnlyProtocol || /spend up to/i.test(label)) && await checkbox.isChecked() !== wanted) {
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
                await checkbox.setChecked(wanted, { timeout: 5000 })
                if (!selection.dispatch) await Promise.race([received, pause(1000)])
                selection.after = await checkbox.isChecked(); selection.endedAt = now(); selections.push(selection)
              }
            }
            body = await popup.locator('body').innerText()
          }
          const checkboxStates = await Promise.all((await popup.getByRole('checkbox').all()).map(async checkbox => ({ label: await checkbox.evaluate(element => element.closest('label')?.textContent ?? element.parentElement?.textContent ?? ''), checked: await checkbox.isChecked() })))
          const buttonLocator = popup.getByRole('button', { name: decision === 'allow' ? /^Allow(?: Selected)?$/ : /^Deny(?: All)?$/ }).first()
          if (!(await buttonLocator.isVisible().catch(() => false))) continue
          const button = (await buttonLocator.innerText()).trim(), observedAt = now()
          const name = `conformance/${imageNamespace}-${id}-${step.prompts.length}.png`
          const bytes = await popup.screenshot({ type: 'png', timeout: 5000 }); context.evidence.addBytes(name, bytes); screenshots.set(name, Buffer.from(bytes))
          prompts.add(popup); handled.add(popup)
          const pendingBeforeDecision = await page.evaluate(id => (window as any).__tpnilExtendedPermissionRequests[id]?.status === 'pending', id)
          const trustedClick = await observePermissionClick(popup, button, step.requestNonce)
          step.prompts.push({ url: trustedClick.popupUrl, body, observedAt, button, decision, pendingBeforeDecision, clickedAt: trustedClick.attemptStartedAt, clickCompletedAt: trustedClick.completedAt, trustedClick, selections, checkboxStates, screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length } })
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
