import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import type { BoundaryWallet } from '../boundary-corpus.js'
import type { ControlledWalletServices } from '../services.js'
import type { EvidenceBundle } from '../evidence.js'
import { issueFixtureCertificateForSubject } from '../certificate-fixture.js'
import { captureClauseError } from './conformance-clauses.js'
import { certificateStateConfig as config, certificateStatePolicy, certificateStatePolicySha256, type CertificateStateReport } from './conformance-certificate-states-model.js'
import { certificateStateRequests, deriveCertificateStateOutcomes } from './verify-certificate-states.js'

/** Independent external issuers and public wallet calls; no new funding, restart,
 * private wallet access, or network issuance. Legacy profiles never invoke this. */
export async function runNativeCertificateStates({ wallet, services, evidence, boundaryReport }: {
  wallet: BoundaryWallet; services: ControlledWalletServices; evidence: EvidenceBundle; boundaryReport: any
}): Promise<CertificateStateReport> {
  const identity = boundaryReport.trace.find((row: any) => row.method === 'getPublicKey' && row.args?.identityKey === true)?.result?.publicKey ?? ''
  const creation = boundaryReport.trace.find((row: any) => row.method === 'createAction' && row.args?.description === 'TPNIL boundary token pair')?.result
  const report: CertificateStateReport = { schema: 'tpnil-native-certificate-states@1.0.0', oracle: certificateStatePolicy.oracle,
    policySha256: certificateStatePolicySha256, claim: 'ENGINEERING_OBSERVATION_ONLY', identity,
    boundaryAnchor: creation?.txid && Array.isArray(creation.tx) ? { txid: creation.txid, atomicBeef: creation.tx, outputIndex: 1 } : null,
    fixtures: [], trace: [], errors: [], httpRequests: [], route: { host: 'certifier.itcve.test', registered: false, unregistered: false },
    routeStart: services.routes.length, routeEnd: services.routes.length, routes: [],
    submissionPrefix: services.submissions.map(value => ({ txid: value.txid, beefHex: Buffer.from(value.bytes).toString('hex'), verdict: value.verdict })), submissions: [],
    submissionStart: services.submissions.length, submissionEnd: services.submissions.length,
    assertions: [], result: 'BLOCKED', completeBRC100Conformance: false }
  let unregister: (() => void) | undefined
  try {
    if (!report.boundaryAnchor || !identity) throw Error('Required public boundary creation or identity was not returned')
    unregister = services.registerControlledRoute(report.route.host, async (request, response) => {
      report.httpRequests.push({ method: request.method ?? '', path: request.url ?? '' })
      response.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'This direct-certificate fixture must not request issuance' }))
    })
    report.route.registered = true
    for (let index = 0; index < 4; index++) {
      const issuer = new ProtoWallet(PrivateKey.fromHex(config.issuerKeys[index === 2 ? 1 : 0]!))
      const subject = index === 3 ? PrivateKey.fromHex(config.otherSubjectKey).toPublicKey().toString() : identity
      const certificate = await issueFixtureCertificateForSubject(issuer, subject, config.fields, config.types[index === 1 ? 1 : 0]!,
        async () => `${report.boundaryAnchor!.txid}.1`, config.serials[index]!)
      report.fixtures.push(JSON.parse(JSON.stringify(certificate)))
    }
    for (const [id, method, args] of certificateStateRequests(report)) {
      const row: CertificateStateReport['trace'][number] = { id, method, args: structuredClone(args),
        submissionStart: services.submissions.length, submissionEnd: services.submissions.length,
        httpStart: report.httpRequests.length, httpEnd: report.httpRequests.length, routeStart: services.routes.length, routeEnd: services.routes.length }
      report.trace.push(row)
      try { row.result = structuredClone(await wallet[method]!(structuredClone(args))) } catch (error) { row.error = captureClauseError(error) }
      row.submissionEnd = services.submissions.length; row.httpEnd = report.httpRequests.length
      row.routeEnd = services.routes.length
    }
  } catch (error) { report.errors.push(error instanceof Error ? error.message : String(error)) }
  finally { if (unregister) { unregister(); report.route.unregistered = true } }
  report.submissionEnd = services.submissions.length
  report.routeEnd = services.routes.length; report.routes = structuredClone(services.routes.slice(report.routeStart, report.routeEnd))
  report.submissions = services.submissions.slice(report.submissionStart, report.submissionEnd).map(value => ({ txid: value.txid, beefHex: Buffer.from(value.bytes).toString('hex'), verdict: value.verdict }))
  Object.assign(report, JSON.parse(JSON.stringify(report)))
  report.assertions = await deriveCertificateStateOutcomes(report)
  report.result = report.assertions.some(row => row.result === 'FAIL') ? 'FAIL' : report.assertions.some(row => row.result === 'BLOCKED') ? 'BLOCKED' : 'PASS'
  evidence.addJson('conformance/certificate-states.json', report)
  return report
}
