import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonical, digest } from '../src/json.mjs';
import { runComponentQualification } from '../src/component-qualification.mjs';
import { archiveRuntimeQualification } from '../src/runtime-qualification.mjs';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const [runtimeArgument, arcadeArgument, outputArgument, runnerId] = process.argv.slice(2);
if ([runtimeArgument, arcadeArgument, outputArgument, runnerId].some(value => value === undefined)) {
  throw new Error('Usage: run-isi1-synthesis <teranode-runtime> <arcade-source> <new-output-directory> <runner-id>');
}
const runtime = fs.realpathSync(runtimeArgument);
const arcade = fs.realpathSync(arcadeArgument);
const output = path.resolve(outputArgument);
if (fs.existsSync(output)) throw new Error('Synthesis output already exists');
for (const name of ['fixtures', 'locks', 'qualifications']) fs.mkdirSync(path.join(output, name), { recursive: true });
const tsx = path.join(ROOT, 'synthesis/node_modules/.bin/tsx');
const basePlan = JSON.parse(fs.readFileSync(path.join(ROOT, 'infra/plans/arcade-real-teranode-merkle.json')));

function run(executable, args, options = {}) {
  return execFileSync(executable, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}

function fixture(name, script, args) {
  const file = path.join(output, 'fixtures', `${name}.json`);
  run(tsx, [path.join(ROOT, 'synthesis/src', script), ...args, file]);
  const value = JSON.parse(fs.readFileSync(file));
  if (!/^[a-f0-9]{64}$/.test(value.txid)) throw new Error(`${name} did not produce a transaction ID`);
  return { file, value, sha256: digest(fs.readFileSync(file)) };
}

function qualify(name, id, input, purpose) {
  const plan = structuredClone(basePlan);
  plan.id = id;
  plan.environment.TPNIL_TERANODE_FIXTURE = `\${PLAN_ROOT}/../fixtures/${path.basename(input.file)}`;
  plan.inputs[0] = { environment: 'TPNIL_TERANODE_FIXTURE', sha256: input.sha256, purpose };
  plan.requiredOutput = [
    'transactions accepted by network',
    `real Teranode accepted and mined Arcade transaction ${input.value.txid}`,
    'real Teranode block produced a Merkle proof matching header root',
    '--- PASS: TestTPNIL_ArcadeBroadcastsToRealTeranode'
  ];
  const planFile = path.join(output, 'locks', `${name}.json`);
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  const qualification = path.join(output, 'qualifications', name);
  const result = runComponentQualification(planFile, arcade, qualification, runnerId);
  if (result.overall !== 'PASS') throw new Error(`${name} qualification failed`);
  return { name, txid: input.value.txid, inputSha256: input.sha256, recordHash: result.recordHash, overall: result.overall };
}

let failure;
try {
  run('docker', ['compose', '--project-directory', runtime, 'up', '-d', '--pull', 'never']);
  const runtimeResult = path.join(output, 'runtime-result.json');
  run(tsx, [path.join(ROOT, 'synthesis/src/teranode-probe.ts'), runtime, runtimeResult]);
  archiveRuntimeQualification(
    path.join(ROOT, 'infra/profiles/teranode-regtest.json'),
    path.join(runtime, 'tpnil-runtime.json'),
    runtimeResult,
    path.join(output, 'runtime-qualification')
  );
  const funding = fixture('funding', 'arcade-fixture.ts', [runtimeResult]);
  const stages = [qualify('funding', 'ARCADE-FUNDING-TERANODE-MERKLE', funding, 'Controlled signed fee-chain transaction.')];
  const board = fixture('board', 'board-arcade-fixture.ts', [runtimeResult, funding.file]);
  stages.push(qualify('board', 'ARCADE-SYNTHESIS-BOARD-TERANODE-MERKLE', board, 'Signed revision-3 Synthesis Board PushDrop transaction.'));
  const uhrp = fixture('uhrp', 'uhrp-arcade-fixture.ts', [board.file]);
  stages.push(qualify('uhrp', 'ARCADE-UHRP-TERANODE-MERKLE', uhrp, 'Canonical UHRP advertisement for the Synthesis Board CHIRP/LCH asset.'));
  const lch = fixture('lch', 'lch-arcade-fixture.ts', [uhrp.file]);
  stages.push(qualify('lch', 'ARCADE-LCH-TERANODE-MERKLE', lch, 'Receipt-complete BRC-170 multilateral settlement for the Synthesis Board asset.'));
  const runtimeValue = JSON.parse(fs.readFileSync(runtimeResult));
  const result = {
    schema: 'tpnil-isi1-synthesis-stack-result@1.0.0',
    claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY',
    outcome: 'PASS',
    completedAt: new Date().toISOString(),
    runtimeProfile: runtimeValue.profile,
    runtimeTransaction: runtimeValue.evidence.updateTxid,
    stages,
    assertions: {
      teranode_board_baseline_passed: runtimeValue.outcome === 'PASS',
      arcade_funding_path_passed: true,
      board_revision_path_passed: true,
      uhrp_advertisement_path_passed: true,
      lch_settlement_path_passed: true,
      every_stage_mined_and_merkle_verified: true
    }
  };
  fs.writeFileSync(path.join(output, 'result.json'), `${canonical(result)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  failure = error;
} finally {
  try { run('docker', ['compose', '--project-directory', runtime, 'down', '-v', '--remove-orphans']); }
  catch (cleanupError) { if (failure === undefined) failure = cleanupError; }
}
if (failure !== undefined) throw failure;
