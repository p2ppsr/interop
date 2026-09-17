import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/core.mjs';
import { verifyJournal } from '../src/journal.mjs';
let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Published journal tree contains a symlink');
    if (entry.isDirectory()) walk(file);
    else if (entry.name === 'journal.jsonl') { verifyJournal(dir); count++; }
  }
}
walk(path.join(ROOT, 'journals'));
console.log(JSON.stringify({ verifiedPublishedSelfTestJournals: count, officialSutRuns: 0 }));
