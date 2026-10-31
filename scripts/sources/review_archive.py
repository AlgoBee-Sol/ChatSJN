"""Reproducible technical review; never a claim of scholarly certification."""
import argparse
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse


def normalize(text):
    return re.sub(r'[\u064b-\u065f\u0670\u0640]', '', unicodedata.normalize('NFKC', text)).replace('ي', 'ی').replace('ك', 'ک')


def is_front_matter(title, text):
    first_line = next((normalize(line).strip(' _:\t') for line in text.splitlines() if line.strip()), '')
    labels = {'عرض ناشر', 'فہرست مطالب'}
    return (normalize(title).strip(' _:\t') in labels or first_line in labels
            or bool(re.search(r'\btoc\b|\barz[ _-]+e[ _-]+nash[ie]r\b', title.replace('_', ' '), re.I)))


def review(archive, output, baseline=None, existing_index=None):
    output.mkdir(parents=True, exist_ok=True)
    records = [json.loads(line) for line in (archive / 'records.jsonl').read_text().splitlines()]
    seen, decisions, approved = {}, [], []
    if baseline:
        for path in sorted((baseline / 'records').glob('*.json')):
            old = json.loads(path.read_text())
            if old.get('status') == 'TEXT_EXTRACTED' and old.get('textSha256'):
                seen.setdefault(old['textSha256'], old['id'])
    if existing_index:
        snapshot = json.loads(existing_index.read_text())
        for row in snapshot['results'][2]['results']:
            if row.get('hash'):
                seen[row['hash']] = row['id']
    for record in records:
        if record.get('status') != 'TEXT_EXTRACTED' or not record.get('textPath'):
            decisions.append({'id': record['id'], 'decision': 'EXCLUDED', 'reason': 'EXTRACTION_NOT_READY'})
            continue
        text_path = (archive / record['textPath']).resolve()
        if not text_path.is_relative_to(archive.resolve()):
            raise ValueError('Text path escapes archive')
        text = text_path.read_text(encoding='utf-8').removesuffix('\n')
        digest = hashlib.sha256(text.encode()).hexdigest()
        title = normalize(record['title'])
        reason = None
        if digest != record['textSha256'] or len(text) != record['characters']:
            reason = 'INTEGRITY_FAILURE'
        elif record.get('qualityFlags', []) or '\ufffd' in text or '\0' in text or len(text) < 100:
            reason = 'QUALITY_REVIEW_REQUIRED'
        elif (urlparse(record['url']).scheme != 'https'
              or urlparse(record['url']).hostname != 'www.syedjawadnaqvi.com'
              or record['metadata'].get('isPublished') is not True
              or record['metadata'].get('_id') != record['id']):
            reason = 'PROVENANCE_REVIEW_REQUIRED'
        elif is_front_matter(title, text):
            reason = 'PUBLISHER_FRONT_MATTER'
        elif digest in seen:
            reason = 'EXACT_DUPLICATE'
        if reason:
            decisions.append({'id': record['id'], 'decision': 'EXCLUDED', 'reason': reason, 'duplicateOf': seen.get(digest)})
            continue
        seen[digest] = record['id']
        normalized = normalize(text)
        groups = {
            'AKHLAQ': ['اخلاق', 'تقوی', 'ادب', 'تربیت', 'انسان', 'سچ', 'جھوٹ'],
            'QURAN': ['قرآن', 'قران', 'آیت', 'سورہ', 'تفسیر'],
            'HADITH': ['حدیث', 'احادیث', 'روایت', 'نہج البلاغہ', 'حکمت'],
            'AQAID': ['عقیدہ', 'عقائد', 'توحید', 'امامت', 'نبوت', 'خدا', 'اللہ'],
            'HISTORY': ['تاریخ', 'کربلا', 'واقعہ', 'حکومت', 'حالات', 'جنگ'],
        }
        topics = [topic for topic, terms in groups.items() if any(term in normalized for term in terms)]
        if not topics:
            decisions.append({'id': record['id'], 'decision': 'EXCLUDED', 'reason': 'TOPIC_REVIEW_REQUIRED'})
            continue
        publication = record['collectionTitle']
        attribution = ('Collection credits Syed Jawad Naqvi; individual chapter byline is absent.'
                       if record.get('collectionAuthor') and 'جواد' in record['collectionAuthor']
                       else 'Published by syedjawadnaqvi.com; individual author is not identified in metadata.')
        scholar = 'سید جواد نقوی' if 'Collection credits' in attribution else 'سید جواد نقوی کی ویب سائٹ'
        entry = {
            'archiveId': record['id'], 'textPath': str(text_path),
            'metadata': {
                'title': f"{publication} — {record['title']}"[:200],
                'scholar': scholar, 'sourceCategory': 'EDUCATIONAL', 'religiousAuthorityId': 'JAWAD_NAQVI',
                'topics': topics, 'language': 'ur', 'originalSourceURL': record['url'],
                'publication': publication[:500], 'version': f"archive-{digest[:24]}",
                'section': record['title'][:200], 'rulingNumber': '', 'rightsConfirmed': True,
            },
            'review': {
                'method': 'automated-provenance-and-quality-review', 'archiveId': record['id'],
                'textSha256': digest, 'attribution': attribution,
                'rightsBasis': 'Operator authorized source use; license not independently verified.',
            },
        }
        approved.append(entry)
        decisions.append({'id': record['id'], 'decision': 'ELIGIBLE', 'topics': topics})
    (output / 'manifest.jsonl').write_text(''.join(json.dumps(item, ensure_ascii=False) + '\n' for item in approved))
    report = {
        'method': 'Automated integrity, provenance, deduplication and extraction-quality review; sampled text inspection by coding assistant.',
        'limitations': ['Not a qualified scholarly review or verification of every assertion.',
                       'Historical/current-affairs passages reflect their publication context, not verified current facts.',
                       'No independently verified copyright license; operator authorized use of this source.',
                       'Topics use keyword matching. Fiqh use is excluded. No recordings were transcribed.'],
        'total': len(records), 'eligible': len(approved),
        'baselineArchive': str(baseline) if baseline else None,
        'existingIndexSnapshot': str(existing_index) if existing_index else None,
        'exclusions': dict(collections.Counter(x['reason'] for x in decisions if x['decision'] == 'EXCLUDED')),
        'decisions': decisions,
    }
    (output / 'review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'decisions'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, default=Path('.local/sources/syedjawadnaqvi/archive'))
    parser.add_argument('--output', type=Path, default=Path('.local/sources/syedjawadnaqvi/indexing'))
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--existing-index', type=Path)
    args = parser.parse_args()
    review(args.archive, args.output, args.baseline, args.existing_index)
