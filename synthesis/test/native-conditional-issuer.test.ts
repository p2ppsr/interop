import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { AuthFetch, MasterCertificate, PrivateKey, ProtoWallet, createNonce } from '@bsv/sdk'
import { createConditionalIssuer, conditionalIssuanceModes } from '../src/wallet-lab/native/conformance-conditional-issuer.js'
import { conditionalConfig as config } from '../src/wallet-lab/native/conformance-conditional-model.js'
import { verifyConditionalIssuance } from '../src/wallet-lab/native/verify-conformance-conditional.js'

describe('controlled authenticated native certificate issuer', () => {
  it('checks actual signed SDK requests and responses, rejects unauthenticated input, and detects forged retained evidence', async () => {
    const issuer = createConditionalIssuer(), client = new ProtoWallet(PrivateKey.fromHex('68'.repeat(32)))
    issuer.setRevocationOutpoint(`${'12'.repeat(32)}.0`)
    const server = http.createServer((req, res) => { void issuer.handle(req, res) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as any).port}`
    try {
      const authFetch = new AuthFetch(client as any)
      for (const mode of conditionalIssuanceModes) {
        issuer.setMode(mode)
        const encrypted = await MasterCertificate.createCertificateFields(client as any, issuer.identity, config.fields)
        const request = { clientNonce: await createNonce(client as any, issuer.identity), type: config.issuanceType, fields: encrypted.certificateFields, masterKeyring: encrypted.masterKeyring }
        const response = await authFetch.fetch(`${origin}/signCertificate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
        expect(response.status).toBe(200)
        expect(response.headers.get('x-bsv-auth-identity-key')).toBe(issuer.identity)
        await response.json()
      }
      const identity = (await client.getPublicKey({ identityKey: true })).publicKey
      const report: any = JSON.parse(JSON.stringify({ identity, issuer: { identity: issuer.identity, receipts: issuer.receipts, authMessages: issuer.authMessages } }))
      for (const mode of conditionalIssuanceModes) await verifyConditionalIssuance(report, mode)
      const unauthenticated = await fetch(`${origin}/signCertificate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(issuer.receipts[0]!.request) })
      expect(unauthenticated.status).toBe(401)
      expect(issuer.receipts).toHaveLength(conditionalIssuanceModes.length)
      const mutations: Array<(r: any) => void> = [
        r => { r.identity = issuer.identity },
        r => { r.issuer.receipts[0].request.clientNonce = r.issuer.receipts[1].request.clientNonce },
        r => { r.issuer.receipts[0].response.serverNonce = r.issuer.receipts[1].response.serverNonce },
        r => { r.issuer.receipts[0].response.certificate.serialNumber = Buffer.alloc(32).toString('base64') },
        r => { r.issuer.receipts[0].decryptedFields.name = 'forged' },
        r => { r.issuer.authMessages.find((m: any) => m.message.messageType === 'general').message.signature[4] ^= 1 },
        r => { r.issuer.authMessages = r.issuer.authMessages.filter((m: any) => m.direction !== 'outgoing') },
        r => { r.issuer.receipts.push(r.issuer.receipts[0]) }
      ]
      for (const mutate of mutations) { const forged = structuredClone(report); mutate(forged); await expect(verifyConditionalIssuance(forged, 'valid')).rejects.toThrow() }
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  }, 30_000)
})
