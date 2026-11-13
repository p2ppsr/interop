import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'))
const inventory = read('../programs/ISI-4/proposals/native-coverage-closure-20261111.json')
const contract = read('../programs/ISI-4/profiles/native-conformance-2.0.0/brc100-contract.json')
const baseline = read('../programs/ISI-4/profiles/brc100-boundary-1.0.0/profile.json')
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `duplicate ${label}`)

test('proposed native inventory accounts for every retained obligation and all 28 methods', () => {
  const historicalModel = fs.readFileSync(new URL('../synthesis/src/wallet-lab/native/conformance-clauses-model.ts', import.meta.url), 'utf8')
  const gapDeclaration = historicalModel.split('export const clauseCoverageGaps = [')[1].split('\n]')[0]
  const historicalGaps = [...gapDeclaration.matchAll(/id: '([^']+)'/g)].map(match => match[1])
  assert.equal(historicalGaps.length, 5)
  assert.deepEqual(inventory.obligations.map(gap => gap.id).sort(), historicalGaps.sort())
  assert.deepEqual(inventory.methodAccountability.map(row => row.method).sort(), Object.keys(contract.methods).sort())
  assert.equal(inventory.methodAccountability.length, 28)
  for (const gap of inventory.obligations) {
    assert.equal(gap.status, 'OPEN')
    assert.ok(inventory.cases.some(row => row.obligationId === gap.id), `unplanned obligation ${gap.id}`)
  }
  for (const row of inventory.methodAccountability) {
    assert.deepEqual(row.existingBoundaryPredicateIds, baseline.assertions.filter(id => id.startsWith(`${row.method}.`)))
    assert.ok(row.existingBoundaryPredicateIds.length, `lost baseline ${row.method}`)
    assert.deepEqual(row.proposedCaseIds, inventory.cases.filter(item => item.methods.includes(row.method)).map(item => item.id))
  }
})

test('case dependencies, clause references and method links are closed and unambiguous', () => {
  for (const field of ['obligations', 'dependencies', 'fixtures', 'interpretations', 'cases', 'standards']) unique(inventory[field].map(row => row.id), field)
  const ids = field => new Set(inventory[field].map(row => row.id))
  for (const row of inventory.cases) {
    assert.ok(ids('obligations').has(row.obligationId))
    assert.ok(row.methods.length)
    assert.ok(row.methods.every(method => Object.hasOwn(contract.methods, method)))
    for (const [field, target] of [['dependencyIds', 'dependencies'], ['fixtureIds', 'fixtures'], ['interpretationIds', 'interpretations']]) {
      unique(row[field], `${row.id}/${field}`)
      for (const id of row[field]) assert.ok(ids(target).has(id), `${row.id}: unknown ${field} ${id}`)
    }
    assert.ok(row.sourceRefs.length && row.fixtureIds.length && row.variants.length)
    unique(row.variants.map(v => v.id), `${row.id}/variants`)
    for (const variant of row.variants) {
      if (variant.methods) assert.ok(variant.methods.length && variant.methods.every(method => row.methods.includes(method)), `${row.id}/${variant.id}: incompatible method scope`)
    }
    for (const field of ['action', 'independentOracle', 'negativeControl']) assert.ok(row[field]?.length > 30, `${row.id}: missing ${field}`)
  }
  for (const row of [...inventory.cases, ...inventory.obligations, ...inventory.interpretations]) {
    for (const reference of row.sourceRefs) {
      assert.ok(ids('standards').has(reference.source))
      assert.ok(Number.isInteger(reference.startLine) && reference.startLine > 0)
      assert.ok(Number.isInteger(reference.endLine) && reference.endLine >= reference.startLine)
      assert.ok(reference.clause.length)
    }
  }
  const source = inventory.standards.find(row => row.id === 'brc100')
  for (const field of ['repository', 'commit', 'path', 'sha256', 'bytes']) assert.equal(source[field], contract.source[field])
})

test('planning evidence cannot silently satisfy missing native features or rewrite historical outcomes', () => {
  assert.equal(inventory.status, 'PROPOSAL_NOT_EXECUTED')
  assert.equal(inventory.claim, 'COVERAGE_DESIGN_ONLY')
  assert.equal(inventory.completeBRC100Conformance, false)
  assert.equal(inventory.historicalInputsMutable, false)
  for (const row of inventory.cases) assert.equal(row.executionStatus, 'NOT_EXECUTED')
  for (const row of inventory.interpretations) assert.equal(row.status, 'DRAFT_NOT_ADOPTED')
  for (const [prefix, dependency] of [['privileged.', 'released-secondary-keyring'], ['wire.', 'native-wallet-wire'], ['permissions.finite-expiry', 'supported-finite-expiry']]) {
    const required = inventory.dependencies.find(row => row.id === dependency)
    assert.equal(required.owner, 'WALLET')
    assert.equal(required.status, 'MISSING_IN_REVIEWED_RELEASES')
    for (const row of inventory.cases.filter(row => row.id.startsWith(prefix))) assert.ok(row.dependencyIds.includes(dependency), `${row.id} bypasses native prerequisite`)
  }
  assert.equal(inventory.executionRequirements.privateWalletStateMutationAllowed, false)
  assert.equal(inventory.executionRequirements.publicMainnetSpendingAllowed, false)
  assert.equal(inventory.executionRequirements.newPaidCapacityAuthorized, false)
  assert.equal(inventory.executionRequirements.newMajorOracleAndProfileRequired, true)
  assert.equal(inventory.coverageAccounting.executedNewCases, 0)
  assert.equal(inventory.coverageAccounting.proposedCaseGroups, inventory.cases.length)
  assert.equal(inventory.coverageAccounting.proposedVariantRows, inventory.cases.reduce((sum, row) => sum + row.variants.length, 0))
})

test('basket and wire matrices retain discriminating boundary cases and exact call-code accountability', () => {
  const cases = new Map(inventory.cases.map(row => [row.id, row]))
  for (const id of ['basket.ascii-length', 'basket.unicode-and-namespace']) {
    const row = cases.get(id)
    assert.ok(row.interpretationIds.includes('basket-limit'))
    const boundaries = row.variants.filter(v => v.utf8Bytes !== undefined)
    for (const length of [299, 300, 301, 399, 400, 401]) assert.ok(boundaries.some(v => v.utf8Bytes === length))
    for (const variant of boundaries) {
      const { prefix, suffix = '', fill, totalBytes } = variant.recipe
      const count = totalBytes - Buffer.byteLength(prefix + suffix)
      assert.ok(count >= 0)
      const value = prefix + fill.repeat(count) + suffix
      assert.equal(Buffer.byteLength(value), variant.utf8Bytes)
      if (id === 'basket.unicode-and-namespace') {
        assert.equal(variant.draftExpected, 'REJECT_NAMESPACE')
        assert.ok(!/^[a-z0-9 ]+$/.test(value))
      } else if (variant.draftExpected === 'ACCEPT') assert.ok(/^[a-z0-9 ]+$/.test(value))
    }
  }
  const wire = cases.get('wire.call-parity').variants
  assert.deepEqual(wire.map(row => row.callCode), Array.from({ length: 28 }, (_, index) => index + 1))
  assert.deepEqual(wire.map(row => row.method), baseline.methods)
  for (const id of ['transaction.defaults', 'transaction.batch-send']) assert.ok(cases.get(id).interpretationIds.includes('broadcast-timing'))
  for (const variant of cases.get('query.pagination').variants.filter(row => row.id.startsWith('output-offset-'))) assert.deepEqual(variant.methods, ['listOutputs'])
})

test('prospective implementation map accounts for every variant without turning implementation into qualification', () => {
  const map = read('../programs/ISI-4/proposals/native-coverage-closure-20261111-execution-map.json')
  const policy = read('../programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-1.0.0.json')
  for (const [relative, digest] of [['../programs/ISI-4/proposals/native-coverage-closure-20261111.json', map.inventorySha256], ['../programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-1.0.0.json', map.policySha256]]) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(relative, import.meta.url))).digest('hex'), digest)
  assert.equal(map.completeBRC100Conformance, false)
  assert.equal(map.nativeExecutionResults, null)
  assert.equal(map.claim, 'IMPLEMENTATION_ACCOUNTABILITY_ONLY')
  const key = row => `${row.caseId}/${row.variantId}`
  assert.deepEqual(map.variantRows.map(key).sort(), inventory.cases.flatMap(row => row.variants.map(variant => `${row.id}/${variant.id}`)).sort())
  unique(map.variantRows.map(key), 'mapped variant')
  for (const row of map.variantRows) {
    assert.ok(['PARTIAL_IMPLEMENTATION_AWAITING_NATIVE', 'BLOCKED_NATIVE_CAPABILITY', 'SEPARATE_PERMISSION_MODULE', 'NOT_EXECUTED'].includes(row.status))
    if (row.predicateIds) assert.ok(row.predicateIds.length && row.predicateIds.every(id => policy.assertionIds.includes(id)))
    if (row.status === 'BLOCKED_NATIVE_CAPABILITY') assert.ok(row.dependencyIds.length && row.dependencyIds.every(id => inventory.dependencies.some(d => d.id === id && d.status === 'MISSING_IN_REVIEWED_RELEASES')))
  }
})
