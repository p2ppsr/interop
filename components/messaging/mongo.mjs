// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
export const mongoImage = 'mongo@sha256:1f995ad6fdb93244a1addab1b58f934a0bc2f5643c38e02f5e9d7f0c7d227a7b';
export async function startMessagingMongo() {
  if (process.env.TPNIL_GO_MONGO_URI) return { uri: process.env.TPNIL_GO_MONGO_URI, async close() { return { component: 'messaging-mongo', ownership: 'caller', closedByCaller: true }; } };
  const name = `tpnil-messaging-${process.pid}-${Date.now()}`;
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let created = false;
  const shell = code => docker(['exec', '--env', 'HOME=/tmp', name, 'mongosh', '--quiet', '--eval', code]);
  try {
    docker(['run', '--detach', '--name', name, '--label', 'tpnil.scope=messaging-qualification', '--publish', '127.0.0.1::27017', '--memory', '1536m', '--cpus', '1', '--pids-limit', '256', '--tmpfs', '/data/db:rw,size=1024m', '--tmpfs', '/data/configdb:rw,size=64m', '--tmpfs', '/tmp:rw,size=64m', mongoImage, '--bind_ip_all', '--wiredTigerCacheSizeGB', '0.25', '--replSet', 'tpnil']);
    created = true;
    const port = JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports['27017/tcp'][0].HostPort;
    for (let attempt = 0; ; attempt++) {
      try { shell('db.adminCommand({ping:1})'); break; } catch (error) { if (attempt === 40) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    shell('rs.initiate({_id:"tpnil",members:[{_id:0,host:"127.0.0.1:27017"}]})');
    for (let attempt = 0; ; attempt++) {
      if (shell('db.hello().isWritablePrimary') === 'true') break;
      if (attempt === 40) throw new Error('Mongo primary not ready');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return { name, image: mongoImage, uri: `mongodb://127.0.0.1:${port}/?directConnection=true`, async close() {
      docker(['stop', '--time', '15', name]); const receipt = JSON.parse(docker(['inspect', name]))[0];
      docker(['rm', name]);
      const remaining = docker(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.ID}}']);
      if (receipt.State.Running || remaining) throw new Error('Messaging Mongo did not terminate/remove');
      return { component: 'messaging-mongo', name, image: receipt.Image, running: receipt.State.Running, exitCode: receipt.State.ExitCode, removed: !remaining };
    }};
  } catch (error) {
    if (created) { docker(['stop', '--time', '15', name]); docker(['rm', name]); }
    throw error;
  }
}
