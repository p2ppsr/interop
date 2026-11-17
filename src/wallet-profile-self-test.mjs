import fs from 'node:fs';
import path from 'node:path';
import { createECDH } from 'node:crypto';
import { ROOT, readJson } from './core.mjs';
import { digest, hashJson } from './json.mjs';
import { WALLET_PROFILE_CATALOG } from './wallet-profiles.mjs';

/** Synthetic oracle exercise; none of these projections are native observations. */
export function createWalletProfileSelfTest(directory) {
  if (fs.existsSync(directory)) throw new Error('Self-test output already exists');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const put = (name, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + '\n');
    fs.writeFileSync(path.join(directory, name), bytes, { mode: 0o600, flag: 'wx' });
    return { path: name, sha256: digest(bytes), size: bytes.length };
  };
  const key = number => { const ec = createECDH('secp256k1'); ec.setPrivateKey(Buffer.from(number.toString(16).padStart(64, '0'), 'hex')); return ec.getPublicKey('hex', 'compressed'); };
  const roles = ['root', 'secondary', 'third', 'replacement'];
  const oracle = { schema: 'tpnil-isi5-oracle@0.1.0', claim: 'LAB_SELF_TEST_ONLY', ...Object.fromEntries(roles.map((role, index) => [role, { profile: role, identity: key(index + 1) }])) };
  const state = (role = 'secondary', revision = 2, count = 2, ump = '02'.repeat(32) + '.0') => ({ selected: role, identity: oracle[role].identity, root: oracle.root.identity, profiles: roles.slice(0, count), ump, revision, snapshot: digest(`synthetic-snapshot-${revision}`), ready: true });
  const before = state(), after = state('secondary', 3, 3, '03'.repeat(32) + '.0');
  const beef = Buffer.from('LAB_SELF_TEST_ONLY synthetic AtomicBEEF placeholder');
  const projections = [
    { before: state('root', 1, 1, '01'.repeat(32) + '.0'), after: state('root'), published: { ump: before.ump, profiles: before.profiles }, successRevision: 2 },
    { before: state('root'), after: before, freshIdentity: oracle.secondary.identity, oldReply: { status: 'rejected', generation: 1 }, newGeneration: 2, requestedSwitches: ['root', 'secondary'], activatedSwitches: ['root', 'secondary'], busyFinancialSwitch: 'refused', oldCacheReused: false },
    { before, after: before, lifecycle: { kind: 'force-stop', processExited: true, relaunchObserved: true }, walletLogoutCount: 0 },
    { before, after, reopened: after, published: { ump: after.ump, profiles: after.profiles }, newActionIds: ['original-third'], walletLogoutCount: 0 },
    { stale: before, reconciled: after, authoritative: { ump: after.ump, profiles: after.profiles }, unavailable: { newUmpMutation: 'refused', newAccountCreated: false, retainedSnapshot: before.snapshot } },
    { before, afterFailure: { ...before, ready: false }, afterRetry: { ...before, revision: 3 }, writeResult: 'rejected', whileBlocked: { identityCall: 'rejected', umpMutation: 'rejected' }, newActionIds: [] },
    { before, after, receipt: { ownerIdentity: oracle.root.identity, predecessor: before.ump, outpoint: after.ump, profiles: after.profiles }, originalReceiptSha256: digest(beef), replayedReceiptSha256s: [digest(beef), digest(beef)], originalActionId: 'original-update', newActionIds: ['original-update'], withoutReceipt: { status: 'pending', newActionCount: 0, checkpointRetained: true } },
    { removed: { selected: 'secondary', ready: false, identityCall: 'rejected', status: 'profile-unavailable' }, failedBuild: { ready: false, identity: oracle.secondary.identity, selected: 'secondary', identityCall: 'rejected' }, replacement: { identity: oracle.replacement.identity }, lateCallback: { served: false }, afterLateCallback: { identity: oracle.replacement.identity } },
    { walletIdentity: oracle.secondary.identity, initialServerIdentity: oracle.root.identity, explicitLogin: { serverIdentity: oracle.secondary.identity, peerIdentity: oracle.secondary.identity, userId: 'secondary-user' }, rootUserId: 'root-user', secondaryUserId: 'secondary-user', priorSessionStatus: 'revoked', pageReloadCount: 0, paymentReplayCount: 0, accountLinksCreated: 0 },
    { canonicalRevision: 3, selectedRevision: 3, staleMirrorRevision: 1, conflictingAccounts: 'retained-and-refused', logout: { mirrorStatus: 'disabled', reopenedAuthenticated: false, oldSnapshotRestored: false }, backgroundAfterLogout: 'deferred', notificationIdentityBefore: oracle.root.identity, notificationIdentityAfterSwitch: oracle.root.identity, notificationCrossAccountAccepted: false, consumerInventory: { mirrors: true, background: true } }
  ];
  const catalog = readJson(path.join(ROOT, WALLET_PROFILE_CATALOG));
  const plan = { schema: 'tpnil-isi5-plan@0.1.0', program: 'ISI-5@0.1.0', selection: 'ump-profiles', mode: 'self-test', profileHash: hashJson(catalog), oracle: put('oracle.json', oracle), sutSha256: digest('synthetic SUT'), environmentSha256: digest('synthetic controlled environment'), platform: 'synthetic-unit-fixture', deviceKind: 'headless', network: 'main', publicBroadcast: false, optionalConsumers: { mirrors: true, background: true }, notificationIdentityRole: 'root' };
  const record = { schema: 'tpnil-isi5-record@0.1.0', program: 'ISI-5@0.1.0', planHash: hashJson(plan), startedAt: '2026-11-16T00:00:00.000Z', finishedAt: '2026-11-16T00:00:01.000Z', cases: catalog.vectors.map((vector, index) => ({ id: vector.id, projection: put(`${vector.id}.json`, projections[index]), evidence: vector.evidence.map(role => ({ role, ...put(`${vector.id}-${role}.raw`, role === 'atomic-beef' ? beef : Buffer.from(`LAB_SELF_TEST_ONLY ${vector.id} ${role}`)) })) })) };
  put('plan.json', plan); put('record.json', record);
  return { plan, record, oracle, directory };
}
