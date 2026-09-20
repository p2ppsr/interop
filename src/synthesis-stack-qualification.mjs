import fs from 'node:fs';
import path from 'node:path';
import { canonical, digest, hashJson, parseJson } from './json.mjs';
import { verifyComponentQualification } from './component-qualification.mjs';
import { verifyRuntimeQualification } from './runtime-qualification.mjs';

const CLAIM = 'INFRASTRUCTURE_QUALIFICATION_ONLY';
const STAGES = ['funding', 'board', 'uhrp', 'lch'];

function fileBytes(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
  return fs.readFileSync(file);
}

function read(file) { return parseJson(fileBytes(file)); }

export function verifySynthesisStackQualification(directory) {
  const result = read(path.join(directory, 'result.json'));
  if (result.schema !== 'tpnil-isi1-synthesis-stack-result@1.0.0' || result.claim !== CLAIM || result.outcome !== 'PASS')
    throw new Error('Synthesis stack result identity mismatch');
  if (canonical(Object.keys(result.assertions ?? {}).sort()) === canonical([]) ||
      Object.values(result.assertions).some(value => value !== true))
    throw new Error('Synthesis stack contains an unmet assertion');
  if (!Array.isArray(result.stages) || result.stages.map(stage => stage.name).join(',') !== STAGES.join(','))
    throw new Error('Synthesis stack stage order mismatch');

  const runtime = verifyRuntimeQualification(path.join(directory, 'runtime-qualification'));
  const runtimeResultBytes = fileBytes(path.join(directory, 'runtime-result.json'));
  const runtimeRecord = read(path.join(directory, 'runtime-qualification/record.json'));
  const archivedRuntimeResult = fileBytes(path.join(directory, 'runtime-qualification/objects', runtimeRecord.resultHash));
  if (!runtimeResultBytes.equals(archivedRuntimeResult)) throw new Error('Synthesis runtime result differs from its qualification');
  const runtimeResult = parseJson(runtimeResultBytes);
  if (runtimeResult.profile !== result.runtimeProfile || runtimeResult.evidence.updateTxid !== result.runtimeTransaction)
    throw new Error('Synthesis runtime linkage mismatch');

  const fixtures = new Map();
  for (const stage of result.stages) {
    const qualification = verifyComponentQualification(path.join(directory, 'qualifications', stage.name));
    if (qualification.overall !== 'PASS' || qualification.recordHash !== stage.recordHash)
      throw new Error(`Synthesis qualification mismatch: ${stage.name}`);
    const fixtureBytes = fileBytes(path.join(directory, 'fixtures', `${stage.name}.json`));
    if (digest(fixtureBytes) !== stage.inputSha256) throw new Error(`Synthesis fixture digest mismatch: ${stage.name}`);
    const fixture = parseJson(fixtureBytes);
    if (fixture.txid !== stage.txid) throw new Error(`Synthesis fixture transaction mismatch: ${stage.name}`);
    const plan = read(path.join(directory, 'locks', `${stage.name}.json`));
    if (plan.inputs?.[0]?.sha256 !== stage.inputSha256 || !plan.requiredOutput.some(value => value.includes(stage.txid)))
      throw new Error(`Synthesis plan linkage mismatch: ${stage.name}`);
    fixtures.set(stage.name, fixture);
  }
  const funding = fixtures.get('funding');
  const board = fixtures.get('board');
  const uhrp = fixtures.get('uhrp');
  const lch = fixtures.get('lch');
  if (board.kind !== 'tpnil-synthesis-board-revision' || board.fundingTxid !== funding.txid ||
      board.sourceTxid !== result.runtimeTransaction || board.board.revision !== 3)
    throw new Error('Synthesis Board transaction chain mismatch');
  if (uhrp.kind !== 'tpnil-uhrp-advertisement' || uhrp.sourceTxid !== board.txid ||
      uhrp.advertisement.uhrpUrl.replace(/^uhrp:/u, 'chirp:').length < 20)
    throw new Error('Synthesis UHRP transaction chain mismatch');
  if (lch.kind !== 'tpnil-lch-multipay-settlement' || lch.sourceTxid !== uhrp.txid ||
      lch.lch.assetId !== uhrp.lchAssetId || board.board.key !== `board/${lch.lch.assetId}` ||
      lch.lch.receiptIds.length !== 2 || lch.lch.transactionState !== 'finalized')
    throw new Error('Synthesis LCH transaction chain mismatch');
  return {
    verified: true,
    claim: CLAIM,
    outcome: 'PASS',
    resultHash: digest(fileBytes(path.join(directory, 'result.json'))),
    semanticHash: hashJson({ runtime: result.runtimeTransaction, stages: result.stages.map(({ name, txid }) => ({ name, txid })) }),
    stages: result.stages.length,
    assertions: Object.keys(result.assertions).length,
    runtimeRecordHash: runtime.recordHash
  };
}

export function archiveSynthesisStackQualification(source, output) {
  if (fs.existsSync(output)) throw new Error('Synthesis stack output already exists');
  const verified = verifySynthesisStackQualification(source);
  fs.cpSync(source, output, {
    recursive: true,
    errorOnExist: true,
    filter(item) {
      if (fs.lstatSync(item).isSymbolicLink()) throw new Error('Synthesis stack contains a symlink');
      return true;
    }
  });
  const replay = verifySynthesisStackQualification(output);
  if (canonical(replay) !== canonical(verified)) throw new Error('Archived synthesis stack diverged');
  return { archived: true, ...replay };
}
