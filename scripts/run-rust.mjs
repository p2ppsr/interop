import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { corpusSources, evaluateRustCorpus } from './rust-corpus.mjs'
const root = path.resolve(import.meta.dirname, '..')
const output = path.resolve(process.argv[2] ?? path.join(root, 'out/rust'))
if (fs.existsSync(output) && fs.readdirSync(output).length) throw new Error('Refusing to overwrite retained Rust evidence')
fs.mkdirSync(output, { recursive: true })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const sources = Object.fromEntries(corpusSources.map(file => [file, digest(fs.readFileSync(path.join(root, file)))]))
const inputReports = [], inputs = []
for (const [index, argument] of process.argv.slice(3).entries()) {
  const bytes = fs.readFileSync(path.resolve(argument)), filename = `input-${index + 1}.json`
  inputReports.push(JSON.parse(bytes)); inputs.push({ path: filename, sourceName: path.basename(argument), sha256: digest(bytes) })
  fs.writeFileSync(path.join(output, filename), bytes, { flag: 'wx' })
}
const target = path.join(root, 'components/rust/target/debug/tpnil-rust-participant')
const build = spawnSync('cargo', ['build', '--locked', '--manifest-path', path.join(root, 'components/rust/Cargo.toml')], { encoding: 'utf8', timeout: 300_000 })
fs.writeFileSync(path.join(output, 'build.txt'), build.stdout + build.stderr)
if (build.status !== 0) throw new Error(`Rust build failed: ${build.stderr}`)
const calls = []
function rust(request) {
  const response = spawnSync(target, [], { input: JSON.stringify([request]), encoding: 'utf8', timeout: 30_000, maxBuffer: 16*1024*1024 })
  if (response.status !== 0) throw new Error(`Rust participant failed: ${response.stderr}`)
  const result = JSON.parse(response.stdout)[0]; calls.push({ request, response: result }); return result
}
const evaluated = evaluateRustCorpus(rust, inputReports)
fs.writeFileSync(path.join(output, 'calls.json'), JSON.stringify(calls, null, 2) + '\n')
const result = { schema: 'tpnil-component-result@1', corpus: 'tpnil-rust-corpus@2', claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY',
  components: { rustSdk: { repository: 'bsv-blockchain/rs-sdk', commit: '99d2313f2ede48a465aa8be1907d26d098aac8fd' }, typescriptSdk: '4.0.1', binarySha256: digest(fs.readFileSync(target)), cargoLockSha256: sources['components/rust/Cargo.lock'] },
  sources, inputs, ...evaluated,
  evidence: ['calls.json', 'build.txt', ...inputs.map(item => item.path)].map(file => ({ path: file, sha256: digest(fs.readFileSync(path.join(output, file))) })), cleanup: { childProcessesExited: true } }
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result))
