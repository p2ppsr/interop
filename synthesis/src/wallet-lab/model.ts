export type VectorOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE' | 'NOT_APPLICABLE'

export type WalletLabClaim = 'EXPERIMENTAL_CONFORMANCE_RESULT' | 'ENGINEERING_OBSERVATION_ONLY'

export interface ArtifactIdentity {
  id: string
  version: string
  sha256: string
  size: number
  sourceRevision?: string
  releaseUrl?: string
}

export const yoursPr368Artifact = Object.freeze({ id: 'yours-wallet-chromium-extension', version: '5.1.1-pr368.7e39006', sha256: 'b80e5a7572bdf11e568ecf41cbf439a0062605a5a2f196b53948b18e1b7fe10e', size: 13238310 })
/** Retired engineering artifacts remain candidates even after their active selector changes. */
export const retiredYoursCandidateArtifacts = Object.freeze([
  Object.freeze({ id: 'yours-wallet-chromium-extension', version: '5.1.1-pr368.f9faa', sha256: 'd550a0fefb5b2ccec844c47b02610b4f388128e564e3011ad46c2014f30f3a74', size: 13233045 })
])
export const yoursPr368Observer3Artifact = Object.freeze({"id": "yours-wallet-chromium-extension", "version": "5.1.1-pr368.cb3c2f2", "sha256": "0fff8b6ff51a0c54032e340bdc1878abf751f577ad94d6ee06146e336fd87cc3", "size": 13243164})
// Prospective intake is deliberately inadmissible until the exact CI artifact is retained.
export const yoursPr368Coverage1Artifact = Object.freeze({ id: 'yours-wallet-chromium-extension', version: '5.1.1-pr368.4a954ac', sha256: 'cd12b686c5295061bd4b727b32e17c3686e210fcdfa6aa2193790590458d9105', size: 13244753 })
export type YoursCandidateProfile = 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0'
/** A new candidate is inadmissible until its exact acquired artifact is pinned.
 * Executed 4.1 remains bound to its original artifact. */
export const yoursCandidateArtifactsByProfile: Readonly<Partial<Record<YoursCandidateProfile, Readonly<ArtifactIdentity>>>> = Object.freeze({
  'ITCVE-1@4.1.0': yoursPr368Artifact,
  'ITCVE-1@4.2.0': yoursPr368Observer3Artifact,
  'ITCVE-1@4.3.0': yoursPr368Coverage1Artifact,
  'ITCVE-1@4.4.0': yoursPr368Coverage1Artifact
})
export function identifiesYoursCandidate(wallet: ArtifactIdentity): boolean {
  return [...Object.values(yoursCandidateArtifactsByProfile), ...retiredYoursCandidateArtifacts].some(candidate => wallet.version === candidate.version || wallet.sha256 === candidate.sha256)
}
export function matchesYoursCandidate(wallet: ArtifactIdentity, profile: YoursCandidateProfile = 'ITCVE-1@4.1.0'): boolean {
  const artifact = yoursCandidateArtifactsByProfile[profile]
  return artifact !== undefined && Object.entries(artifact).every(([key, value]) => wallet[key as keyof ArtifactIdentity] === value)
}

export interface AssertionResult {
  id: string
  outcome: VectorOutcome
  detail: string
  evidence: string[]
}

export interface VectorResult {
  id: `ISI-4-V00${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  outcome: VectorOutcome
  assertions: AssertionResult[]
  limitations: string[]
}

export interface RouteObservation {
  sequence: number
  method: string
  host: string
  pathname: string
  disposition: 'controlled-wallet-storage' | 'controlled-service' | 'controlled-application' | 'blocked-egress'
  status?: number
}

export interface PermissionObservation {
  sequence: number
  origin: string
  kind: string
  decision: 'allow' | 'deny'
  summary: string
}

export interface WalletLabResult {
  schema: 'tpnil-isi4-wallet-run@1.0.0'
  claim: WalletLabClaim
  program: 'ISI-4@1.0.0' | 'ISI-4@2.0.0' | 'ISI-4@3.0.0' | 'ISI-4@4.0.0' | 'ISI-4@5.0.0' | 'ISI-4@5.1.0' | 'ISI-4@5.2.0' | 'ISI-4@5.3.0' | 'ISI-4@5.4.0'
  itcve: 'ITCVE-1@1.0.0' | 'ITCVE-1@1.1.0' | 'ITCVE-1@1.3.0' | 'ITCVE-1@1.4.0' | 'ITCVE-1@1.5.0' | 'ITCVE-1@2.0.0' | 'ITCVE-1@4.0.0' | 'ITCVE-1@4.1.0' | 'ITCVE-1@4.2.0' | 'ITCVE-1@4.3.0' | 'ITCVE-1@4.4.0'
  walletCandidate?: Record<string, unknown>
  profile: 'candidate-wallet-native-engineering' | 'production-wallet-todo-controlled-services' | 'production-wallet-native-conformance' | 'desktop-wallet-todo-controlled-services' | 'desktop-wallet-todo-declared-fixture-hook'
  runId: string
  startedAt: string
  endedAt: string
  runner: {
    os: string
    architecture: string
    node: string
    browser: string
    headless: boolean
  }
  artifacts: {
    wallet: ArtifactIdentity
    application: ArtifactIdentity
  }
  configuration: {
    serviceComponents?: Record<string, unknown>
    walletNetwork: string
    publicMainnetBroadcast: false | 'not-observed'
    applicationOrigin: string
    controlledDestinations: string[]
    undeclaredEgress: 'blocked' | 'not-observed'
    substrate?: 'brc100-http-json'
    walletUrl?: string
    promptAnswering?: 'attended' | 'declared-hook'
    fixtureEnvironment?: 'controlled-services' | 'declared-hook'
    walletSettings?: string[]
  }
  observations: {
    walletVersion: string
    walletNetwork: string
    authenticated: boolean
    fundingTxid: string
    createTxid?: string
    redeemTxid?: string
    routes: RouteObservation[]
    permissions: PermissionObservation[]
  }
  vectors: VectorResult[]
  semanticProjection: Record<string, string | number | boolean>
  evidence: Array<{ name: string; sha256: string; size: number }>
  outcome: VectorOutcome
}

export function aggregateOutcome(results: VectorResult[]): VectorOutcome {
  if (results.some(result => result.outcome === 'FAIL')) return 'FAIL'
  if (results.some(result => result.outcome === 'INCONCLUSIVE')) return 'INCONCLUSIVE'
  if (results.some(result => result.outcome === 'BLOCKED')) return 'BLOCKED'
  if (results.some(result => result.outcome === 'PASS')) return 'PASS'
  return 'NOT_APPLICABLE'
}
