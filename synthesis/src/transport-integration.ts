import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { Wallet } from '@bsv/wallet-toolbox'
import { ControlledWalletServices, type TeranodeWalletFundingFixture } from './wallet-lab/services.js'
import { createFixtureWallet } from './storage-sync/fixture-wallet.js'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.resolve(process.argv[2] ?? path.join(root, 'out/transport'))
const implementation = process.argv[3] ?? 'typescript'
if (!['typescript', 'go'].includes(implementation)) throw new Error('Storage must be typescript or go')
if (fs.existsSync(path.join(output, 'result.json'))) throw new Error('Refusing to overwrite retained result')
fs.mkdirSync(output, { recursive: true })
const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-transport-'))
fs.writeFileSync(path.join(webroot, 'index.html'), '<title>TPNIL transport integration</title>')
const services = new ControlledWalletServices({ webroot, components: { storage: implementation as 'typescript' | 'go' } })
const wallets: Wallet[] = []
const result: any = { schema: 'tpnil-component-result@1', claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY',
  components: { relay: '@bsv/wallet-relay@0.7.0', paidHttp: '@bsv/402-pay@0.3.5', sdk: '@bsv/sdk@4.0.1', storage: implementation },
  assertions: [], evidence: [], startedAt: new Date().toISOString() }
try {
  await services.start()
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/teranode/wab-funding-v1.json'), 'utf8')) as TeranodeWalletFundingFixture
  result.funding = await services.fundRemoteWalletFromTeranode('77'.repeat(32), fixture)
  const payer = await createFixtureWallet(services, '77'.repeat(32)); wallets.push(payer)
  const payee = await createFixtureWallet(services, '78'.repeat(32)); wallets.push(payee)
  const { qualifyRelay } = await import(pathToFileURL(path.join(root, 'components/transport/relay.mjs')).href)
  const { qualifyPaidHttp } = await import(pathToFileURL(path.join(root, 'components/transport/paid-http.mjs')).href)
  const relay = await qualifyRelay({ wallet: payer, onPaired: (remote: unknown) => qualifyPaidHttp({ payer: remote, payee, directory: output }) })
  const paid = relay.joined; delete relay.joined
  for (const [name, report] of [['relay', relay], ['paid-http', paid]] as const) {
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'), filename = `${name}.json`
    fs.writeFileSync(path.join(output, filename), bytes)
    result.evidence.push({ path: filename, sha256: createHash('sha256').update(bytes).digest('hex') })
    result.assertions.push(...report.assertions)
  }
} catch (error) {
  result.executionError = error instanceof Error ? error.stack : String(error)
  process.exitCode = 1
} finally {
  for (const wallet of wallets) await wallet.destroy()
  await services.close()
  fs.rmSync(webroot, { recursive: true, force: true })
  result.cleanup = { walletsClosed: true, controlledServicesClosed: true, temporaryWebrootRemoved: !fs.existsSync(webroot) }
  result.completedAt = new Date().toISOString()
  result.outcome = result.executionError || result.assertions.some((a: any) => a.result === 'FAIL') ? 'FAIL' : 'PASS'
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ outcome: result.outcome, assertions: result.assertions, executionError: result.executionError }))
}
