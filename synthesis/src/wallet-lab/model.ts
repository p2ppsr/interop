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
  program: 'ISI-4@1.0.0'
  itcve: 'ITCVE-1@1.0.0' | 'ITCVE-1@1.1.0' | 'ITCVE-1@1.3.0'
  profile: 'production-wallet-todo-controlled-services' | 'desktop-wallet-todo-controlled-services' | 'desktop-wallet-todo-declared-fixture-hook'
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
