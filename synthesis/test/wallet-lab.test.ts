import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EvidenceBundle, redactEvidence, verifyEvidenceBundle, verifyWalletRunSeries } from '../src/wallet-lab/evidence.js'

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
        claim: 'EXPERIMENTAL_CONFORMANCE_RESULT',
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
      expect(fs.readFileSync(path.join(directory, 'evidence', 'observation.json'), 'utf8')).not.toContain('fixture-secret')
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
      fs.writeFileSync(path.join(directory, 'repetition-1', 'evidence', 'undeclared.txt'), 'extra')
      expect(() => verifyWalletRunSeries(directory)).toThrow(/file set/)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
