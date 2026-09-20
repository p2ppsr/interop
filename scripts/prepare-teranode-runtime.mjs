#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonical, digest, parseJson } from '../src/json.mjs';

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument)
  throw new Error('Usage: prepare-teranode-runtime.mjs <quickstart-source> <new-output-directory>');
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const profilePath = path.join(root, 'infra/profiles/teranode-regtest.json');
const profileBytes = fs.readFileSync(profilePath);
const profile = parseJson(profileBytes);
const source = fs.realpathSync(sourceArgument);
const output = path.resolve(outputArgument);
if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: source, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source, encoding: 'utf8' }).trim();
if (commit !== profile.source.commit || origin !== profile.source.repository || dirty !== '')
  throw new Error('Teranode Quickstart source does not match the clean pinned revision');

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-teranode-'));
try {
  const archive = path.join(staging, 'source.tar');
  fs.writeFileSync(archive, execFileSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: source, maxBuffer: 64 * 1024 * 1024 }));
  fs.mkdirSync(output, { recursive: true });
  execFileSync('tar', ['-xf', archive, '-C', output]);
  const environment = [
    'TERANODE_VERSION=v0.15.9',
    'network=regtest',
    'SETTINGS_CONTEXT=docker.m',
    'minminingtxfee=0',
    'blockmaxsize=4294967296',
    'excessiveblocksize=10737418240',
    'HOST_IP=127.0.0.1',
    'logLevel=INFO',
    'listen_mode=listen_only',
    'asset_httpPublicAddress=',
    'p2p_advertise_addresses=',
    `rpc_user=${profile.rpc.username}`,
    `rpc_pass=${profile.rpc.password}`,
    'clientName=tpnil-regtest',
    'p2p_health_check_enabled=false',
    'p2p_dht_mode=off',
    'legacy_config_ConnectPeers=',
    'POSTGRES_PASSWORD=tpnil-regtest-postgres',
    'pruner_block_trigger=OnBlockMined',
    `COMPOSE_PROFILES=${profile.composeProfiles.join(',')}`,
    'MEM_LIMIT_BLOCKCHAIN=1536m',
    'MEM_LIMIT_ASSET=512m',
    'MEM_LIMIT_LEGACY=512m',
    'MEM_LIMIT_SUBTREEVALIDATION=768m',
    'MEM_LIMIT_BLOCKVALIDATION=768m',
    'MEM_LIMIT_BLOCKASSEMBLY=768m',
    'MEM_LIMIT_PROPAGATION=768m',
    'MEM_LIMIT_RPC=512m',
    'MEM_LIMIT_PRUNER=512m'
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(output, '.env'), environment, { mode: 0o600 });
  // The laboratory exposes only the SUT boundaries it exercises. Database,
  // Kafka and Aerospike ports remain on the isolated Compose network, which
  // also prevents collisions with unrelated local development services.
  const composeOverride = [
    'services:',
    '  aerospike:',
    '    ports: !reset []',
    '  kafka-shared:',
    '    ports: !reset []',
    '  postgres:',
    '    ports: !reset []',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(output, 'docker-compose.override.yml'), composeOverride, { mode: 0o644 });
  const manifest = {
    schemaVersion: '1.0.0',
    profile: profile.id,
    source: profile.source,
    image: profile.image,
    profileSha256: digest(profileBytes),
    environmentSha256: digest(Buffer.from(environment)),
    composeOverrideSha256: digest(Buffer.from(composeOverride))
  };
  fs.writeFileSync(path.join(output, 'tpnil-runtime.json'), `${canonical(manifest)}\n`, { mode: 0o644 });
  process.stdout.write(`${canonical({ prepared: true, output, ...manifest })}\n`);
} catch (error) {
  if (fs.existsSync(output)) fs.rmSync(output, { recursive: true, force: true });
  throw error;
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
