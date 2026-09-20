import fs from 'node:fs';
import path from 'node:path';
import { verifyIntakeReview } from '../src/intake.mjs';
import { ROOT } from '../src/core.mjs';
import { verifyJournal } from '../src/journal.mjs';
import { verifyQualification } from '../src/qualification.mjs';
let count = 0, intakeCount = 0, qualificationCount = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Published journal tree contains a symlink');
    if (entry.isDirectory()) walk(file);
    else if (file.startsWith(path.join(ROOT, 'journals/intake') + path.sep) && entry.name.endsWith('.json')) {
      verifyIntakeReview(file, path.join(ROOT, 'journals/intake/objects')); intakeCount++;
    }
    else if (file.startsWith(path.join(ROOT, 'journals/qualification') + path.sep) && entry.name === 'record.json') {
      verifyQualification(dir); qualificationCount++;
    }
    else if (entry.name === 'journal.jsonl') { verifyJournal(dir); count++; }
  }
}
walk(path.join(ROOT, 'journals'));
console.log(JSON.stringify({ verifiedPublishedSelfTestJournals: count, verifiedIntakeReviews: intakeCount, verifiedInfrastructureQualifications: qualificationCount, officialSutRuns: 0 }));
