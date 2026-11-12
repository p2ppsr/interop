import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dockerfiles = ['infra/native/yours-go/Dockerfile', 'infra/native/integrated/Dockerfile', 'infra/native/conformance/Dockerfile']
function copiedInputs(contents) {
  const mappings = []
  for (const source of contents) for (const line of source.split('\n')) {
    if (!line.startsWith('COPY ') || line.includes('--from=')) continue
    const tokens = line.slice(5).trim().split(/\s+/), destination = tokens.pop()
    if (!destination.startsWith('/work/')) continue
    for (const token of tokens) {
      if (token.includes('$')) continue
      for (const name of fs.globSync(token, { cwd: root })) {
        const directory = fs.statSync(path.join(root, name)).isDirectory()
        const target = destination.slice(6).replace(/\/$/, '')
        mappings.push({ name, directory, target: directory ? target : destination.endsWith('/') ? path.posix.join(target, path.posix.basename(name)) : target })
      }
    }
  }
  return mappings
}
function assertClosure(plan, contents) {
  const mappings = copiedInputs(contents)
  for (const input of Object.keys(plan.conformanceInputs)) {
    assert.ok(mappings.some(row => row.directory ? input.startsWith(row.name + '/') && path.posix.join(row.target, input.slice(row.name.length + 1)) === input : row.name === input && row.target === input), `Frozen runtime input is absent from the container COPY closure: ${input}`)
  }
}

test('all frozen native workers receive every source-bound input in their container', () => {
  const contents = dockerfiles.map(name => fs.readFileSync(path.join(root, name), 'utf8'))
  for (const name of ['plan-5.1.1-observer-2.json', 'plan-pr368-7e39006.json', 'plan-pr368-cb3c2f2-observer-3.json', 'plan-pr368-coverage-1.json']) {
    const plan = JSON.parse(fs.readFileSync(path.join(root, 'infra/native/conformance', name)))
    assertClosure(plan, contents)
    for (const missing of ['COPY synthesis/go/cmd ', 'COPY .github/workflows/', 'COPY scripts/verify-native-trust.mjs ']) {
      const changed = contents.map(text => text.split('\n').filter(line => !line.startsWith(missing)).join('\n'))
      assert.throws(() => assertClosure(plan, changed), /absent from the container/)
    }
  }
})
