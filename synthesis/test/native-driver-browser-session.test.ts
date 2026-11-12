import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { PrivateKey, PublicKey } from '@bsv/sdk'
import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { activeNativeApplication } from '../src/wallet-lab/yours-driver.js'

// LAB_SELF_TEST_ONLY. Execute the driver's actual lexical restart, final public
// capture and shutdown closures. Browser primitives are controlled doubles; no
// native wallet result or UI qualification is inferred from this regression.
const filename = path.resolve(import.meta.dirname, '../src/wallet-lab/yours-driver.ts')
const text = fs.readFileSync(filename, 'utf8')
const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
function find<T extends ts.Node>(predicate: (node: ts.Node) => node is T): T {
  const matches: T[] = []
  const visit = (node: ts.Node) => { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit) }
  visit(source)
  expect(matches).toHaveLength(1)
  return matches[0]!
}
const applicationDeclaration = find((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(source) === 'application' && node.initializer?.getText(source) === 'await context.newPage()')
const applicationStatement = applicationDeclaration.parent.parent.getText(source)
const restartDeclaration = find((node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(source) === 'restartBrowser')
const finalCapture = find((node): node is ts.IfStatement => ts.isIfStatement(node) && node.expression.getText(source) === 'options.nativeActionReferenceEvidence').thenStatement.getText(source)
const shutdown = find((node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText(source) === 'closeBrowser').initializer.getText(source)
const identity = PrivateKey.fromHex('77'.repeat(32)).toPublicKey().toString()

class Browser {
  readonly pagesOwned: BrowserPage[] = []
  closed = false
  closeCount = 0
  version = 'yours-wallet-5.1.1'
  constructor(readonly name: string) {}
  async newPage() {
    if (this.closed) throw new Error('Browser context is closed')
    const page = new BrowserPage(this, `${this.name}-${this.pagesOwned.length}`)
    this.pagesOwned.push(page)
    return page
  }
  pages() { return this.pagesOwned.filter(page => !page.isClosed()) }
  serviceWorkers() { return [{ url: () => 'chrome-extension://fixture-extension/background.js', on: () => {} }] }
  async close() { this.closeCount++; this.closed = true; for (const page of this.pagesOwned) await page.close() }
}
class BrowserPage {
  closed = false
  evaluated = 0
  constructor(readonly browser: Browser, readonly name: string) {}
  context() { return this.browser }
  isClosed() { return this.closed }
  async close() { this.closed = true }
  async goto(_url: string) { if (this.closed) throw new Error('Page is closed') }
  async waitForFunction() {}
  getByPlaceholder() { return { fill: async () => {}, waitFor: async () => {} } }
  getByRole() { return { click: async () => {} } }
  async screenshot() { return Buffer.from('LAB_SELF_TEST_ONLY') }
  async evaluate(callback: () => Promise<unknown>) {
    if (this.closed || this.browser.closed) throw new Error('Page is closed')
    this.evaluated++
    // Evaluate the actual public-CWI callback in its own global scope.
    return new Function('window', `return (${callback.toString()})()`)(
      { CWI: { getVersion: async () => ({ version: this.browser.version }), getPublicKey: async (args: unknown) => {
        expect(args).toEqual({ identityKey: true, seekPermission: false })
        return { publicKey: identity }
      } } })
  }
}

async function driverClosures(versions: string[] = [], staleControl = false) {
  const original = new Browser('original'), opened: Browser[] = [], records = new Map<string, unknown>()
  const nativeActionReferences = vi.fn(async (value: string) => { expect(value).toBe(identity); return [{ txid: 'ab'.repeat(32), reference: 'cmVmZXJlbmNl' }] })
  const bindings = { context: original, options: { integratedProfile: 'ITCVE-1@4.0.0', nativeActionReferenceEvidence: true }, manualPromptActive: true,
    activeAutomaticPrompts: new Set(), browserContexts: [{ sequence: 0 }], profileBinding: 'LAB_SELF_TEST_ONLY_profile', extensionId: 'fixture-extension', expectedWalletVersion: 'yours-wallet-5.1.1',
    launchBrowser: async () => { const browser = new Browser(`restart-${opened.length + 1}`); browser.version = versions[opened.length] ?? browser.version; opened.push(browser); return browser },
    observePages: () => {}, consoleErrors: [], waitForText: async () => {}, within: async (_label: string, _timeout: number, operation: Promise<unknown>) => operation,
    evidence: { addJson: (name: string, value: unknown) => records.set(name, structuredClone(value)), addBytes: () => {} },
    services: { nativeActionReferences }, PublicKey, activeNativeApplication }
  let restart = restartDeclaration.initializer!.getText(source)
  let declaration = applicationStatement
  if (staleControl) {
    // Reproduce the original ownership bug: return the reopened page to the
    // scenario while the driver's outer const still points to its closed page.
    declaration = declaration.replace(/^let /, 'const ')
    restart = restart.replace('application = activeNativeApplication(context, nextApplication)', 'void 0')
      .replace('return { application, context, receipt }', 'return { application: nextApplication, context, receipt }')
  }
  const body = `return (async () => { let {${Object.keys(bindings).join(',')}} = bindings; ${declaration}
    const restartBrowser = ${restart}; return { restart: restartBrowser, capture: async () => ${finalCapture}, close: ${shutdown}, current: () => ({ application, context }) }; })()`
  const javascript = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const driver = await new Function('bindings', javascript)(bindings)
  return { driver, original, opened, records, nativeActionReferences }
}

describe('native driver application ownership across browser restart', () => {
  it('preserves the no-restart capture and closes the original context', async () => {
    const fixture = await driverClosures()
    await fixture.driver.capture()
    expect(fixture.nativeActionReferences).toHaveBeenCalledTimes(1)
    expect(fixture.original.pagesOwned[0]!.evaluated).toBe(1)
    await fixture.driver.close()
    expect(fixture.original.closeCount).toBe(1); expect(fixture.opened).toHaveLength(0)
  })

  it('captures through the replacement page and shuts down the replacement context', async () => {
    const fixture = await driverClosures(), oldPage = fixture.original.pagesOwned[0]!
    const returned = await fixture.driver.restart()
    expect(oldPage.isClosed()).toBe(true)
    expect(returned.application).toBe(fixture.driver.current().application)
    expect(returned.context).toBe(fixture.driver.current().context)
    expect(returned.receipt.oldPagesClosed).toBe(true)
    await fixture.driver.capture()
    expect(oldPage.evaluated).toBe(0)
    expect(returned.application.evaluated).toBe(2) // Restart identity check, then final public capture.
    expect(fixture.records.get('native-action-references.json')).toEqual({ identity, references: [{ txid: 'ab'.repeat(32), reference: 'cmVmZXJlbmNl' }] })
    await fixture.driver.close()
    expect(fixture.original.closeCount).toBe(1); expect(fixture.opened[0]!.closeCount).toBe(1)
  })

  it('keeps the newest page after multiple restarts', async () => {
    const fixture = await driverClosures(), first = await fixture.driver.restart(), second = await fixture.driver.restart()
    expect(first.application.isClosed()).toBe(true)
    await fixture.driver.capture()
    expect(fixture.driver.current().application).toBe(second.application)
    expect(fixture.nativeActionReferences).toHaveBeenCalledTimes(1)
    await fixture.driver.close()
    expect([fixture.original, ...fixture.opened].map(context => context.closeCount)).toEqual([1, 1, 1])
  })

  it('reproduces the stale outer-page failure even though the scenario received a new page', async () => {
    const fixture = await driverClosures([], true), replacement = await fixture.driver.restart()
    expect(replacement.application.isClosed()).toBe(false)
    expect(fixture.driver.current().application.isClosed()).toBe(true)
    await expect(fixture.driver.capture()).rejects.toThrow('active browser context')
    expect(fixture.nativeActionReferences).not.toHaveBeenCalled()
    await fixture.driver.close()
    expect(fixture.opened[0]!.closeCount).toBe(1)
  })

  it('closes the newly launched context when restart validation fails', async () => {
    const fixture = await driverClosures(['wrong-wallet-version'])
    await expect(fixture.driver.restart()).rejects.toThrow('Restart changed native wallet version')
    await expect(fixture.driver.capture()).rejects.toThrow('active browser context')
    expect(fixture.nativeActionReferences).not.toHaveBeenCalled()
    await fixture.driver.close()
    expect(fixture.original.closeCount).toBe(1); expect(fixture.opened[0]!.closeCount).toBe(1)
  })

  it('rejects a live foreign-context page and a closed owned page', async () => {
    const one = new Browser('one'), two = new Browser('two'), page = await one.newPage()
    expect(() => activeNativeApplication(two as unknown as BrowserContext, page as unknown as Page)).toThrow('active browser context')
    await page.close()
    expect(() => activeNativeApplication(one as unknown as BrowserContext, page as unknown as Page)).toThrow('active browser context')
  })
})
