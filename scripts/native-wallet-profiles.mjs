export const nativeWallet511Observer2Flag = '--conformance-5.1.1-observer-2'
export const nativeWallet511Observer2Variant = 'integrated-native-conformance-5.1.1-observer-2'
export const nativeWallet511Observer2PlanPath = 'infra/native/conformance/plan-5.1.1-observer-2.json'
export const nativeCandidateFlag = '--conformance-pr368-7e39006'
export const nativeCandidateVariant = 'integrated-native-conformance-pr368-7e39006'
export const nativeCandidatePlanPath = 'infra/native/conformance/plan-pr368-7e39006.json'
export const nativeCandidateVersion = '5.1.1-pr368.7e39006'

export const nativeWallet511Flag = '--conformance-5.1.1'
export const nativeWallet511Variant = 'integrated-native-conformance-5.1.1'
export const nativeWallet511PlanPath = 'infra/native/conformance/plan-5.1.1.json'

/** Only named, frozen profiles select an artifact or a new observer. */
export function selectNativeWalletProfile(flag) {
  const allowed = [undefined, '--integrated', '--integrated-trusted', '--conformance', '--conformance-coverage', '--conformance-closure', '--conformance-closure-rust-v3', nativeWallet511Flag, nativeCandidateFlag, nativeWallet511Observer2Flag]
  if (!allowed.includes(flag)) throw new Error('Unknown native qualification profile flag')
  const observer2 = flag === nativeWallet511Observer2Flag
  const candidate = flag === nativeCandidateFlag
  const wallet511 = candidate || observer2 || flag === nativeWallet511Flag
  const rustV3 = wallet511 || flag === '--conformance-closure-rust-v3'
  const closure = rustV3 || flag === '--conformance-closure'
  const coverage = closure || flag === '--conformance-coverage'
  const conformance = coverage || flag === '--conformance'
  const trustedIdentity = conformance || flag === '--integrated-trusted'
  const integrated = trustedIdentity || flag === '--integrated'
  const planPath = candidate ? nativeCandidatePlanPath : observer2 ? nativeWallet511Observer2PlanPath : wallet511 ? nativeWallet511PlanPath : closure ? 'infra/native/conformance/plan-coverage-closure.json' : coverage ? 'infra/native/conformance/plan-coverage.json' : conformance ? 'infra/native/conformance/plan.json' : trustedIdentity ? 'infra/native/integrated/plan-trusted.json' : integrated ? 'infra/native/integrated/plan.json' : 'infra/native/yours-go/plan.json'
  return { wallet511, rustV3, closure, coverage, conformance, trustedIdentity, integrated, planPath, walletVersion: candidate ? nativeCandidateVersion : wallet511 ? '5.1.1' : '5.1.0', ...(candidate ? { candidate: true, walletDirectory: 'yours-wallet-pr368-7e39006', walletManifestVersion: '5.1.1' } : {}), ...(observer2 ? { observerRevision: 2 } : {}) }
}
