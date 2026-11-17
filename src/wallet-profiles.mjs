import fs from 'node:fs';
import path from 'node:path';
import { ECDH } from 'node:crypto';
import { ROOT, artifactBytes, checkCatalog, checkSchema, readJson, unique } from './core.mjs';
import { canonical, hashJson, parseJson } from './json.mjs';

export const WALLET_PROFILE_CATALOG = 'programs/ISI-6/0.1.0/catalog.json';
const same = (a, b) => canonical(a) === canonical(b);
const list = (a, b) => Array.isArray(a) && Array.isArray(b) && new Set(a).size === a.length && new Set(b).size === b.length && same([...a].sort(), [...b].sort());
const field = (value, key) => key.split('.').reduce((v, k) => v != null && Object.hasOwn(v, k) ? v[k] : undefined, value);
const stateFields = ['selected', 'identity', 'root', 'profiles', 'ump', 'revision', 'snapshot', 'ready'];
const hashPattern = /^[0-9a-f]{64}$/;
const outpointPattern = /^[0-9a-f]{64}\.(0|[1-9][0-9]*)$/;
function oracleRecord(value) {
  const roles = ['root', 'secondary', 'third', 'replacement'];
  if (value.schema !== 'tpnil-isi6-oracle@0.1.0' || Object.keys(value).sort().join() !== ['schema', 'claim', 'planHash', 'observerSha256', 'sources', ...roles].sort().join() || !['LAB_SELF_TEST_ONLY', 'ENGINEERING_OBSERVATION_ONLY'].includes(value.claim)) throw new Error('Invalid profile fixture oracle');
  for (const role of roles) {
    const item = value[role];
    if (!item || Object.keys(item).sort().join() !== 'identity,profile' || typeof item.profile !== 'string' || !item.profile || !/^(02|03)[0-9a-f]{64}$/.test(item.identity)) throw new Error('Invalid profile fixture identity');
    ECDH.convertKey(item.identity, 'secp256k1', 'hex', 'hex', 'compressed');
  }
  unique(roles.map(role => value[role].profile), 'fixture profile');
  unique(roles.map(role => value[role].identity), 'fixture identity');
  return value;
}
function caseOracle(vector, observation, oracle, evidence, plan) {
  const assertions = [];
  const check = (name, paths, predicate) => {
    const values = paths.map(key => field(observation, key));
    let status = 'BLOCKED';
    if (values.every(value => value !== undefined)) {
      try { status = predicate(...values) ? 'PASS' : 'FAIL'; } catch { status = 'FAIL'; }
    }
    assertions.push({ id: `${vector.id}/${name}`, status });
  };
  const compare = (name, paths) => check(name, paths, (...values) => values.every(value => same(value, values[0])));
  const state = (name, role, ready = true) => check(name, stateFields.map(key => `${name}.${key}`), (selected, identity, root, profiles, ump, revision, snapshot, actualReady) => selected === oracle[role].profile && identity === oracle[role].identity && root === oracle.root.identity && Array.isArray(profiles) && profiles.includes(selected) && profiles.includes(oracle.root.profile) && profiles.every(profile => ['root', 'secondary', 'third'].some(role => oracle[role].profile === profile)) && new Set(profiles).size === profiles.length && outpointPattern.test(ump) && Number.isSafeInteger(revision) && revision > 0 && hashPattern.test(snapshot) && actualReady === ready);
  const inventory = (name, roles) => check(name, [name], value => list(value, roles.map(role => oracle[role].profile)));
  const flag = (name, expected) => check(name, [name], value => same(value, expected));
  for (const role of vector.evidence) assertions.push({ id: `${vector.id}/evidence/${role}`, status: evidence.some(item => item.role === role) ? 'PASS' : 'BLOCKED' });
  switch (vector.id) {
    case 'ISI-6-V001':
      state('before', 'root'); state('after', 'root'); inventory('after.profiles', ['root', 'secondary']);
      check('successor', ['before.ump', 'after.ump', 'published.ump'], (before, after, published) => before !== after && after === published);
      inventory('published.profiles', ['root', 'secondary']);
      check('durable-before-ready', ['before.revision', 'after.revision', 'successRevision'], (before, after, success) => after > before && success === after);
      break;
    case 'ISI-6-V002':
      state('before', 'root'); state('after', 'secondary');
      compare('no-ump-write', ['before.ump', 'after.ump']);
      flag('freshIdentity', oracle.secondary.identity); flag('oldReply.status', 'rejected');
      check('old-generation-fenced', ['oldReply.generation', 'newGeneration'], (old, current) => Number.isSafeInteger(old) && Number.isSafeInteger(current) && old < current);
      check('serialized-switches', ['requestedSwitches', 'activatedSwitches'], (requested, activated) => Array.isArray(requested) && requested.length >= 2 && requested.at(-1) === oracle.secondary.profile && requested.every(profile => ['root', 'secondary', 'third'].some(role => oracle[role].profile === profile)) && same(requested, activated));
      flag('busyFinancialSwitch', 'refused'); flag('oldCacheReused', false);
      break;
    case 'ISI-6-V003':
      state('before', 'secondary'); state('after', 'secondary');
      for (const key of ['selected', 'identity', 'ump']) compare(`retained-${key}`, [`before.${key}`, `after.${key}`]);
      check('retained-inventory', ['before.profiles', 'after.profiles'], list);
      flag('lifecycle.kind', 'force-stop'); flag('lifecycle.processExited', true); flag('lifecycle.relaunchObserved', true); flag('walletLogoutCount', 0);
      check('monotonic-commit', ['before.revision', 'after.revision'], (before, after) => after >= before);
      break;
    case 'ISI-6-V004':
      state('before', 'secondary'); state('after', 'secondary'); state('reopened', 'secondary');
      inventory('after.profiles', ['root', 'secondary', 'third']); inventory('published.profiles', ['root', 'secondary', 'third']);
      check('one-original-update', ['before.ump', 'after.ump', 'published.ump', 'newActionIds'], (before, after, published, ids) => before !== after && after === published && Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' && ids[0].length > 0);
      compare('reopened-successor', ['after.ump', 'reopened.ump']); flag('walletLogoutCount', 0);
      break;
    case 'ISI-6-V005':
      state('stale', 'secondary'); state('reconciled', 'secondary');
      check('verified-successor', ['stale.ump', 'reconciled.ump', 'authoritative.ump'], (stale, current, authoritative) => stale !== current && current === authoritative);
      check('authoritative-inventory', ['reconciled.profiles', 'authoritative.profiles'], list);
      flag('unavailable.newUmpMutation', 'refused'); flag('unavailable.newAccountCreated', false);
      compare('unavailable-retains-snapshot', ['stale.snapshot', 'unavailable.retainedSnapshot']);
      break;
    case 'ISI-6-V006':
      state('before', 'secondary'); state('afterFailure', 'secondary', observation?.failureOutcome === 'verified-rollback'); state('afterRetry', 'secondary');
      check('safe-failure-outcome', ['failureOutcome'], value => ['unavailable', 'verified-rollback'].includes(value));
      for (const key of ['selected', 'ump', 'revision', 'snapshot']) compare(`failed-save-retains-${key}`, [`before.${key}`, `afterFailure.${key}`]);
      flag('writeResult', 'rejected');
      if (observation?.failureOutcome === 'verified-rollback') { flag('afterFailureAccess.identityCall', 'served-previous'); flag('afterFailureAccess.identity', oracle.secondary.identity); }
      else flag('afterFailureAccess.identityCall', 'rejected');
      flag('afterFailureAccess.umpMutation', 'rejected'); flag('newActionIds', []);
      compare('local-only-retry', ['before.ump', 'afterRetry.ump']);
      check('retry-commits', ['before.revision', 'afterRetry.revision'], (before, after) => after > before);
      break;
    case 'ISI-6-V007': {
      state('before', 'secondary'); state('after', 'secondary');
      flag('receipt.ownerIdentity', oracle.root.identity); compare('exact-predecessor', ['before.ump', 'receipt.predecessor']); compare('exact-outpoint', ['after.ump', 'receipt.outpoint']);
      check('intended-profiles', ['after.profiles', 'receipt.profiles'], list);
      const beef = evidence.find(item => item.role === 'atomic-beef');
      if (beef == null) assertions.push({ id: `${vector.id}/retained-original-bytes`, status: 'BLOCKED' });
      else check('retained-original-bytes', ['originalReceiptSha256', 'replayedReceiptSha256s'], (original, replayed) => original === beef.sha256 && Array.isArray(replayed) && replayed.length > 0 && replayed.every(value => value === original));
      check('no-duplicate-action', ['originalActionId', 'newActionIds'], (original, ids) => typeof original === 'string' && original.length > 0 && same(ids, [original]));
      flag('withoutReceipt.originalOutcome', 'unavailable'); flag('withoutReceipt.status', 'pending'); flag('withoutReceipt.newActionCount', 0); flag('withoutReceipt.checkpointRetained', true);
      check('successor-not-predecessor', ['before.ump', 'after.ump'], (before, after) => before !== after);
      break;
    }
    case 'ISI-6-V008':
      flag('removed.selected', oracle.secondary.profile); flag('removed.ready', false); flag('removed.identityCall', 'rejected'); flag('removed.status', 'profile-unavailable');
      check('builder-failure-safe', ['failedBuild.ready', 'failedBuild.identity', 'failedBuild.selected', 'failedBuild.identityCall'], (ready, identity, selected, call) => (ready === false && call === 'rejected') || (ready === true && identity === oracle.secondary.identity && selected === oracle.secondary.profile && call === 'served'));
      flag('replacement.identity', oracle.replacement.identity); flag('lateCallback.served', false); flag('afterLateCallback.identity', oracle.replacement.identity);
      break;
    case 'ISI-6-V009':
      flag('walletIdentity', oracle.secondary.identity); flag('initialServerIdentity', oracle.root.identity); flag('explicitLogin.serverIdentity', oracle.secondary.identity); flag('explicitLogin.peerIdentity', oracle.secondary.identity);
      check('separate-principal', ['rootUserId', 'secondaryUserId', 'explicitLogin.userId'], (root, secondary, actual) => typeof root === 'string' && root.length > 0 && typeof secondary === 'string' && secondary.length > 0 && root !== secondary && actual === secondary);
      flag('priorSessionStatus', 'revoked'); flag('pageReloadCount', 0); flag('paymentReplayCount', 0); flag('accountLinksCreated', 0);
      break;
    case 'ISI-6-V010':
      flag('consumerInventory', plan.optionalConsumers);
      if (plan.optionalConsumers.mirrors) {
        check('canonical-mirror-authority', ['canonicalRevision', 'selectedRevision', 'staleMirrorRevision'], (canonicalRevision, selected, stale) => Number.isSafeInteger(canonicalRevision) && Number.isSafeInteger(stale) && canonicalRevision > stale && selected === canonicalRevision);
        flag('conflictingAccounts', 'retained-and-refused'); flag('logout.mirrorStatus', 'disabled');
      } else flag('mirrorConsumer', 'absent');
      flag('logout.reopenedAuthenticated', false); flag('logout.oldSnapshotRestored', false);
      if (plan.optionalConsumers.background) {
        flag('backgroundAfterLogout', 'deferred'); flag('notificationIdentityBefore', oracle.root.identity);
        flag('notificationIdentityAfterSwitch', plan.notificationIdentityRole === 'root' ? oracle.root.identity : oracle.secondary.identity);
        flag('notificationCrossAccountAccepted', false);
      } else flag('backgroundConsumer', 'absent');
      break;
    default: throw new Error('Unknown ISI-6 vector');
  }
  const status = assertions.some(item => item.status === 'FAIL') ? 'FAIL' : assertions.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  return { id: vector.id, requirementId: vector.requirementId, status, assertions };
}

/** Evaluates digest-bound observations. Native admission and certification are separate. */
export function evaluateWalletProfiles(plan, record, evidenceRoot) {
  checkSchema('wallet-profile-plan', plan); checkSchema('wallet-profile-record', record);
  const catalog = readJson(path.join(ROOT, WALLET_PROFILE_CATALOG)); checkCatalog(catalog);
  if (plan.profileHash !== hashJson(catalog) || record.planHash !== hashJson(plan)) throw new Error('Wallet profile plan/catalog digest mismatch');
  const started = Date.parse(record.startedAt), finished = Date.parse(record.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || new Date(started).toISOString() !== record.startedAt || new Date(finished).toISOString() !== record.finishedAt || finished < started) throw new Error('Invalid observation interval');
  unique(record.cases.map(item => item.id), 'profile observation vector');
  if (record.cases.some(item => !catalog.vectors.some(vector => vector.id === item.id))) throw new Error('Unknown profile observation vector');
  const fixture = parseJson(artifactBytes(evidenceRoot, plan.fixtureOracle));
  const claim = plan.mode === 'self-test' ? 'LAB_SELF_TEST_ONLY' : 'ENGINEERING_OBSERVATION_ONLY';
  if (fixture.schema !== 'tpnil-isi6-fixture@0.1.0' || Object.keys(fixture).sort().join() !== 'claim,replacement,root,schema') throw new Error('Invalid frozen profile fixture');
  if (fixture.claim !== claim) throw new Error('Synthetic fixture and observation claims cannot be promoted or relabelled');
  const oracle = oracleRecord(parseJson(artifactBytes(evidenceRoot, record.oracle)));
  if (oracle.claim !== claim || oracle.planHash !== record.planHash || oracle.observerSha256 !== plan.oracleObserverSha256 || !same(oracle.root, fixture.root) || !same(oracle.replacement, fixture.replacement)) throw new Error('Derived profile oracle does not bind its frozen fixture/observer/plan');
  if (!oracle.sources || Object.keys(oracle.sources).sort().join() !== 'secondary,third') throw new Error('Missing derived UMP source bindings');
  for (const role of ['secondary', 'third']) {
    const source = oracle.sources[role];
    if (!source || Object.keys(source).sort().join() !== 'path,sha256,size' || !hashPattern.test(source.sha256) || !Number.isSafeInteger(source.size) || source.size < 1) throw new Error('Invalid derived UMP source binding');
    artifactBytes(evidenceRoot, source);
    const creation = record.cases.find(item => item.id === (role === 'secondary' ? 'ISI-6-V001' : 'ISI-6-V004'));
    const observedSources = creation?.evidence.filter(item => item.role === 'independent-ump') ?? [];
    if (observedSources.length && !observedSources.some(item => item.sha256 === source.sha256 && item.size === source.size)) throw new Error('Derived key is not bound to its creation UMP observation');
  }
  const outcomes = catalog.vectors.map(vector => {
    const item = record.cases.find(item => item.id === vector.id);
    if (!item) return { id: vector.id, requirementId: vector.requirementId, status: 'BLOCKED', assertions: [{ id: `${vector.id}/execution`, status: 'BLOCKED' }] };
    unique([item.projection.path, ...item.evidence.map(artifact => artifact.path)], 'vector evidence path');
    let projection;
    const evidence = [];
    try { projection = parseJson(artifactBytes(evidenceRoot, item.projection)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const artifact of item.evidence) {
      try { artifactBytes(evidenceRoot, artifact); evidence.push(artifact); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return caseOracle(vector, projection, oracle, evidence, plan);
  });
  return {
    schema: 'tpnil-isi6-result@0.1.0', claim: plan.mode === 'self-test' ? 'LAB_SELF_TEST_ONLY' : 'ENGINEERING_OBSERVATION_ONLY',
    program: plan.program, selection: plan.selection, profileHash: plan.profileHash, planHash: hashJson(plan), recordHash: hashJson(record),
    sutSha256: plan.sutSha256, environmentSha256: plan.environmentSha256, platform: plan.platform, deviceKind: plan.deviceKind, network: plan.network, optionalConsumers: plan.optionalConsumers, notificationIdentityRole: plan.notificationIdentityRole,
    overall: outcomes.some(item => item.status === 'FAIL') ? 'FAIL' : outcomes.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : 'PASS', outcomes
  };
}
export function evaluateWalletProfileFiles(planFile, recordFile, evidenceRoot) {
  return evaluateWalletProfiles(readJson(planFile), readJson(recordFile), fs.realpathSync(evidenceRoot));
}
