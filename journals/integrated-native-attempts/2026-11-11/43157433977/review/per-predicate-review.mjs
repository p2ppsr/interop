// Read-only source-bound native delta review. Never produces an admission verdict.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '../..');
const [candidateArg, outputArg, frozenArg, mode] = process.argv.slice(2);
const diagnostic = mode === "--diagnostic"; assert.ok(mode === undefined || diagnostic);
assert.ok(candidateArg && outputArg, 'Usage: node REVIEW CANDIDATE_ROOT OUTPUT [FROZEN_SOURCE_ROOT]');
const candidate = path.resolve(candidateArg), source = path.resolve(frozenArg ?? root), output = path.resolve(outputArg);
assert.ok(!fs.existsSync(output), 'Review output already exists; retain each independent attempt');
const sha = value => createHash('sha256').update(value).digest('hex');
const preparation = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'prepared.json')));
for (const [name, expected] of Object.entries(preparation.files)) assert.equal(sha(fs.readFileSync(path.join(source, name))), expected, `Frozen source changed: ${name}`);
const { register } = await import(pathToFileURL(path.join(root, 'synthesis/node_modules/tsx/dist/esm/api/index.mjs')).href); register();
const mod = name => import(pathToFileURL(path.join(source, name)).href);
const { canonicalJson } = await mod('synthesis/src/determinism.ts');
const { deriveClauseOutcomes, verifyNativeClauseConformance } = await mod('synthesis/src/wallet-lab/native/verify-conformance-clauses.ts');
const { clauseContract, invalidClauses, conforms } = await mod('synthesis/src/wallet-lab/native/conformance-clauses-model.ts');
const { verifyNoSendChangeFixture } = await mod('synthesis/src/wallet-lab/native/verify-conformance-nosend-change.ts');
const { deriveConditionalOutcomes, verifyNativeConditionalConformance } = await mod('synthesis/src/wallet-lab/native/verify-conformance-conditional.ts');
const { verifyNativePermissionCoverage } = await mod('synthesis/src/wallet-lab/native/verify-conformance-permission-coverage.ts');
const { verifyNativeTransactionStates } = await mod('synthesis/src/wallet-lab/native/verify-transaction-states.ts');
const { verifyNativeCertificateStates } = await mod('synthesis/src/wallet-lab/native/verify-certificate-states.ts');
const { compareNativeRecordDirectories } = await mod('scripts/compare-native-conformance.mjs');
const auditPath = 'journals/native-root-cause-audit/2026-11-11/audit.json';
const audit = JSON.parse(fs.readFileSync(path.join(root, auditPath)));
const historical = JSON.parse(fs.readFileSync(path.join(root, audit.sourceFindings.path)));
assert.equal(sha(fs.readFileSync(path.join(root, audit.sourceFindings.path))), audit.sourceFindings.sha256);
const original = path.join(root, 'out/native-ci-42711700295');
const count = rows => Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE'].map(outcome => [outcome, rows.filter(r => (r.result ?? r.outcome) === outcome).length]));
const projection = rows => rows.map(({ id, result }) => ({ id, result }));
const binding = filename => { const bytes = fs.readFileSync(filename); return { path: path.relative(root, filename), size: bytes.length, sha256: sha(bytes) }; };
function read(filename) { return JSON.parse(fs.readFileSync(filename)); }
function violations(shape, value, location = [], result = []) {
  if (conforms(shape, value)) return result;
  if (shape.kind === 'object' && value !== null && typeof value === 'object') for (const [name, child] of Object.entries(shape.fields)) violations(child, value[name], [...location, name], result);
  else if (shape.kind === 'array' && Array.isArray(value)) value.forEach((item, i) => violations(shape.item, item, [...location, i], result));
  else result.push({ path: location, kind: shape.kind, alias: shape.name, line: shape.line, observed: typeof value === 'string' || typeof value === 'number' || value == null ? value : undefined });
  return result;
}
function category(assertion, trace) {
  if (assertion.result === 'PASS') return 'observed-predicate-pass';
  if (assertion.result === 'BLOCKED') return assertion.id === 'coverage.remaining-obligations' ? 'remaining-coverage-obligations' : 'positive-control-or-fixture-unavailable';
  if (assertion.id === 'output.createAction.noSendChange-final-outpoints') return 'returned-noSendChange-does-not-match-final-signed-transaction';
  if (assertion.id === 'errors.structured') return 'public-error-structure-missing';
  if (assertion.id.startsWith('namespace.')) return 'reserved-or-uppercase-namespace-rejection-mismatch';
  if (assertion.id.startsWith('output.')) return 'output-contract-shape-or-alias';
  if (trace?.result !== undefined) return 'malformed-input-accepted';
  const message = trace?.error?.message ?? '';
  if (/network error 500|HTTP.?500/i.test(message)) return 'public-storage-rpc-500';
  if (/not implemented|not yet implemented/i.test(message)) return 'not-implemented';
  if (/cannot read (?:properties|property)|cannot (?:convert|set|destructure).*?(?:null|undefined)|(?:object null|undefined|null).*?not iterable|is not a function/i.test(message)) return 'wrapped-javascript-exception';
  if (/timeout|timed out|target.*closed|context.*destroyed|detached|ECONN/i.test(message)) return 'observer-or-transport-error';
  return 'specified-rejection-or-evidence-mismatch';
}
function references(report, assertion) {
  const ref = row => ({ id: row.id, method: row.method, pointer: `/trace/${report.trace.indexOf(row)}`, sha256: sha(canonicalJson(row)), resultPresent: row.result !== undefined, resultKeys: row.result && typeof row.result === 'object' ? Object.keys(row.result) : undefined, error: row.error ?? null });
  const call = report.trace.find(row => row.id === assertion.id), control = call?.controlId ? report.trace.find(row => row.id === call.controlId) : undefined;
  let rows = call ? [call] : assertion.id === 'output.createAction.noSendChange-final-outpoints' ? report.trace.filter(row => ['setup.input.createAction.options.noSendChange.0', 'setup.noSendChange.public-actions'].includes(row.id)) : assertion.id === 'errors.structured' ? report.trace.filter(row => row.error && !row.id.startsWith('cleanup.')) : [];
  const spec = invalidClauses.find(row => row.id === assertion.id), method = call?.method ?? (assertion.id.startsWith('output.') ? assertion.id.split('.')[1] : null);
  const result = { id: assertion.id, result: assertion.result, detail: assertion.detail, category: category(assertion, call), pointer: `/assertions/${report.assertions.findIndex(a => a.id === assertion.id)}`, method, standardLine: spec?.line ?? clauseContract.methods[method]?.line, fieldPath: spec?.path, trace: rows.map(ref), positiveControl: control ? ref(control) : call?.controlId ? { id: call.controlId, missing: true } : null };
  if (spec && call) result.negativeValue = spec.path.reduce((value, key) => value?.[key], call.args);
  if (assertion.id.startsWith('output.') && clauseContract.methods[method]) {
    const i = report.positives.findIndex(row => row.method === method), positive = report.positives[i];
    result.positiveResults = (positive?.observations ?? []).map((row, j) => ({ pointer: `/positives/${i}/observations/${j}`, sha256: sha(canonicalJson(row)), violations: violations(clauseContract.methods[method].output, row.result) }));
  }
  return result;
}
const repetitions = [];
for (const repetition of [1, 2]) {
  const oldFile = path.join(original, `repetition-${repetition}/evidence/conformance/clauses.json`), evidence = path.join(candidate, `repetition-${repetition}/evidence`);
  const old = read(oldFile), currentFile = path.join(evidence, 'conformance/clauses.json'), current = read(currentFile), recordFile = path.join(candidate, `repetition-${repetition}/record.json`), record = read(recordFile);
  assert.equal(sha(fs.readFileSync(oldFile)), historical.repetitions[repetition - 1].evidence.sha256);
  assert.equal(record.itcve, 'ITCVE-1@4.0.0'); assert.equal(record.artifacts.wallet.sha256, audit.walletArtifacts['5.1.1'].sha256);
  assert.deepEqual(Object.fromEntries(record.vectors.map(vector => [vector.id, vector.assertions.map(row => row.id)])), preparation.expectedVectors, 'Exact426 obligation inventory differs');
  const recordRows = record.vectors.flatMap(v => v.assertions); assert.equal(recordRows.length, 426);
  const boundary = read(path.join(evidence, 'integrated/boundary.json'));
  const clauseVerification = await verifyNativeClauseConformance(current, boundary.corpus ?? boundary);
  assert.equal(current.oracle, 'tpnil-brc100-clause-oracle@6.0.0'); assert.equal(old.oracle, 'tpnil-brc100-clause-oracle@4.0.0');
  const oldReplay = await deriveClauseOutcomes(old); assert.deepEqual(projection(oldReplay), projection(old.assertions));
  const oldWith5 = await deriveClauseOutcomes({ ...old, oracle: 'tpnil-brc100-clause-oracle@5.0.0' });
  const newWith4 = await deriveClauseOutcomes({ ...current, oracle: 'tpnil-brc100-clause-oracle@4.0.0' });
  const changedByOracle = oldWith5.filter(row => row.result !== old.assertions.find(a => a.id === row.id)?.result);
  assert.deepEqual(changedByOracle.map(row => row.id).sort(), ['namespace.basket.reserved', 'namespace.protocol.reserved']);
  const originalFailures = audit.findings.map(finding => {
    const before = old.assertions.find(row => row.id === finding.id), after = current.assertions.find(row => row.id === finding.id); assert.equal(before?.result, 'FAIL'); assert.ok(after);
    const namespace = ['namespace.basket.reserved', 'namespace.protocol.reserved'].includes(finding.id);
    return { id: finding.id, group: finding.group, released511Assessment: finding.released511Assessment, sourceCause: audit.groups[finding.group], attribution: namespace ? 'PROSPECTIVE_NAMESPACE_ORACLE_CORRECTION_SEPARATE_FROM_WALLET_EFFECTS' : 'OBSERVED_ARTIFACT_AND_COMPONENT_DELTA_SINGLE_LAYER_CAUSE_NOT_INFERRED', baseline: references(old, before), candidate: references(current, after), ...(namespace ? { originalUnderOracle5: oldWith5.find(row => row.id === finding.id), candidateUnderOracle4: newWith4.find(row => row.id === finding.id) } : {}) };
  });
  assert.equal(originalFailures.length, 99);
  const oldIds = new Map(old.assertions.map(row => [row.id, row.result]));
  const regressions = current.assertions.filter(row => oldIds.get(row.id) === 'PASS' && row.result !== 'PASS').map(row => references(current, row));
  const conditionalFile = path.join(evidence, 'conformance/conditional.json'), conditional = read(conditionalFile), permissionFile = path.join(evidence, 'conformance/permission-coverage.json'), permissions = read(permissionFile);
  let conditionalVerification, conditionalStrictFailure;
  try { conditionalVerification = await verifyNativeConditionalConformance(conditional); }
  catch (error) {
    if (!diagnostic) throw error;
    const assertions = await deriveConditionalOutcomes(conditional);
    assert.deepEqual(projection(assertions), projection(conditional.assertions), 'Diagnostic id/result replay differs');
    conditionalStrictFailure = { message: String(error), claim: 'STRICT_REPLAY_REJECTED_NO_ADMISSION', limitation: 'Only independently derived assertion identities/results are compared; strict verifier rejected retained human-readable details before its final transaction-inventory check.' };
    conditionalVerification = { verified: false, assertions, counts: count(assertions) };
  }
  const permissionVerification = await verifyNativePermissionCoverage(permissions, name => fs.readFileSync(path.join(evidence, name)), current.identity);
  const transactionVerification = await verifyNativeTransactionStates(read(path.join(evidence, 'conformance/transaction-states.json')));
  const certificateVerification = await verifyNativeCertificateStates(read(path.join(evidence, 'conformance/certificate-states.json')));
  const added = [ ...transactionVerification.assertions.map(row => ({ ...row, id: `transaction-states/${row.id}`, evidence: 'conformance/transaction-states.json' })), ...certificateVerification.assertions.map(row => ({ ...row, evidence: 'conformance/certificate-states.json' })), ...conditionalVerification.assertions.map(row => ({ ...row, id: `conditional/${row.id}`, evidence: 'conformance/conditional.json' })), ...permissionVerification.assertions.map(row => ({ ...row, evidence: 'conformance/permission-coverage.json' })) ];
  assert.equal(added.length, 146);
  for (const row of [...current.assertions, ...added]) assert.equal(recordRows.find(a => a.id === row.id)?.outcome, row.result, `Record outcome differs: ${row.id}`);
  let finalChange;
  try { const item = await verifyNoSendChangeFixture(current); finalChange = { verifiedFixture: true, signedTxid: item.txid, rawSha256: sha(Buffer.from(item.rawHex, 'hex')), finalOutpoints: item.outpoints, returnedOutpoints: item.returned }; }
  catch(error) { finalChange = { verifiedFixture: false, error: String(error) }; }
  repetitions.push({ repetition, bindings: { record: binding(recordFile), baselineClauses: binding(oldFile), candidateClauses: binding(currentFile), conditional: binding(conditionalFile), permissions: binding(permissionFile) }, recordCounts: count(recordRows), clauseCounts: count(current.assertions), originalFailureOutcomes: count(originalFailures.map(row => row.candidate)), originalFailureGroups: Object.fromEntries(Object.keys(audit.groups).map(group => [group, count(originalFailures.filter(row => row.group === group).map(row => row.candidate))])), originalFailures, regressions, noSendChange: finalChange, clauseVerification: { verified: clauseVerification.verified, result: clauseVerification.result }, conditionalStrictFailure, additionalCoverage: { counts: count(added), conditionalCounts: conditionalVerification.counts, permissionCounts: count(permissionVerification.assertions), transactionCounts: count(transactionVerification.assertions), certificateCounts: count(certificateVerification.assertions), nonPassing: added.filter(row => row.result !== 'PASS') }, allClauseNonPassing: current.assertions.filter(row => row.result !== 'PASS').map(row => references(current, row)), scope: 'Child semantic replay and per-predicate cause inventory; parent admission, full storage/submission proof, environment and shutdown replay remain separate mandatory receipts' });
}
const arithmetic = compareNativeRecordDirectories(original, candidate);
const repeatProjection = item => ({ counts: item.recordCounts, failures: item.originalFailures.map(row => ({ id: row.id, result: row.candidate.result, category: row.candidate.category })), additional: item.additionalCoverage.nonPassing.map(({ id, result }) => ({ id, result })) });
const repeatedAgreement = canonicalJson(repeatProjection(repetitions[0])) === canonicalJson(repeatProjection(repetitions[1]));
const report = { schema: 'tpnil-native-per-predicate-delta-review@1', claim: diagnostic ? 'UNQUALIFIED_DIAGNOSTIC' : 'DERIVED_TRACE_AND_CHILD_VERIFIER_REVIEW_NOT_ADMISSION', qualification: false, run: preparation.run, source: preparation.source, generatedAt: new Date().toISOString(), scriptSha256: sha(fs.readFileSync(import.meta.filename)), preparation: binding(path.join(import.meta.dirname, 'prepared.json')), audit: binding(path.join(root, auditPath)), repeatedAgreement, originalFailures: 99, expectedNativeAssertions: 426, separateNamespaceOracleCorrections: 2, completeBRC100Conformance: false, arithmetic, repetitions };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ written: output, repeatedAgreement, counts: repetitions.map(r => r.recordCounts), originalFailureOutcomes: repetitions.map(r => r.originalFailureOutcomes), additional: repetitions.map(r => r.additionalCoverage.counts), claim: report.claim }));
