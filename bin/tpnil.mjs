#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { checkRepository } from '../src/core.mjs';
import { runDemo } from '../src/demo.mjs';
import { verifyJournal, verifyPrefix } from '../src/journal.mjs';

try {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'check' && args.length === 0) result = checkRepository();
  else if (command === 'demo' && args.length <= 1) result = runDemo(args[0] ?? 'out/demo');
  else if (['verify', 'replay'].includes(command) && args.length === 1) {
    const state = verifyJournal(args[0]);
    result = { verifiedRuns: state.entries.length, replayed: true, head: state.head, claim: 'LAB_SELF_TEST_ONLY', outcomes: state.results.map(x => x.overall) };
    if (state.results.some(r => r.overall !== 'PASS')) process.exitCode = 1;
  } else if (command === 'verify-prefix' && args.length === 2) result = verifyPrefix(args[0], args[1]);
  else if (command === 'verify-artifact' && args.length === 2 && /^[a-f0-9]{64}$/.test(args[1])) {
    const hash = createHash('sha256'); let size = 0;
    if (!fs.lstatSync(args[0]).isFile()) throw new Error('Expected regular artifact file');
    for await (const chunk of fs.createReadStream(args[0])) { hash.update(chunk); size += chunk.length; }
    const actual = hash.digest('hex');
    if (actual !== args[1]) throw new Error('Artifact digest mismatch');
    result = { sha256: actual, size, verified: true };
  } else throw new Error('Usage: tpnil check | demo [new-directory] | verify <journal> | replay <journal> | verify-prefix <old> <new> | verify-artifact <file> <sha256>');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`TPNIL ERROR: ${error.message}\n`);
  process.exitCode = 2;
}
