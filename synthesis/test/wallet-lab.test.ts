import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EvidenceBundle, redactEvidence, verifyEvidenceBundle, verifyWalletRunSeries } from '../src/wallet-lab/evidence.js'
import { retiredYoursCandidateArtifacts, yoursPr368Artifact } from '../src/wallet-lab/model.js'

describe('wallet laboratory evidence', () => {
  it('redacts secret-bearing fields recursively', () => {
    expect(redactEvidence({ password: 'secret', nested: { rootKeyHex: 'private', publicKey: 'public' } })).toEqual({
      password: '[REDACTED]',
      nested: { rootKeyHex: '[REDACTED]', publicKey: 'public' }
    })
  })

  it('writes and independently verifies content-addressed evidence', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-evidence-test-'))
    try {
      const bundle = new EvidenceBundle(directory)
      bundle.addJson('observation.json', { status: 'observed', password: 'fixture-secret' })
      const record = bundle.write({
        schema: 'tpnil-isi4-wallet-run@1.0.0',
        claim: 'ENGINEERING_OBSERVATION_ONLY',
        program: 'ISI-4@1.0.0',
        itcve: 'ITCVE-1@1.0.0',
        profile: 'production-wallet-todo-controlled-services',
        runId: 'unit-test',
        startedAt: '2026-09-20T00:00:00.000Z',
        endedAt: '2026-09-20T00:00:01.000Z',
        runner: { os: 'fixture', architecture: 'fixture', node: 'fixture', browser: 'fixture', headless: true },
        artifacts: {
          wallet: { id: 'wallet', version: '1', sha256: '00'.repeat(32), size: 0 },
          application: { id: 'app', version: '1', sha256: '11'.repeat(32), size: 0 }
        },
        configuration: {
          walletNetwork: 'mainnet',
          publicMainnetBroadcast: false,
          applicationOrigin: 'https://todo.itcve.test',
          controlledDestinations: [],
          undeclaredEgress: 'blocked'
        },
        observations: {
          walletVersion: 'fixture',
          walletNetwork: 'mainnet',
          authenticated: true,
          fundingTxid: '22'.repeat(32),
          routes: [],
          permissions: []
        },
        vectors: Array.from({ length: 8 }, (_, index) => ({
          id: `ISI-4-V00${index + 1}` as `ISI-4-V00${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`,
          outcome: 'BLOCKED' as const,
          assertions: [],
          limitations: ['fixture']
        })),
        semanticProjection: {},
        outcome: 'NOT_APPLICABLE'
      })
      expect(record.evidence).toHaveLength(1)
      expect(verifyEvidenceBundle(directory).runId).toBe('unit-test')
      expect(verifyEvidenceBundle(directory).claim).toBe('ENGINEERING_OBSERVATION_ONLY')
      expect(fs.readFileSync(path.join(directory, 'evidence', 'observation.json'), 'utf8')).not.toContain('fixture-secret')
      const candidate = { ...record, itcve: 'ITCVE-1@4.1.0', program: 'ISI-4@5.1.0', profile: 'candidate-wallet-native-engineering', walletCandidate: { officialRelease: false }, artifacts: { ...record.artifacts, wallet: { ...yoursPr368Artifact } } }
      // Crossing the artifact/claim boundary must fail before ordinary evidence
      // validation; a candidate's passing predicates cannot qualify a release.
      for (const changed of [
        { ...candidate, claim: 'EXPERIMENTAL_CONFORMANCE_RESULT' },
        { ...candidate, profile: 'production-wallet-native-conformance' },
        { ...candidate, walletCandidate: { officialRelease: true } },
        { ...candidate, artifacts: record.artifacts },
        { ...candidate, itcve: 'ITCVE-1@4.0.0', program: 'ISI-4@5.0.0' }
      ]) {
        fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify(changed))
        expect(() => verifyEvidenceBundle(directory)).toThrow(/Candidate wallet/)
      }
      for (const wallet of [yoursPr368Artifact, ...retiredYoursCandidateArtifacts].flatMap(artifact => [artifact, { ...artifact, version: '5.1.1' }])) {
        fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify({ ...record, claim: 'EXPERIMENTAL_CONFORMANCE_RESULT', artifacts: { ...record.artifacts, wallet } }))
        expect(() => verifyEvidenceBundle(directory)).toThrow(/Candidate wallet identity/)
      }
      fs.writeFileSync(path.join(directory, 'record.json'), JSON.stringify(record))
      fs.appendFileSync(path.join(directory, 'evidence', 'observation.json'), 'tamper')
      expect(() => verifyEvidenceBundle(directory)).toThrow(/mismatch/)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects undeclared files and verifies the series record hashes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-series-test-'))
    try {
      const records = []
      for (const name of ['repetition-1', 'repetition-2']) {
        const target = path.join(directory, name)
        const bundle = new EvidenceBundle(target)
        bundle.addText('observation.txt', 'same')
        const result = bundle.write({
          schema: 'tpnil-isi4-wallet-run@1.0.0', claim: 'EXPERIMENTAL_CONFORMANCE_RESULT',
          program: 'ISI-4@1.0.0', itcve: 'ITCVE-1@1.0.0', profile: 'production-wallet-todo-controlled-services',
          runId: name, startedAt: '2026-09-20T00:00:00.000Z', endedAt: '2026-09-20T00:00:01.000Z',
          runner: { os: 'fixture', architecture: 'fixture', node: 'fixture', browser: 'fixture', headless: true },
          artifacts: { wallet: { id: 'wallet', version: '1', sha256: '00'.repeat(32), size: 0 }, application: { id: 'app', version: '1', sha256: '11'.repeat(32), size: 0 } },
          configuration: { walletNetwork: 'mainnet', publicMainnetBroadcast: false, applicationOrigin: 'https://todo.itcve.test', controlledDestinations: [], undeclaredEgress: 'blocked' },
          observations: { walletVersion: 'fixture', walletNetwork: 'mainnet', authenticated: true, fundingTxid: '22'.repeat(32), routes: [], permissions: [] },
          vectors: Array.from({ length: 8 }, (_, index) => ({ id: `ISI-4-V00${index + 1}` as `ISI-4-V00${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`, outcome: 'BLOCKED' as const, assertions: [], limitations: ['fixture'] })),
          semanticProjection: { result: 'same' }, outcome: 'BLOCKED'
        })
        records.push({ runId: name, outcome: result.outcome, recordSha256: createHash('sha256').update(fs.readFileSync(path.join(target, 'record.json'))).digest('hex') })
      }
      fs.writeFileSync(path.join(directory, 'series.json'), `${JSON.stringify({ schema: 'tpnil-isi4-wallet-run-series@1.0.0', claim: 'EXPERIMENTAL_CONFORMANCE_RESULT', program: 'ISI-4@1.0.0', repetitions: records, repetitionMatch: true, semanticProjection: { result: 'same' }, outcome: 'BLOCKED' })}\n`)
      expect(verifyWalletRunSeries(directory).repetitionMatch).toBe(true)
      const seriesPath = path.join(directory, 'series.json')
      const series = JSON.parse(fs.readFileSync(seriesPath, 'utf8'))
      fs.writeFileSync(seriesPath, JSON.stringify({ ...series, claim: 'ENGINEERING_OBSERVATION_ONLY' }))
      expect(() => verifyWalletRunSeries(directory)).toThrow(/mixes claim boundaries/)
      fs.writeFileSync(seriesPath, JSON.stringify(series))
      fs.writeFileSync(path.join(directory, 'repetition-1', 'evidence', 'undeclared.txt'), 'extra')
      expect(() => verifyWalletRunSeries(directory)).toThrow(/file set/)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
