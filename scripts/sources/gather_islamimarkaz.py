#!/usr/bin/env python3
"""Gather a local, unreviewed lecture catalog and optional bounded audio pilot.

Reads public server-rendered data, never executes downloaded JavaScript. No
publication, transcription, paid API calls, login or video downloads.
"""
import argparse
import csv
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

ORIGIN = 'https://islamimarkaz.com'
HOSTS = {'islamimarkaz.com', 'imarkaz.b-cdn.net'}
UA = 'SJN-AI-SourceArchive/1.0 (user-requested public source research)'
TOPICS = [540, 541, 1458, 1340, 1461, 1534, 587, 588, 726, 777]


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def validate_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None, 443):
        raise ValueError('URL outside the explicit public host allowlist')


class Redirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Archive:
    def __init__(self, root):
        self.root, self.last, self.robots = root, {}, {}
        self.opener = build_opener(Redirect())

    def get(self, url, limit=8_000_000, robot=False):
        validate_url(url)
        host = urlsplit(url).hostname
        key = sha(url.encode())
        body, meta = self.root / 'raw' / (key + '.bin'), self.root / 'raw' / (key + '.json')
        if body.exists() and meta.exists():
            data, info = body.read_bytes(), json.loads(meta.read_text())
            if sha(data) != info['sha256']:
                raise ValueError('Cached response hash mismatch')
            if len(data) > limit:
                raise ValueError('Cached response exceeds size limit')
            return data, info
        if not robot and host not in self.robots:
            rp = RobotFileParser()
            try:
                raw, _ = self.get('https://' + host + '/robots.txt', robot=True)
                rp.parse(raw.decode('utf-8').splitlines())
            except HTTPError as e:
                if e.code != 404:
                    raise
                rp.parse(['User-agent: *', 'Allow: /'])
            self.robots[host] = rp
        rp = self.robots.get(host)
        if not robot and not rp.can_fetch(UA, url):
            raise ValueError('robots.txt disallows this URL')
        delay = max(1, rp.crawl_delay(UA) or 0) if rp else 1
        time.sleep(max(0, self.last.get(host, 0) + delay - time.monotonic()))
        self.last[host] = time.monotonic()
        with self.opener.open(Request(url, headers={'User-Agent': UA}), timeout=45) as response:
            if int(response.headers.get('Content-Length', '0')) > limit:
                raise ValueError('Response exceeds size limit')
            data = response.read(limit + 1)
            if len(data) > limit:
                raise ValueError('Response exceeds size limit')
            info = dict(url=url, finalUrl=response.url, fetchedAt=now(), status=response.status,
                        contentType=response.headers.get('Content-Type', ''), bytes=len(data), sha256=sha(data))
        body.parent.mkdir(parents=True, exist_ok=True)
        body.write_bytes(data)
        save(meta, info)
        return data, info


def public_objects(html):
    """Decode JSON literals in Next flight records without evaluating JS."""
    decoder = json.JSONDecoder()
    flight = []
    for match in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>', html, re.S):
        frame = json.loads(match[1])
        if len(frame) > 1 and isinstance(frame[1], str):
            flight.append(frame[1])
    text = ''.join(flight)
    for match in re.finditer(r'\{(?:"id":\d+|"topic_id":)', text):
        try:
            obj, _ = decoder.raw_decode(text, match.start())
        except ValueError:
            continue
        yield obj


def catalog_topic(html, topic_id, provenance):
    objects = list(public_objects(html))
    topic = next((o for o in objects if o.get('id') == topic_id and o.get('type') == 'topic'), None)
    identity = next((o for o in objects if str(o.get('topic_id')) == str(topic_id) and o.get('topic_name')), None)
    if not topic and not identity:
        raise ValueError('Missing expected public topic data')
    title = topic['metadata']['name'] if topic else identity['topic_name']
    media = topic.get('sequence_expanded', []) if topic else [o for o in objects if 'playlist_id' in o]
    if not media:
        raise ValueError('Missing public recordings in topic data')
    rows = []
    for item in media:
        if item.get('visibility') != 'public' or item.get('playlist_id') != topic_id:
            continue
        metadata = item.get('metadata') or {}
        audio = ((item.get('audio') or {}).get('main') or {}).get('url')
        video = ((item.get('video') or {}).get('main') or {}).get('url')
        rows.append(dict(id=str(item['id']), topicId=topic_id, topic=title,
                         title=metadata.get('name', ''), date=metadata.get('date'),
                         durationSeconds=metadata.get('duration'), speakerId=item.get('speaker_id'),
                         description=metadata.get('description', ''),
                         sourceURL=f"{ORIGIN}/topics/{topic_id}/media/{item['id']}",
                         audioURL=audio, videoURL=video, provenance=provenance,
                         transcriptStatus='NOT_COLLECTED', reviewStatus='UNREVIEWED',
                         rightsStatus='NOT_ATTESTED', approvalStatus='NOT_IMPORTED'))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--topics', type=int, nargs='+', default=TOPICS)
    parser.add_argument('--audio-samples', type=int, choices=range(0, 4), default=0)
    args = parser.parse_args()
    root = args.output
    root.mkdir(parents=True, exist_ok=True)
    archive = Archive(root)
    errors, rows = [], {}
    sitemap, sitemap_info = archive.get(ORIGIN + '/sitemap?complete=1')
    urls = sorted(set(sitemap.decode().splitlines()))
    (root / 'sitemap.txt').write_text('\n'.join(urls) + '\n')
    for topic_id in args.topics:
        try:
            data, provenance = archive.get(f'{ORIGIN}/topics/{topic_id}')
            found = catalog_topic(data.decode(), topic_id, provenance)
            rows.update({row['id']: row for row in found})
            print(f'Topic {topic_id}: {len(found)} public recording records', flush=True)
        except Exception as e:
            errors.append(dict(topicId=topic_id, error=str(e)))
            print(f'Topic {topic_id}: {e}', flush=True)
    records = list(rows.values())
    # Three spread-out recordings from each topic form a small review queue.
    queue = []
    for topic_id in args.topics:
        candidates = [r for r in records if r['topicId'] == topic_id and r['audioURL']]
        if candidates:
            queue.extend(candidates[i].copy() for i in sorted({0, len(candidates)//2, len(candidates)-1}))
    audio = []
    # One sample per topic first; never fetch full video or live streams.
    selected = []
    for row in queue:
        if row['topicId'] not in [r['topicId'] for r in selected]:
            selected.append(row)
    for row in selected[:args.audio_samples]:
        try:
            data, info = archive.get(row['audioURL'], limit=80_000_000)
            if not (info['contentType'].startswith('audio/') or data.startswith(b'ID3') or data[:2] in (b'\xff\xfb', b'\xff\xf3', b'\xff\xf2')):
                raise ValueError('Response is not recognized audio')
            audio.append(dict(id=row['id'], sourceURL=row['sourceURL'], **info,
                              localFile='raw/' + sha(row['audioURL'].encode()) + '.bin'))
            print(f"Audio {row['id']}: {len(data)} bytes", flush=True)
        except Exception as e:
            errors.append(dict(mediaId=row['id'], error=str(e)))
    save(root / 'records.json', records)
    save(root / 'transcription-queue.json', queue)
    save(root / 'audio-downloads.json', audio)
    with (root / 'catalog.csv').open('w', newline='') as f:
        fields = ['id', 'topicId', 'topic', 'title', 'date', 'durationSeconds', 'sourceURL', 'audioURL', 'transcriptStatus']
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(records)
    report = dict(generatedAt=now(), sitemapProvenance=sitemap_info,
                  sitemapTopicURLs=sum(bool(re.fullmatch(ORIGIN + r'/topics/\d+', u)) for u in urls),
                  sitemapMediaURLs=sum(bool(re.fullmatch(ORIGIN + r'/topics/\d+/media/\d+', u)) for u in urls),
                  topicsRequested=args.topics, topicsCollected=len({r['topicId'] for r in records}),
                  uniqueRecordingRecords=len(records), withAudioURLs=sum(bool(r['audioURL']) for r in records),
                  durationHours=round(sum(r['durationSeconds'] or 0 for r in records)/3600, 2),
                  transcriptionQueue=len(queue), audioFilesDownloaded=len(audio),
                  audioBytesDownloaded=sum(a['bytes'] for a in audio), transcriptsCollected=0,
                  publishedToApplication=False, errors=errors,
                  overlapStatus='Deduplicated media IDs; overlap with existing Urdu texts needs transcript comparison.')
    save(root / 'report.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
