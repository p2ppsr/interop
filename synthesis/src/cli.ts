import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { runReferenceSynthesis, serializeSynthesisResult } from './run.js'

const output = resolve(process.argv[2] ?? 'out/synthesis/reference-result.json')
const seed = process.argv[3] ?? 'tpnil-isi-1-reference-v1'
const result = await runReferenceSynthesis({
  seed,
  startTime: 1_800_000_000n,
  profile: 'reference'
})
await mkdir(dirname(output), { recursive: true })
await writeFile(output, serializeSynthesisResult(result), 'utf8')
process.stdout.write(`${result.outcome} ${result.claim} ${output}\n`)
