import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nativeRustBinding } from './native-rust-compatibility.mjs';
import { selectNativeWalletProfile } from './native-wallet-profiles.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [image, outputArgument] = process.argv.slice(2);
if (!image || !outputArgument) throw new Error('Usage: run-native-go-wallet IMAGE NEW_OUTPUT');
if (process.argv.length > 5) throw new Error('Unknown native qualification profile flag');
const { wallet511, walletVersion, observerRevision, coverageRevision, rustV3, closure, coverage, conformance, trustedIdentity, integrated, planPath } = selectNativeWalletProfile(process.argv[4]);
const output = path.resolve(outputArgument);
if (fs.existsSync(output)) throw new Error('Native qualification output already exists');
fs.mkdirSync(output, { recursive: true });
const planFile = path.join(root, planPath);
const plan = JSON.parse(fs.readFileSync(planFile));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 });
const imageInfo = JSON.parse(docker(['image', 'inspect', image]))[0];
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (dirty) throw new Error('Qualification requires committed source');
const rustCompatibility = rustV3 ? await nativeRustBinding(plan,sha(fs.readFileSync(planFile)),source) : undefined;
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This admitted lane requires native Linux/amd64 execution');
save('run-lock.json', { schema: 'tpnil-native-wallet-run-lock@1.0.0', source, plan, planSha256: sha(fs.readFileSync(planFile)), ...(rustCompatibility ? {executionVariant:rustCompatibility.variant,rustCompatibility} : {}), image: { id: imageInfo.Id, os: imageInfo.Os, architecture: imageInfo.Architecture, layers: imageInfo.RootFS.Layers }, runner: { os: os.release(), node: process.version, platform: process.platform, architecture: process.arch }, startedAt: new Date().toISOString() });
function receipt(info) {
  return { id: info.Id, image: info.Image, user: info.Config.User, networkMode: info.HostConfig.NetworkMode, networks: info.NetworkSettings.Networks, privileged: info.HostConfig.Privileged, capAdd: info.HostConfig.CapAdd, capDrop: info.HostConfig.CapDrop, readonly: info.HostConfig.ReadonlyRootfs, pidMode: info.HostConfig.PidMode, init: info.HostConfig.Init, mounts: info.Mounts.map(mount => ({ destination: mount.Destination, rw: mount.RW, type: mount.Type })), state: info.State };
}
// The ephemeral Ubuntu runner's AppArmor restriction otherwise prevents Chromium's
// own PID/user-namespace sandbox, even with an unconfined container profile.
// Keep this host-only change bounded to execution and retain restoration evidence.
const usernsPath = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';
const usernsBefore = fs.readFileSync(usernsPath, 'utf8').trim();
let usernsActive;
try {
  if (usernsBefore !== '0') execFileSync('sudo', ['sysctl', '-w', 'kernel.apparmor_restrict_unprivileged_userns=0'], { stdio: 'inherit' });
  usernsActive = fs.readFileSync(usernsPath, 'utf8').trim();
  if (usernsActive !== '0') throw new Error('Host still blocks Chromium user namespaces');
for (let index = 1; index <= plan.repetitions; index++) {
  const name = `tpnil-native-${randomBytes(12).toString('hex')}`;
  const repetition = path.join(output, `repetition-${index}`);
  fs.mkdirSync(repetition, { mode: 0o755 });
  let id, error, removed = false;
  try {
    id = docker(['create', '--name', name, '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'seccomp=unconfined', '--security-opt', 'apparmor=unconfined', '--read-only', '--init', '--pids-limit', '512', '--memory', '4g', '--cpus', '2', '--shm-size', '1g', '--tmpfs', '/tmp:rw,nosuid,nodev,size=2g,mode=1777', '--user', `${process.getuid()}:${process.getgid()}`, '--mount', `type=bind,src=${repetition},dst=/evidence`, ...(trustedIdentity ? ['--env', 'TPNIL_NATIVE_IDENTITY_TRUST=1'] : []), ...(conformance ? ['--env', 'TPNIL_NATIVE_CONFORMANCE=1'] : []), ...(coverage ? ['--env', 'TPNIL_NATIVE_COVERAGE=1'] : []), ...(closure ? ['--env', 'TPNIL_NATIVE_CLOSURE=1'] : []), ...(wallet511 ? ['--env', `TPNIL_NATIVE_WALLET_VERSION=${walletVersion}`] : []), ...(observerRevision ? ['--env', `TPNIL_NATIVE_OBSERVER_REVISION=${observerRevision}`] : []), ...(coverageRevision ? ['--env', `TPNIL_NATIVE_COVERAGE_REVISION=${coverageRevision}`] : []), image]).trim();
    save(`host-repetition-${index}-before.json`, receipt(JSON.parse(docker(['inspect', id]))[0]));
    const log = fs.openSync(path.join(repetition, 'console.log'), 'wx');
    const run = spawnSync('docker', ['start', '-a', id], { stdio: ['ignore', log, log], timeout: (plan.timeoutSecondsPerRepetition + 60) * 1000 });
    fs.closeSync(log);
    save(`host-repetition-${index}-after.json`, receipt(JSON.parse(docker(['inspect', id]))[0]));
    if (run.status !== 0) throw new Error(`Native repetition ${index} failed (${run.status ?? run.error?.message})`);
  } catch (failure) { error = failure; }
  finally {
    if (id) {
      try { docker(['rm', '-f', '-v', id]); removed = true; }
      catch (cleanupError) { error ??= cleanupError; }
    }
    save(`host-repetition-${index}-cleanup.json`, { id, removed, completedAt: new Date().toISOString() });
  }
  if (error) throw error;
}
} finally {
  if (fs.readFileSync(usernsPath, 'utf8').trim() !== usernsBefore) execFileSync('sudo', ['sysctl', '-w', `kernel.apparmor_restrict_unprivileged_userns=${usernsBefore}`], { stdio: 'inherit' });
  const restored = fs.readFileSync(usernsPath, 'utf8').trim();
  save('host-userns.json', { before: usernsBefore, active: usernsActive, restored, restoredSuccessfully: restored === usernsBefore });
  if (restored !== usernsBefore) throw new Error('Host user namespace policy restoration failed');
}
const verify = spawnSync(path.join(root, 'synthesis/node_modules/.bin/tsx'), [path.join(root, 'synthesis/src/wallet-lab/native/verify.ts'), output], { cwd: root, stdio: 'inherit', timeout: coverageRevision === 6 ? 900000 : [1, 2, 3, 4].includes(coverageRevision) ? 180000 : 60000, env: { ...process.env, ...(integrated ? { TPNIL_NATIVE_INTEGRATED: '1' } : {}) } });
if (verify.status !== 0) throw new Error('Native conformance evidence verification failed');
