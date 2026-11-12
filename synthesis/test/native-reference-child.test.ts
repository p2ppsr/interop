import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseErrorStacktrace } from '@vitest/utils/source-map'
import { extractSourcemapFromFile } from '@vitest/utils/source-map/node'
import { runReferenceChild } from './reference-child.js'

describe('reference subprocess failure evidence', () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tpnil-reference-child-'))
  const root = path.resolve(import.meta.dirname, '../..')
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }))
  const getSourceMap = (file: string) => fs.existsSync(file) ? extractSourcemapFromFile(fs.readFileSync(file, 'utf8'), file)?.map : undefined

  it('retains the actual missing dependency failure while avoiding pinned tsx source-map masking', async () => {
    const evidence = path.join(directory, 'missing-dependency'), script = path.join(directory, 'missing.cjs')
    fs.writeFileSync(script, "console.log('child-started'); require('__tpnil_intentionally_missing_reference_dependency__')\n")
    let failure: Error | undefined
    try {
      await runReferenceChild(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'), script], { cwd: root, directory: evidence, timeout: 10000, maxBuffer: 1024 * 1024 })
    } catch (error) { failure = error as Error }
    expect(failure).toBeInstanceOf(Error)
    expect(failure!.message).toMatch(/Reference child failed \(code=1/)
    expect(failure!.message).toContain(evidence)
    expect(failure!.cause).toBeUndefined()
    const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'child-error.json'), 'utf8'))
    expect(raw.code).toBe(1); expect(raw.killed).toBe(false)
    expect(raw.stack).toMatch(/tsx\/dist\/register-/)
    expect(fs.readFileSync(path.join(evidence, 'stdout.log'), 'utf8')).toContain('child-started')
    expect(fs.readFileSync(path.join(evidence, 'stderr.log'), 'utf8')).toContain("Cannot find module '__tpnil_intentionally_missing_reference_dependency__'")
    // The actual captured error triggers the dependency defect. The fresh
    // error still fails the test cleanly and keeps the original bytes above.
    expect(() => parseErrorStacktrace(raw, { getSourceMap })).toThrow(/not valid JSON/)
    expect(parseErrorStacktrace(failure!, { getSourceMap }).length).toBeGreaterThan(0)
    expect(failure!.stack).not.toMatch(/tsx\/dist\/register-/)
  })

  it('retains a killed child as a failure with its bounded timeout and raw output', async () => {
    const evidence = path.join(directory, 'timeout')
    await expect(runReferenceChild(process.execPath, ['-e', "process.stdout.write('waiting'); setInterval(() => {}, 1000)"],
      { cwd: root, directory: evidence, timeout: 1500, maxBuffer: 1024 * 1024 })).rejects.toThrow(/Reference child failed/)
    const raw = JSON.parse(fs.readFileSync(path.join(evidence, 'child-error.json'), 'utf8'))
    expect(raw.killed).toBe(true); expect(raw.signal).toBe('SIGTERM'); expect(raw.timeout).toBe(1500)
    expect(fs.readFileSync(path.join(evidence, 'stdout.log'), 'utf8')).toBe('waiting')
  })

  it('preserves successful subprocess output without manufacturing failure evidence', async () => {
    const evidence = path.join(directory, 'success')
    const result = await runReferenceChild(process.execPath, ['-e', "process.stdout.write('complete'); process.stderr.write('diagnostic')"],
      { cwd: root, directory: evidence, timeout: 10000, maxBuffer: 1024 * 1024 })
    expect(result).toMatchObject({ stdout: 'complete', stderr: 'diagnostic' })
    expect(fs.readFileSync(path.join(evidence, 'stdout.log'), 'utf8')).toBe('complete')
    expect(fs.readFileSync(path.join(evidence, 'stderr.log'), 'utf8')).toBe('diagnostic')
    expect(fs.existsSync(path.join(evidence, 'child-error.json'))).toBe(false)
  })
})
