import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonical, parseJson } from './json.mjs';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function filesBelow(root, current = root) {
  const found = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Evidence contains a symlink: ${entry.name}`);
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) found.push(...filesBelow(root, absolute));
    else if (entry.isFile()) found.push(path.relative(root, absolute).split(path.sep).join('/'));
    else throw new Error(`Unsupported evidence entry: ${entry.name}`);
  }
  return found.sort();
}

export function packageSutEvidence(summaryFile, inputDirectory, outputDirectory) {
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  if (summary.schema !== 'tpnil-isi4-native-observation@1.0.0') throw new Error('Unsupported native observation schema');
  if (summary.evidence !== undefined) throw new Error('Summary must not define evidence');
  const evidenceDirectory = path.join(outputDirectory, 'evidence');
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const evidence = filesBelow(inputDirectory).map(name => {
    const source = path.join(inputDirectory, ...name.split('/'));
    const destination = path.join(evidenceDirectory, ...name.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    const bytes = fs.readFileSync(destination);
    return { name, sha256: sha256(bytes), size: bytes.length };
  });
  const record = { ...summary, evidence };
  fs.writeFileSync(path.join(outputDirectory, 'record.json'), `${canonical(record)}\n`);
  return verifyNativeObservation(outputDirectory);
}

function verifyEvidence(directory, record) {
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) throw new Error('Evidence list is empty');
  const declared = record.evidence.map(item => item.name);
  if (new Set(declared).size !== declared.length) throw new Error('Evidence names are not unique');
  const actual = filesBelow(path.join(directory, 'evidence'));
  if (canonical([...declared].sort()) !== canonical(actual)) throw new Error('Evidence file set differs from the record');
  for (const item of record.evidence) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(item.name) || item.name.includes('..'))
      throw new Error(`Invalid evidence name: ${item.name}`);
    const bytes = fs.readFileSync(path.join(directory, 'evidence', ...item.name.split('/')));
    if (bytes.length !== item.size) throw new Error(`Evidence size mismatch: ${item.name}`);
    if (sha256(bytes) !== item.sha256) throw new Error(`Evidence digest mismatch: ${item.name}`);
  }
}

const outcomes = new Set(['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE', 'NOT_APPLICABLE']);
function aggregateVectorOutcome(vectors) {
  if (vectors.some(vector => vector.outcome === 'FAIL')) return 'FAIL';
  if (vectors.some(vector => vector.outcome === 'INCONCLUSIVE')) return 'INCONCLUSIVE';
  if (vectors.some(vector => vector.outcome === 'BLOCKED')) return 'BLOCKED';
  if (vectors.some(vector => vector.outcome === 'PASS')) return 'PASS';
  return 'NOT_APPLICABLE';
}

function verifyVectors(record) {
  if (!Array.isArray(record.vectors) || record.vectors.length !== 8)
    throw new Error('Observation must score all eight vectors');
  const expected = Array.from({ length: 8 }, (_value, index) => `ISI-4-V00${index + 1}`);
  if (canonical(record.vectors.map(vector => vector.id)) !== canonical(expected))
    throw new Error('Vector identifiers or order differ from ISI-4');
  const evidenceNames = new Set(record.evidence.map(item => item.name));
  for (const vector of record.vectors) {
    if (!outcomes.has(vector.outcome)) throw new Error(`Invalid vector outcome: ${vector.id}`);
    if (!Array.isArray(vector.assertions) || !Array.isArray(vector.limitations))
      throw new Error(`Malformed vector result: ${vector.id}`);
    for (const assertion of vector.assertions) {
      if (!outcomes.has(assertion.outcome) || !Array.isArray(assertion.evidence))
        throw new Error(`Malformed assertion: ${vector.id}`);
      for (const name of assertion.evidence) {
        if (!evidenceNames.has(name)) throw new Error(`Assertion references undeclared evidence: ${name}`);
      }
    }
  }
  if (record.outcome !== aggregateVectorOutcome(record.vectors))
    throw new Error('Overall outcome differs from vector outcomes');
}

export function verifyNativeObservation(directory) {
  const record = parseJson(fs.readFileSync(path.join(directory, 'record.json')));
  if (record.schema !== 'tpnil-isi4-native-observation@1.0.0') throw new Error('Unsupported native observation schema');
  if (record.program !== 'ISI-4@1.0.0' || record.itcve !== 'ITCVE-1@1.0.0')
    throw new Error('Native observation has an unexpected program boundary');
  if (!['INTAKE_QUALIFICATION_ONLY', 'SOURCE_CANDIDATE_ENGINEERING_ONLY'].includes(record.claim))
    throw new Error('Native observation claim is invalid');
  verifyEvidence(directory, record);
  verifyVectors(record);
  return record;
}

export function verifyWalletRun(directory) {
  const record = parseJson(fs.readFileSync(path.join(directory, 'record.json')));
  if (record.schema !== 'tpnil-isi4-wallet-run@1.0.0') throw new Error('Unsupported wallet-run schema');
  if (record.claim !== 'EXPERIMENTAL_CONFORMANCE_RESULT') throw new Error('Unexpected wallet-run claim');
  if (record.program !== 'ISI-4@1.0.0' || record.itcve !== 'ITCVE-1@1.0.0')
    throw new Error('Wallet run has an unexpected program boundary');
  verifyEvidence(directory, record);
  verifyVectors(record);
  return record;
}

export function verifyWalletRunSeries(directory) {
  const series = parseJson(fs.readFileSync(path.join(directory, 'series.json')));
  if (series.schema !== 'tpnil-isi4-wallet-run-series@1.0.0' ||
      series.claim !== 'EXPERIMENTAL_CONFORMANCE_RESULT' || series.program !== 'ISI-4@1.0.0')
    throw new Error('Unexpected wallet-run series boundary');
  const names = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('repetition-'))
    .map(entry => entry.name).sort();
  if (names.length < 2 || names.length !== series.repetitions?.length)
    throw new Error('Wallet-run series repetition set differs from the record');
  const results = names.map(name => verifyWalletRun(path.join(directory, name)));
  if (canonical(names) !== canonical(series.repetitions.map(item => item.runId)))
    throw new Error('Wallet-run series order or identifiers differ');
  for (let index = 0; index < names.length; index += 1) {
    const bytes = fs.readFileSync(path.join(directory, names[index], 'record.json'));
    if (sha256(bytes) !== series.repetitions[index].recordSha256)
      throw new Error(`Wallet-run record digest mismatch: ${names[index]}`);
    if (results[index].outcome !== series.repetitions[index].outcome)
      throw new Error(`Wallet-run outcome mismatch: ${names[index]}`);
  }
  const projections = results.map(result => canonical(result.semanticProjection));
  const repetitionMatch = projections.every(projection => projection === projections[0]);
  if (series.repetitionMatch !== repetitionMatch || canonical(series.semanticProjection) !== projections[0])
    throw new Error('Wallet-run series semantic finding differs');
  const expectedOutcome = repetitionMatch ? results[0].outcome : 'INCONCLUSIVE';
  if (series.outcome !== expectedOutcome) throw new Error('Wallet-run series outcome differs');
  return series;
}
