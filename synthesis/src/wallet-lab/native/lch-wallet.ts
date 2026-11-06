import type { WalletInterface } from '@bsv/sdk'

/** LCH 0.1.0 emits base64url BRC-29 derivation strings; BRC-100 storage
 * validates standard base64. Translate both key derivation and remittance at
 * this explicit integration boundary, preserving the underlying random bytes.
 * The same adapter is required for payer and recipient to derive matching keys.
 */
export function lchWalletBoundary(wallet: WalletInterface): WalletInterface {
  const canonical = (value: string): string => {
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) throw new Error('Invalid LCH BRC-29 derivation string')
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.length !== 32 || bytes.toString('base64url') !== value.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')) throw new Error('LCH BRC-29 derivation string must encode 32 bytes canonically')
    return bytes.toString('base64')
  }
  return new Proxy(wallet, { get(target, name) {
    if (name === 'getPublicKey') return (args: any) => {
      if (args.protocolID?.[0] === 2 && args.protocolID[1] === '3241645161d8') {
        const pieces = args.keyID.split(' ')
        if (pieces.length !== 2) throw new Error('LCH BRC-29 key ID must have a prefix and suffix')
        return target.getPublicKey({ ...args, keyID: pieces.map(canonical).join(' ') })
      }
      return target.getPublicKey(args)
    }
    if (name === 'internalizeAction') return (args: any) => target.internalizeAction({ ...args, outputs: args.outputs.map((output: any) => output.protocol === 'wallet payment' ? { ...output, paymentRemittance: { ...output.paymentRemittance, derivationPrefix: canonical(output.paymentRemittance.derivationPrefix), derivationSuffix: canonical(output.paymentRemittance.derivationSuffix) } } : output) })
    const value = Reflect.get(target, name)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}
