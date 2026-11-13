import { OverlayAdminTokenTemplate, PushDrop, Transaction, Utils, VerifiableCertificate, type WalletInterface } from '@bsv/sdk'
import { lookup, submit } from './overlay.js'

/** Publish a real, publicly disclosed certificate and signed SLAP advertisement
 * with the supplied wallet's ordinary createAction interface. The logical domain
 * is routed by ControlledWalletServices only inside the isolated native profile. */
export async function publishIdentityCertificate(options: { wallet: WalletInterface; origin: string; certificate: any; domain?: string; fixtureRevision?: 1 | 2; namespaceFixture?: 'validated-v2' }): Promise<any> {
  if (options.fixtureRevision !== undefined && ![1, 2].includes(options.fixtureRevision)) throw new Error('Unsupported identity publication fixture revision')
  const c = options.certificate
  const certificate = new VerifiableCertificate(c.type, c.serialNumber, c.subject, c.certifier, c.revocationOutpoint, c.fields, c.keyring, c.signature)
  if (!(await certificate.verify())) throw new Error('Cannot publish an invalid issuer signature')
  if ((await options.wallet.getPublicKey({ identityKey: true })).publicKey !== certificate.subject) throw new Error('Certificate subject differs from the publishing wallet')
  const script = await new PushDrop(options.wallet).lock([Utils.toArray(JSON.stringify(c), 'utf8')], [1, 'identity'], '1', 'anyone', options.fixtureRevision === 2)
  if (options.namespaceFixture !== undefined && options.namespaceFixture !== 'validated-v2') throw new Error('Unsupported identity namespace fixture')
  const validated = options.namespaceFixture === 'validated-v2'
  const domain = options.domain ?? 'https://overlay.itcve.test'
  const slap = validated
    ? await new PushDrop(options.wallet).lock([Utils.toArray('SLAP', 'utf8'), Utils.toArray(certificate.subject, 'hex'), Utils.toArray(domain, 'utf8'), Utils.toArray('ls_identity', 'utf8')], [2, 'service lookup availability'], '1', 'anyone', true)
    : await new OverlayAdminTokenTemplate(options.wallet).lock('SLAP', domain, 'ls_identity')
  const result = await options.wallet.createAction({ description: 'TPNIL signed identity discovery', outputs: [
    { lockingScript: script.toHex(), satoshis: 1, outputDescription: 'Selective identity disclosure', basket: validated ? 'tpnil identity' : 'tpnil-identity' },
    { lockingScript: slap.toHex(), satoshis: 1, outputDescription: 'Identity lookup advertisement', basket: validated ? 'tpnil discovery' : 'tpnil-discovery' }
  ], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } })
  if (!result.tx || !result.txid) throw new Error('Identity action did not finalize')
  const transaction = Transaction.fromAtomicBEEF(result.tx)
  if (transaction.id('hex') !== result.txid) throw new Error('Identity TXID differs from its BEEF')
  const receipt = await submit(options.origin, transaction, ['tm_identity', 'tm_slap'])
  const answer = await lookup(options.origin, 'ls_identity', { identityKey: certificate.subject })
  if (!answer.outputs.some((entry: any) => Transaction.fromBEEF(entry.beef).id('hex') === result.txid)) throw new Error('Published identity is absent from the real lookup service')
  return { ...(validated ? { namespaceFixture: 'validated-v2' } : {}), txid: result.txid, beef: transaction.toAtomicBEEF(), raw: transaction.toHex(), receipt, answer }
}
