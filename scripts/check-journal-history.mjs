import { execFileSync } from 'node:child_process';
const [base] = process.argv.slice(2);
if (!base || /^0+$/.test(base)) {
  console.log('No prior revision: initial journal history');
} else if (execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { encoding: 'utf8' }).trim().split(/\s+/).length === 1) {
  // A replacement genesis establishes an empty journal, never carries rewritten evidence.
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', 'journals/'], { encoding: 'utf8' }).split('\0').filter(p => p && p !== 'journals/README.md');
  if (files.length) throw new Error('Replacement genesis must have an empty evidence journal');
  console.log('Initial commit: empty evidence journal');
} else {
  const revision = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], { encoding: 'utf8' }).trim();
  execFileSync('git', ['merge-base', '--is-ancestor', revision, 'HEAD']);
  const changed = execFileSync('git', ['diff', '--no-renames', '--name-only', '--diff-filter=DMT', '-z', revision, 'HEAD', '--', 'journals/'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  // README is policy prose. Published evidence files are immutable.
  const evidence = changed.filter(p => p !== 'journals/README.md');
  if (evidence.length) throw new Error(`Published journal files modified or removed: ${evidence.join(', ')}`);
  console.log('Existing published journal evidence preserved');
}
