export const nativeCandidateCoverage3OriginalPlanPath = 'infra/native/conformance/plan-pr368-coverage-3.json'
export const nativeCandidateCoverage3Flag = '--conformance-pr368-coverage-3'
export const nativeCandidateCoverage3Variant = 'integrated-native-conformance-pr368-coverage-3'
export const nativeCandidateCoverage3PlanPath = 'infra/native/conformance/plan-pr368-coverage-3-source-4.json'
export const nativeCandidateCoverage3Version = '5.1.1-pr368.3e8a97f'
export const nativeCandidateCoverage3Directory = 'yours-wallet-pr368-3e8a97f'
export const nativeCandidateCoverage2Flag = '--conformance-pr368-coverage-2'
export const nativeCandidateCoverage2Variant = 'integrated-native-conformance-pr368-coverage-2'
export const nativeCandidateCoverage2PlanPath = 'infra/native/conformance/plan-pr368-coverage-2.json'
export const nativeCandidateCoverage1Flag = '--conformance-pr368-coverage-1'
export const nativeCandidateCoverage1Variant = 'integrated-native-conformance-pr368-coverage-1'
export const nativeCandidateCoverage1PlanPath = 'infra/native/conformance/plan-pr368-coverage-1.json'
export const nativeCandidateCoverage1Version = '5.1.1-pr368.4a954ac'
export const nativeCandidateCoverage1Directory = 'yours-wallet-pr368-4a954ac'
export const nativeWallet511Observer2Flag = '--conformance-5.1.1-observer-2'
export const nativeWallet511Observer2Variant = 'integrated-native-conformance-5.1.1-observer-2'
export const nativeWallet511Observer2PlanPath = 'infra/native/conformance/plan-5.1.1-observer-2.json'
export const nativeCandidateFlag = '--conformance-pr368-7e39006'
export const nativeCandidateVariant = 'integrated-native-conformance-pr368-7e39006'
export const nativeCandidatePlanPath = 'infra/native/conformance/plan-pr368-7e39006.json'
export const nativeCandidateObserver3Flag = '--conformance-pr368-cb3c2f2-observer-3'
export const nativeCandidateObserver3Variant = 'integrated-native-conformance-pr368-cb3c2f2-observer-3'
export const nativeCandidateObserver3PlanPath = 'infra/native/conformance/plan-pr368-cb3c2f2-observer-3.json'
export const nativeCandidateObserver3Version = '5.1.1-pr368.cb3c2f2'
export const nativeCandidateVersion = '5.1.1-pr368.7e39006'

export const nativeWallet511Flag = '--conformance-5.1.1'
export const nativeWallet511Variant = 'integrated-native-conformance-5.1.1'
export const nativeWallet511PlanPath = 'infra/native/conformance/plan-5.1.1.json'

/** Only named, frozen profiles select an artifact or a new observer. */
export function selectNativeWalletProfile(flag) {
  const allowed = [undefined, '--integrated', '--integrated-trusted', '--conformance', '--conformance-coverage', '--conformance-closure', '--conformance-closure-rust-v3', nativeWallet511Flag, nativeCandidateFlag, nativeWallet511Observer2Flag, nativeCandidateObserver3Flag, nativeCandidateCoverage1Flag, nativeCandidateCoverage2Flag, nativeCandidateCoverage3Flag]
  if (!allowed.includes(flag)) throw new Error('Unknown native qualification profile flag')
  const completion = flag === nativeCandidateCoverage3Flag
  const recovery = flag === nativeCandidateCoverage2Flag
  const expanded = completion || recovery || flag === nativeCandidateCoverage1Flag
  const observer2 = flag === nativeWallet511Observer2Flag
  const observer3 = flag === nativeCandidateObserver3Flag
  const candidate = expanded || observer3 || flag === nativeCandidateFlag
  const wallet511 = candidate || observer2 || flag === nativeWallet511Flag
  const rustV3 = wallet511 || flag === '--conformance-closure-rust-v3'
  const closure = rustV3 || flag === '--conformance-closure'
  const coverage = closure || flag === '--conformance-coverage'
  const conformance = coverage || flag === '--conformance'
  const trustedIdentity = conformance || flag === '--integrated-trusted'
  const integrated = trustedIdentity || flag === '--integrated'
  const planPath = completion ? nativeCandidateCoverage3PlanPath : recovery ? nativeCandidateCoverage2PlanPath : expanded ? nativeCandidateCoverage1PlanPath : observer3 ? nativeCandidateObserver3PlanPath : candidate ? nativeCandidatePlanPath : observer2 ? nativeWallet511Observer2PlanPath : wallet511 ? nativeWallet511PlanPath : closure ? 'infra/native/conformance/plan-coverage-closure.json' : coverage ? 'infra/native/conformance/plan-coverage.json' : conformance ? 'infra/native/conformance/plan.json' : trustedIdentity ? 'infra/native/integrated/plan-trusted.json' : integrated ? 'infra/native/integrated/plan.json' : 'infra/native/yours-go/plan.json'
  return { wallet511, rustV3, closure, coverage, conformance, trustedIdentity, integrated, planPath, walletVersion: completion ? nativeCandidateCoverage3Version : expanded ? nativeCandidateCoverage1Version : observer3 ? nativeCandidateObserver3Version : candidate ? nativeCandidateVersion : wallet511 ? '5.1.1' : '5.1.0', ...(candidate ? { candidate: true, walletDirectory: completion ? nativeCandidateCoverage3Directory : expanded ? nativeCandidateCoverage1Directory : observer3 ? 'yours-wallet-pr368-cb3c2f2' : 'yours-wallet-pr368-7e39006', walletManifestVersion: '5.1.1' } : {}), ...(expanded ? { observerRevision: 3, coverageRevision: completion ? 3 : recovery ? 2 : 1 } : observer3 ? { observerRevision: 3 } : observer2 ? { observerRevision: 2 } : {}) }
}
