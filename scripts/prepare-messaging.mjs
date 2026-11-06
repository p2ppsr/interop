// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sourceTreeDigest } from '../components/messaging/identity.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json')));
const cache = path.join(root, 'out/messaging-sources');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(cache, { recursive: true });
const paths = {};
for (const component of lock.components) {
  const name = component.repository.split('/')[1];
  const archive = path.join(cache, `${name}-${component.commit}.tgz`);
  if (!fs.existsSync(archive)) {
    const response = await fetch(`https://codeload.github.com/${component.repository}/tar.gz/${component.commit}`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Source fetch HTTP ${response.status}: ${name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha(bytes) !== component.archiveSha256) throw new Error(`Source archive differs: ${name}`);
    fs.writeFileSync(archive, bytes, { flag: 'wx' });
  }
  if (sha(fs.readFileSync(archive)) !== component.archiveSha256) throw new Error(`Source archive differs: ${name}`);
  const directory = path.join(cache, `${name}-${component.commit}`);
  const packageRoot = component.path === '.' ? directory : path.join(directory, component.path);
  // Re-extract source before every build. Prior node_modules or generated source
  // never become part of a new source identity. This is an ignored owned cache.
  fs.rmSync(directory, { recursive: true, force: true });
  if (!fs.existsSync(packageRoot)) {
    execFileSync('tar', ['-xzf', archive, '-C', cache, ...(component.path === '.' ? [] : [`${name}-${component.commit}/${component.path}`])]);
  }
  paths[component.id] = packageRoot;
  if (component.id !== 'go-messagebox') {
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: packageRoot, stdio: 'inherit' });
    if (component.id === 'typescript-messagebox') execFileSync('npm', ['rebuild', 'better-sqlite3'], { cwd: packageRoot, stdio: 'inherit' });
  }
}
const goRoot = paths['go-messagebox'];
const hostDirectory = path.join(goRoot, 'cmd/tpnil-host');
fs.mkdirSync(hostDirectory, { recursive: true });
fs.copyFileSync(path.join(root, 'components/messaging/go-host.go'), path.join(hostDirectory, 'main.go'));
const binary = path.join(cache, 'messagebox-go');
execFileSync('go', ['mod', 'verify'], { cwd: goRoot, env: { ...process.env, GOTOOLCHAIN: lock.go }, stdio: 'inherit' });
execFileSync('go', ['build', '-mod=readonly', '-trimpath', '-o', binary, './cmd/tpnil-host'], { cwd: goRoot, env: { ...process.env, GOTOOLCHAIN: lock.go }, stdio: 'inherit' });
paths['go-binary'] = binary;
fs.writeFileSync(path.join(cache, 'paths.json'), JSON.stringify(paths, null, 2) + '\n');
fs.writeFileSync(path.join(cache, 'build.json'), JSON.stringify({ schema: 'tpnil-messaging-build@1', lockSha256: sha(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json'))), goAdapterSha256: sha(fs.readFileSync(path.join(root, 'components/messaging/go-host.go'))), goBinarySha256: sha(fs.readFileSync(binary)), sourceTreeDigests: Object.fromEntries(lock.components.map(c => [c.id, sourceTreeDigest(paths[c.id])])), sourceArchives: lock.components.map(c => ({ id: c.id, sha256: c.archiveSha256, commit: c.commit })), paths }, null, 2) + '\n');
console.log('Prepared pinned TS/Go Message Box and discovery components.');
