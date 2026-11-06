// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function sourceTreeDigest(directory) {
  const files = [];
  function walk(current, relative = '') {
    for (const name of fs.readdirSync(current).sort()) {
      if (name === 'node_modules') continue;
      const item = path.join(current, name), rel = relative ? `${relative}/${name}` : name, stat = fs.lstatSync(item);
      if (stat.isDirectory()) walk(item, rel);
      else if (stat.isFile()) files.push([rel, sha256(fs.readFileSync(item))]);
      else if (stat.isSymbolicLink()) files.push([rel, `symlink:${fs.readlinkSync(item)}`]);
      else throw new Error(`Unexpected source object ${rel}`);
    }
  }
  walk(directory);
  return sha256(JSON.stringify(files));
}
export function verifyMessagingBuild(root, paths) {
  const build = JSON.parse(fs.readFileSync(path.join(path.dirname(paths['go-binary']), 'build.json')));
  if (build.lockSha256 !== sha256(fs.readFileSync(path.join(root, 'components/messaging/sources.lock.json')))) throw new Error('Messaging source lock differs from prepared build');
  if (build.goAdapterSha256 !== sha256(fs.readFileSync(path.join(root, 'components/messaging/go-host.go')))) throw new Error('Go adapter differs from prepared binary');
  if (build.goBinarySha256 !== sha256(fs.readFileSync(paths['go-binary']))) throw new Error('Go binary differs from prepared build');
  for (const [id, digest] of Object.entries(build.sourceTreeDigests)) if (sourceTreeDigest(paths[id]) !== digest) throw new Error(`Prepared source changed: ${id}`);
  return build;
}
