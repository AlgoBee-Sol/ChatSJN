import json
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from extract_sjn import (
    DocumentHTML, Fetcher, article_from, asset_type, chapter_url,
    digest, extract, linked_assets, page_props, public_url, safe_id, slug, write_json,
)


class ExtractionTests(unittest.TestCase):
    def test_urdu_paragraphs_entities_and_hidden_markup(self):
        p = DocumentHTML()
        p.feed('<html><head><style>NO CSS</style><title>NO TITLE</title></head>'
               '<body><p>آداب &amp; اخلاق</p><p>دوسرا &#x627; لفظ</p>'
               '<script>NO SCRIPT</script><h1>عنوان</h1><p>آخر</p></body></html>')
        self.assertEqual(p.text, 'آداب & اخلاق\n\nدوسرا ا لفظ\n\nعنوان\n\nآخر')

    def test_site_malformed_self_closing_paragraphs(self):
        p = DocumentHTML()
        p.feed('<p class="title">عنوان<p/><p>عبارت</p>')
        self.assertEqual(p.text, 'عنوان\n\nعبارت')

    def test_error_page_is_not_source_text(self):
        props = page_props('<script id="__NEXT_DATA__" type="application/json">'
                           '{"props":{"pageProps":{"error":"Not available"}}}</script>')
        with self.assertRaisesRegex(ValueError, 'Not available'):
            article_from(props, '123')
        with self.assertRaisesRegex(ValueError, 'Temporary reader failure'):
            article_from({'serverError': 'Temporary reader failure'}, '123')

    def test_publication_and_identity_are_checked(self):
        for article in ({'_id': '123', 'isPublished': False}, {'_id': '456', 'isPublished': True}):
            with self.assertRaises(ValueError):
                article_from({'article': article}, '123')

    def test_links_catalog_media_without_treating_content_ids_as_urls(self):
        links = linked_assets({'contentUrl': 'abc123', 'contentData':
                               '<a href="/files/book.pdf">PDF</a><iframe src="https://www.youtube.com/embed/abc"></iframe>'},
                              'https://www.syedjawadnaqvi.com/kutub')
        self.assertEqual(len(links), 2)
        self.assertEqual({asset_type(u) for u in links}, {'pdf', 'recording'})
        self.assertEqual(asset_type('https://example.com/book.pdf?download=1'), 'pdf')
        self.assertEqual(asset_type('https://example.com/audio.mp3'), 'recording')
        self.assertEqual(asset_type('https://www.youtube.com/@Publisher'), 'recording_channel')

    def test_public_urls_reject_active_schemes_and_credentials(self):
        for url in ('javascript:alert(1)', 'data:text/plain,hello', 'https://user:pass@example.com', 'https://example.com:8080/', 'https://example.com:invalid/'):
            self.assertIsNone(public_url(url))

    def test_identifiers_cannot_escape_archive_directories(self):
        self.assertTrue(safe_id('67cca9cca4f8fbdf012b77e1'))
        for value in ('../credentials', '/tmp/escape', '..', '', None, 'id?query=1'):
            self.assertFalse(safe_id(value))

    def test_actual_site_slug_and_chapter_url(self):
        self.assertEqual(slug('عرضِ ناشر'), 'arze-nashr')
        self.assertEqual(slug('فہرستِ مطالب'), 'fhrste-mtalb')
        self.assertEqual(slug('آدابِ اسلامی'), 'idabe-islami')
        self.assertEqual(chapter_url('book', {}, {'_id': '123', 'title': 'عرضِ ناشر'}),
                         'https://www.syedjawadnaqvi.com/kutub/123/arze-nashr')

    def test_verified_cache_avoids_network(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fetch = Fetcher(root, .5)
            url = 'https://www.syedjawadnaqvi.com/kutub'
            body = b'public archive response'
            (root / 'cache' / f'{digest(url)}.body').write_bytes(body)
            write_json(root / 'cache' / f'{digest(url)}.json', {'status': 200, 'sha256': digest(body)})
            with patch('extract_sjn.build_opener', side_effect=AssertionError('Network must not be called')):
                self.assertEqual(fetch.get(url)[1], body)
            with self.assertRaisesRegex(ValueError, 'outside permitted'):
                fetch.get('https://127.0.0.1/private')

    def test_archive_coverage_and_review_boundary(self):
        chapters = [{'_id': str(i), 'title': title, 'isPublished': True} for i, title in
                    enumerate(['=Untrusted title', 'Duplicate text', 'Unavailable'], 1)]
        collection = {'_id': 'book', 'title': 'کتاب', 'isPublished': True,
                      'chapterIds': ['1', '2', '3', 'missing'], 'chapters': chapters}

        class OfflineFetcher:
            robots = None

            def __init__(self, *args):
                pass

            def get(self, url, **options):
                return {'status': 404}, b''

            def page(self, url, **options):
                listings = {'/': {'allContent': []}, '/kutub': {'bookList': [collection]},
                            '/magazines': {'magazineList': []}, '/categories': {'categories': []},
                            '/duroos': {'duroos': [{'_id': 'private', 'isPublished': False}]}, '/live': {}}
                path = url.removeprefix('https://www.syedjawadnaqvi.com')
                if path.startswith('/en'):
                    props = {'error': 'No English catalog'}
                elif path in listings:
                    props = listings[path]
                else:
                    ident = path.split('/')[2]
                    props = {'error': 'Not available'} if ident == '3' else {'article': {
                        '_id': ident, 'isPublished': True, 'authorID': None,
                        'contentData': '<p>اصل عبارت</p><iframe src="https://www.youtube.com/embed/example"></iframe>'}}
                return props, {'fetchedAt': '2026-01-01T00:00:00Z', 'sha256': 'test-hash'}

        with tempfile.TemporaryDirectory() as temp, patch('extract_sjn.Fetcher', OfflineFetcher), contextlib.redirect_stdout(io.StringIO()):
            root = Path(temp)
            report = extract(root)
            self.assertEqual(report['chapters'], 3)
            self.assertEqual(report['textDocuments'], 2)
            self.assertEqual(report['unavailableDocuments'], 1)
            self.assertEqual(report['unresolvedChapterIds'], 1)
            self.assertEqual(report['unpublishedEntriesExcluded'], 1)
            self.assertEqual(report['exactDuplicateTextGroups'], [['1', '2']])
            self.assertEqual(report['recordingUrls'], 1)
            self.assertFalse(report['publishedToApplication'])
            records = [json.loads(line) for line in (root / 'records.jsonl').read_text().splitlines()]
            self.assertTrue(all(r['rightsStatus'] == 'NOT_ATTESTED' for r in records))
            self.assertIn("'=Untrusted title", (root / 'catalog.csv').read_text())
            self.assertEqual(list((root / 'pdfs').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
