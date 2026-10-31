#!/usr/bin/env python3
"""Collect newly listed SJN chapter IDs against an existing local archive.

This is an additive catalog check, not a full revision audit of existing texts.
New originals remain unreviewed and are never published by this command.
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode
from urllib.robotparser import RobotFileParser

from extract_sjn import (Fetcher, ORIGIN, USER_AGENT, article_from, chapter_url,
                         digest, now, parse_html, safe_id, write_json)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, default=Path('.local/sources/syedjawadnaqvi/archive'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.output
    for name in ('text', 'html', 'records', 'pages'):
        (root / name).mkdir(parents=True, exist_ok=True)
    previous = [json.loads(p.read_text()) for p in (args.baseline / 'records').glob('*.json')]
    if not previous:
        raise ValueError('A populated baseline archive is required')
    known = {r['id'] for r in previous if r.get('status') == 'TEXT_EXTRACTED'}
    hashes = {r['textSha256']: r['id'] for r in previous if r.get('textSha256')}
    fetch = Fetcher(root, delay=1)
    meta, raw = fetch.get(ORIGIN + '/robots.txt')
    if meta['status'] == 200 and 'html' not in meta['contentType']:
        fetch.robots = RobotFileParser()
        fetch.robots.parse(raw.decode().splitlines())
        fetch.delay = max(1, fetch.robots.crawl_delay(USER_AGENT) or 0)
    elif meta['status'] not in (404, 410):
        raise ValueError('Cannot establish robots rules')
    catalogs = {}
    for path in ('/', '/kutub', '/magazines', '/duroos'):
        data, meta = fetch.page(ORIGIN + path)
        write_json(root / 'pages' / (digest(path) + '.json'), dict(provenance=meta, data=data))
        catalogs[path] = data
    groups = [('book', catalogs['/kutub']['bookList']),
              ('magazine', catalogs['/magazines']['magazineList']),
              ('duroos', catalogs['/duroos']['duroos']),
              ('series', [c for g in catalogs['/'].get('allContent', [])
                          if g.get('contentType') == 'series' and g.get('isPublished') is True
                          for c in g.get('listofchapters', [])])]
    tasks, errors, collections = {}, [], []
    for kind, entries in groups:
        for collection in entries:
            if collection.get('isPublished') is not True or not safe_id(collection.get('_id')):
                continue
            collections.append(dict(kind=kind, id=collection['_id'], title=collection['title']))
            chapters = collection.get('chapters', [])
            listed = set(collection.get('chapterIds', [])) | {c['_id'] for c in chapters}
            if listed and listed <= known:
                continue
            if kind in ('duroos', 'series'):
                try:
                    listing, _ = fetch.page(ORIGIN + '/api/serverData?' + urlencode({'type': 'series', 'id': collection['_id']}))
                    chapters = listing.get('chapters', [])
                    if not chapters and listed:
                        raise ValueError('Missing chapter listing')
                except Exception as e:
                    errors.append(dict(collectionId=collection['_id'], error=str(e)))
                    continue
            for chapter in chapters:
                ident = chapter.get('_id')
                if not safe_id(ident) or ident in known or chapter.get('isPublished') is not True:
                    continue
                tasks[ident] = dict(id=ident, kind=kind, title=chapter['title'],
                                    collectionId=collection['_id'], collectionTitle=collection['title'],
                                    collectionAuthor=collection.get('authorID'),
                                    url=chapter_url(kind, collection, chapter))
    print(f'Found {len(tasks)} newly listed published chapters across {len(collections)} collections', flush=True)
    records = []
    for ident, task in tasks.items():
        record = dict(**task, reviewStatus='UNREVIEWED', rightsStatus='NOT_ATTESTED', sourceSite=ORIGIN)
        try:
            props, meta = fetch.page(task['url'])
            article = article_from(props, ident)
            raw = article.get('contentData')
            if not isinstance(raw, str):
                raise ValueError('Missing article text')
            text = parse_html(raw).text
            if len(text) < 20 or '\ufffd' in text or '\0' in text:
                raise ValueError('Text needs extraction-quality review')
            text_hash = digest(text)
            record.update(status='TEXT_EXTRACTED', fetchedAt=meta['fetchedAt'],
                          responseSha256=meta['sha256'], textSha256=text_hash,
                          characters=len(text), textPath=f'text/{ident}.txt', htmlPath=f'html/{ident}.html',
                          duplicateOf=hashes.get(text_hash), metadata={k: v for k, v in article.items() if k != 'contentData'})
            (root / record['textPath']).write_text(text + '\n')
            (root / record['htmlPath']).write_text(raw)
            hashes.setdefault(text_hash, ident)
            print(f"Collected {ident}: {len(text)} characters", flush=True)
        except Exception as e:
            record.update(status='UNAVAILABLE', error=str(e))
            errors.append(dict(id=ident, error=str(e)))
        records.append(record)
        write_json(root / 'records' / (ident + '.json'), record)
    write_json(root / 'collections.json', collections)
    with (root / 'catalog.csv').open('w', newline='') as f:
        fields = ['id', 'kind', 'title', 'collectionTitle', 'url', 'status', 'characters', 'duplicateOf', 'textPath']
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(records)
    report = dict(generatedAt=now(), baseline=str(args.baseline), baselineTexts=len(known),
                  collectionsChecked=len(collections), newChapterIDs=len(tasks),
                  textsCollected=sum(r.get('status') == 'TEXT_EXTRACTED' for r in records),
                  exactDuplicates=sum(bool(r.get('duplicateOf')) for r in records),
                  charactersCollected=sum(r.get('characters', 0) for r in records),
                  publishedToApplication=False, errors=errors,
                  scope='New IDs in public book/magazine/duroos/home series catalogs only; existing-ID revisions and category-only entries not checked.')
    report['distinctNewTexts'] = report['textsCollected'] - report['exactDuplicates']
    report['newTextsByCollection'] = dict(Counter(r['collectionTitle'] for r in records if r.get('status') == 'TEXT_EXTRACTED'))
    write_json(root / 'report.json', report)
    (root / 'records.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records))
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
