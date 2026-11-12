import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** Keep the original child failure outside the test runner's stack renderer. */
export async function runReferenceChild(executable: string, args: string[], options: {
  cwd: string
  directory: string
  timeout: number
  maxBuffer: number
}) {
  const { directory, ...childOptions } = options
  fs.mkdirSync(directory, { recursive: true })
  try {
    const result = await promisify(execFile)(executable, args, childOptions)
    fs.writeFileSync(path.join(directory, 'stdout.log'), result.stdout)
    fs.writeFileSync(path.join(directory, 'stderr.log'), result.stderr)
    return result
  } catch (error) {
    const failure = error as Error & { code?: string | number, signal?: string, killed?: boolean, stdout?: string, stderr?: string, cmd?: string }
    fs.writeFileSync(path.join(directory, 'stdout.log'), failure.stdout ?? '')
    fs.writeFileSync(path.join(directory, 'stderr.log'), failure.stderr ?? '')
    fs.writeFileSync(path.join(directory, 'child-error.json'), JSON.stringify({
      schema: 'tpnil-reference-child-failure@1', claim: 'LAB_SELF_TEST_ONLY',
      executable, args, cwd: options.cwd, timeout: options.timeout, maxBuffer: options.maxBuffer,
      name: failure.name, message: failure.message, stack: failure.stack,
      code: failure.code ?? null, signal: failure.signal ?? null, killed: failure.killed ?? false, cmd: failure.cmd ?? null
    }, null, 2) + '\n')
    // execFile embeds child stderr (including tsx frames) into its own stack.
    // Vitest's source-map reader misreads a template in the pinned tsx loader.
    // A fresh failure preserves the failing status; the raw cause is retained.
    throw new Error(`Reference child failed (code=${String(failure.code)}, signal=${String(failure.signal)}, killed=${String(failure.killed)}); original stdout, stderr and error metadata retained at ${directory}`)
  }
}
