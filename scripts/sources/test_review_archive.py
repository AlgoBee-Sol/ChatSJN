import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from review_archive import is_front_matter, review


class ReviewTests(unittest.TestCase):
    def test_mislabeled_front_matter_is_excluded(self):
        for title, text in [('_TOC', 'فہرست مطالب\nChapter list'),
                            ('jild 02 TOC', 'Contents'),
                            ('arz e nashir', 'Publisher notes'),
                            ('Generic title', 'عرضِ ناشر\nPublisher notes')]:
            self.assertTrue(is_front_matter(title, text))
        self.assertFalse(is_front_matter('علم', 'علم کی اہمیت\nفہرست مطالب'))

    def test_cross_archive_duplicates_and_corruption_do_not_enter_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, baseline, output = root / 'new', root / 'old', root / 'review'
            (archive / 'text').mkdir(parents=True)
            (baseline / 'records').mkdir(parents=True)
            text = 'علم اور قرآن کی تعلیم کی اہمیت۔ ' * 10
            digest = hashlib.sha256(text.encode()).hexdigest()
            (baseline / 'records/old.json').write_text(json.dumps({'status': 'TEXT_EXTRACTED', 'id': 'old', 'textSha256': digest}))
            records = []
            for ident, body, expected_hash in [('duplicate', text, digest), ('corrupt', text + 'changed', digest)]:
                (archive / f'text/{ident}.txt').write_text(body + '\n')
                records.append(dict(id=ident, title='تعلیم', status='TEXT_EXTRACTED', textPath=f'text/{ident}.txt',
                                    textSha256=expected_hash, characters=len(body),
                                    url=f'https://www.syedjawadnaqvi.com/{ident}',
                                    metadata={'_id': ident, 'isPublished': True}))
            (archive / 'records.jsonl').write_text('\n'.join(json.dumps(r) for r in records))
            with contextlib.redirect_stdout(io.StringIO()):
                review(archive, output, baseline)
            report = json.loads((output / 'review.json').read_text())
            self.assertEqual(report['eligible'], 0)
            self.assertEqual(report['exclusions'], {'EXACT_DUPLICATE': 1, 'INTEGRITY_FAILURE': 1})
            self.assertEqual((output / 'manifest.jsonl').read_text(), '')


if __name__ == '__main__':
    unittest.main()
