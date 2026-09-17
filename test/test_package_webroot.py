import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('pack', Path(__file__).parents[1] / 'scripts/package-webroot.py')
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)

class Packaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'web'
        self.root.mkdir()
        (self.root / 'index.html').write_text('<h1>Laboratory packaging fixture</h1>')

    def test_same_bytes_despite_source_mtime_mode_and_directory_name(self):
        first = pack.package(self.root, self.base / 'one.tgz')
        os.utime(self.root / 'index.html', (100, 100))
        os.chmod(self.root / 'index.html', 0o755)
        renamed = self.base / 'renamed-web-root'
        self.root.rename(renamed)
        self.root = renamed
        second = pack.package(self.root, self.base / 'two.tgz')
        self.assertEqual(first, second)
        self.assertEqual((self.base / 'one.tgz').read_bytes(), (self.base / 'two.tgz').read_bytes())
        with tarfile.open(self.base / 'one.tgz', 'r:gz') as tar:
            member = tar.getmember('index.html')
            self.assertEqual((member.uid, member.gid, member.mtime, member.mode), (0, 0, 0, 0o644))
            self.assertEqual(tar.extractfile(member).read(), (self.root / 'index.html').read_bytes())

    def test_refuses_overwrite(self):
        out = self.base / 'one.tgz'
        pack.package(self.root, out)
        with self.assertRaises(FileExistsError):
            pack.package(self.root, out)

    def test_rejects_symlinks(self):
        (self.root / 'linked').symlink_to(self.root / 'index.html')
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            pack.package(self.root, self.base / 'one.tgz')

    def test_rejects_missing_entrypoint_and_embedded_environment(self):
        (self.root / '.env').write_text('fixture-only')
        with self.assertRaisesRegex(ValueError, 'environment'):
            pack.package(self.root, self.base / 'one.tgz')
        (self.root / '.env').unlink()
        (self.root / 'index.html').unlink()
        with self.assertRaisesRegex(ValueError, 'index.html'):
            pack.package(self.root, self.base / 'one.tgz')

    def test_output_cannot_be_packaged_into_itself(self):
        with self.assertRaisesRegex(ValueError, 'outside'):
            pack.package(self.root, self.root / 'one.tgz')

if __name__ == '__main__':
    unittest.main()
