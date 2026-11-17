import path from 'node:path';
import { createWalletProfileSelfTest } from '../src/wallet-profile-self-test.mjs';
import { evaluateWalletProfiles } from '../src/wallet-profiles.mjs';
const output = process.argv[2];
if (!output || process.argv.length !== 3) throw new Error('Usage: node scripts/create-isi5-self-test.mjs <new-output-directory>');
const fixture = createWalletProfileSelfTest(path.resolve(output));
process.stdout.write(JSON.stringify(evaluateWalletProfiles(fixture.plan, fixture.record, fixture.directory), null, 2) + '\n');
