import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { selectNativeWalletProfile, nativeCandidateFlag, nativeCandidateObserver3Flag, nativeWallet511Flag, nativeWallet511Observer2Flag } from '../scripts/native-wallet-profiles.mjs'
const root = path.resolve(import.meta.dirname, '..')
// Execute the worker's real startup declarations, stopping before any directory,
// process or browser side effect. This detects runner/worker handoff drift.
const source = fs.readFileSync(path.join(root, 'synthesis/src/wallet-lab/native/worker.ts'), 'utf8')
const begin = source.indexOf("const root = '/work'"), end = source.indexOf('fs.mkdirSync(output,')
assert.ok(begin >= 0 && end > begin)
const startup = source.slice(begin, end) + '\n;({planFile,walletRoot,walletVersion,observerRevision,plan})'
function execute(env, changePlan = value => value) {
  return vm.runInNewContext(startup, { process: { env }, path, fs: { readFileSync: filename => {
    assert.ok(filename.startsWith('/work/infra/native/'))
    return JSON.stringify(changePlan(JSON.parse(fs.readFileSync(path.join(root, filename.slice(6)), 'utf8'))))
  } } })
}
function environment(selected) {
  return { TPNIL_NATIVE_WALLET_VERSION: selected.walletVersion,
    ...(selected.observerRevision ? { TPNIL_NATIVE_OBSERVER_REVISION: String(selected.observerRevision) } : {}),
    ...Object.fromEntries(['closure', 'coverage', 'conformance', 'integrated', 'trustedIdentity'].filter(key => selected[key]).map(key => [`TPNIL_NATIVE_${key === 'trustedIdentity' ? 'IDENTITY_TRUST' : key.toUpperCase()}`, '1'])) }
}
for (const flag of [undefined, '--integrated', '--integrated-trusted', '--conformance', '--conformance-coverage', '--conformance-closure', nativeWallet511Flag, nativeWallet511Observer2Flag, nativeCandidateFlag, nativeCandidateObserver3Flag]) {
  test(`actual worker startup agrees with host selector ${flag ?? 'base'}`, () => {
    const selected = selectNativeWalletProfile(flag), result = execute(environment(selected))
    assert.equal(result.planFile, '/work/' + selected.planPath)
    assert.equal(result.walletVersion, selected.walletVersion)
    assert.equal(result.walletRoot, '/work/out/sut-artifacts/' + (selected.walletDirectory ?? 'yours-wallet-v' + selected.walletVersion))
  })
}
test('actual worker rejects candidate and observer downgrades before starting services', () => {
  const env = environment(selectNativeWalletProfile(nativeCandidateObserver3Flag))
  for (const change of [
    value => { delete value.TPNIL_NATIVE_OBSERVER_REVISION },
    value => { value.TPNIL_NATIVE_OBSERVER_REVISION = '2' },
    value => { value.TPNIL_NATIVE_WALLET_VERSION = '5.1.1' },
    value => { value.TPNIL_NATIVE_WALLET_VERSION = '5.1.1-pr368.7e39006' },
    value => { value.TPNIL_NATIVE_CLOSURE = '0' },
    value => { value.TPNIL_NATIVE_CONFORMANCE = '0' },
    value => { value.TPNIL_NATIVE_IDENTITY_TRUST = '0' },
    value => { value.TPNIL_NATIVE_INTEGRATED = '0' }
  ]) { const altered = { ...env }; change(altered); assert.throws(() => execute(altered)) }
  assert.throws(() => execute(env, plan => ({ ...plan, observerRevision: 2 })))
  assert.throws(() => execute(env, plan => ({ ...plan, wallet: { ...plan.wallet, version: '5.1.1' } })))
})
