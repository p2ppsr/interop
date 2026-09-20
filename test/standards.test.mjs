import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { qualifyStandardFixtures } from '../src/standards.mjs';

test('pinned CHIRP and LCH standard fixtures satisfy independent core checks', () => {
  assert.deepEqual(qualifyStandardFixtures(), {
    designation: 'LAB_SELF_TEST_ONLY',
    outcome: 'PASS',
    fixtureCount: 2,
    results: {
      chirp: { vectors: 9, directlyRecomputed: 6 },
      lch: { referenceCases: 10, decryptedSegments: 6, authenticationRejections: 4 }
    }
  });
});

test('standards qualification rejects changed fixture bytes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-standards-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.resolve('fixtures'), path.join(root, 'fixtures'), { recursive: true });
  const fixture = path.join(root, 'fixtures/standards/brc-167/chirp-v1.json');
  const changed = JSON.parse(fs.readFileSync(fixture));
  changed.name = `${changed.name} changed`;
  fs.writeFileSync(fixture, JSON.stringify(changed));
  assert.throws(() => qualifyStandardFixtures(root), /source digest mismatch/);
});
