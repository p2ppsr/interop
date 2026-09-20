import fs from 'node:fs';
import path from 'node:path';
import { verifyIntakeReview } from '../src/intake.mjs';
import { ROOT } from '../src/core.mjs';
import { verifyJournal } from '../src/journal.mjs';
import { verifyQualification } from '../src/qualification.mjs';
import { verifyNativeQualification } from '../src/native-qualification.mjs';
import { verifyComponentQualification } from '../src/component-qualification.mjs';
import { verifyRuntimeQualification } from '../src/runtime-qualification.mjs';
import { verifyReferenceQualification } from '../src/reference-qualification.mjs';
import { verifySynthesisStackQualification } from '../src/synthesis-stack-qualification.mjs';
let count = 0, intakeCount = 0, qualificationCount = 0, nativeQualificationCount = 0;
let componentQualificationCount = 0, runtimeQualificationCount = 0;
let referenceQualificationCount = 0;
let synthesisStackCount = 0;
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
    else if (file.startsWith(path.join(ROOT, 'journals/native-qualification') + path.sep) && entry.name === 'record.json') {
      verifyNativeQualification(dir); nativeQualificationCount++;
    }
    else if (file.startsWith(path.join(ROOT, 'journals/component-qualification') + path.sep) && entry.name === 'record.json') {
      verifyComponentQualification(dir); componentQualificationCount++;
    }
    else if (file.startsWith(path.join(ROOT, 'journals/runtime-qualification') + path.sep) && entry.name === 'record.json') {
      verifyRuntimeQualification(dir); runtimeQualificationCount++;
    }
    else if (file.startsWith(path.join(ROOT, 'journals/reference-qualification') + path.sep) && entry.name === 'record.json') {
      verifyReferenceQualification(dir); referenceQualificationCount++;
    }
    else if (file.startsWith(path.join(ROOT, 'journals/synthesis-stack-qualification') + path.sep) && entry.name === 'result.json') {
      verifySynthesisStackQualification(dir); synthesisStackCount++;
    }
    else if (entry.name === 'journal.jsonl') { verifyJournal(dir); count++; }
  }
}
walk(path.join(ROOT, 'journals'));
console.log(JSON.stringify({
  verifiedPublishedSelfTestJournals: count,
  verifiedIntakeReviews: intakeCount,
  verifiedInfrastructureQualifications: qualificationCount,
  verifiedNativeInfrastructureQualifications: nativeQualificationCount,
  verifiedComponentQualifications: componentQualificationCount,
  verifiedRuntimeQualifications: runtimeQualificationCount,
  verifiedReferenceQualifications: referenceQualificationCount,
  verifiedSynthesisStacks: synthesisStackCount,
  officialSutRuns: 0
}));
