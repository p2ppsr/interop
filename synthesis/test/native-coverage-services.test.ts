import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { ControlledWalletServices } from '../src/wallet-lab/services.js'

function request(proxy: string, host: string, pathname: string, method = 'GET'): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(proxy, { path: `http://${host}${pathname}`, method, headers: { host, origin: 'https://todo.itcve.test' }, timeout: 5000 }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString(), headers: response.headers }))
      response.on('error', reject)
    })
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Controlled route deadline exceeded'))); req.end()
  })
}

it('routes registered local issuance and allowance fixtures through the actual observed proxy and retires them', async () => {
  const webroot = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-coverage-routes-'))
  fs.writeFileSync(path.join(webroot, 'index.html'), '<title>route fixture</title>')
  const services = new ControlledWalletServices({ webroot }), observed: string[] = []
  const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => { observed.push(`${req.headers.host}${req.url}`); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ host: req.headers.host, path: req.url })) }
  try {
    await services.start()
    expect(() => services.registerControlledRoute('example.com', handler)).toThrow()
    for (const host of ['certifier.itcve.test', 'allowance.itcve.test']) {
      const before = await request(services.proxyUrl, host, '/manifest.json')
      expect(before.status).not.toBe(200)
      const retire = services.registerControlledRoute(host, handler)
      expect(() => services.registerControlledRoute(host, handler)).toThrow()
      expect(() => services.registerStorageCounterpart(host, services.storageUrl)).toThrow()
      const result = await request(services.proxyUrl, host, '/manifest.json')
      expect(result.status).toBe(200); expect(JSON.parse(result.body)).toEqual({ host, path: '/manifest.json' })
      expect(result.headers['access-control-allow-origin']).toBe('*')
      const preflight = await request(services.proxyUrl, host, '/manifest.json', 'OPTIONS')
      expect(preflight.status).toBe(204)
      expect(observed.filter(row => row === `${host}/manifest.json`)).toHaveLength(1)
      const routes = services.routes.filter(row => row.host === host)
      expect(routes.map(row => row.disposition)).toEqual(['blocked-egress', host.startsWith('allowance') ? 'controlled-application' : 'controlled-service', host.startsWith('allowance') ? 'controlled-application' : 'controlled-service'])
      retire(); retire()
      expect((await request(services.proxyUrl, host, '/manifest.json')).status).not.toBe(200)
      expect(services.routes.at(-1)?.disposition).toBe('blocked-egress')
      const nextRetire = services.registerControlledRoute(host, handler)
      retire() // A stale retirement must not remove a subsequent registration.
      expect((await request(services.proxyUrl, host, '/manifest.json')).status).toBe(200)
      nextRetire()
    }
  } finally { await services.close(); fs.rmSync(webroot, { recursive: true, force: true }) }
}, 30_000)
