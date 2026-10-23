#!/usr/bin/env python3
"""Archive published SJN text and linked PDFs; catalog, never fetch, recordings.

Python 3.9+, standard library only. Outputs are deliberately local, not approved
retrieval sources. Run from the repository root. See docs/SOURCE_EXTRACTION.md.
"""
import argparse
import concurrent.futures
import csv
import hashlib
import gzip
import io
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit, urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.robotparser import RobotFileParser
from build_review_index import build_index

ORIGIN = "https://www.syedjawadnaqvi.com"
SITE_HOSTS = {"www.syedjawadnaqvi.com", "syedjawadnaqvi.com"}
PDF_HOSTS = SITE_HOSTS | {
    "sjn-images.s3.ap-south-1.amazonaws.com",
    "sjn-images-new.s3.ap-south-1.amazonaws.com",
    "sjn-imgs.s3.ap-south-1.amazonaws.com",
}
USER_AGENT = "SJN-AI-SourceArchive/1.0 (public text research; no media downloads)"
MAP = dict(zip("اآبپتٹثجح دڈذ رڑزسصضطظعف قکگلمنںہھءیے".replace(" ", ""),
               "a a b p t t s j h d d z r r z s s z t z a f q k g l m n n h h a i e".split()))
MAP.update({"چ": "ch", "خ": "kh", "ژ": "zh", "ش": "sh", "غ": "gh", "و": "ow", "ِ": "e", "ُ": "u", "َ": "a", "ٔ": "a"})


def slug(title):
    # Match the public site's transliteration, including initial alef and marks.
    words = []
    for word in title.split(" "):
        words.append("".join("i" if c == "ا" and i == 0 else MAP.get(c, c if re.match(r"[a-zA-Z0-9]", c) else "") for i, c in enumerate(word)))
    return re.sub(r"-+", "-", "-".join(words)).rstrip("-").lower()


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def public_url(value, base=ORIGIN):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        u = urljoin(base, html.unescape(value.strip()))
        p = urlsplit(u)
        valid = p.scheme == "https" and not p.username and not p.password and p.port in (None, 443)
    except ValueError:
        return None
    if not valid:
        return None
    return u.split("#")[0]


def safe_id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value) is not None


class DocumentHTML(HTMLParser):
    """Preserve paragraph order and Unicode; discard executable/style chrome."""
    BLOCK = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "section", "article", "blockquote", "br", "hr"}
    HIDDEN = {"head", "script", "style", "noscript", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.hidden = [], [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ("href", "src", "data", "data-src"):
            if attrs.get(key):
                self.links.append(attrs[key])
        if tag in self.HIDDEN:
            self.hidden.append(tag)
        if not self.hidden and tag in self.BLOCK:
            self.parts.append("\n\n")
        if not self.hidden and tag in {"td", "th"}:
            self.parts.append("\t")

    def handle_endtag(self, tag):
        if tag in self.hidden:
            self.hidden = self.hidden[:self.hidden.index(tag)]
        if not self.hidden and tag in self.BLOCK:
            self.parts.append("\n\n")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

    @property
    def text(self):
        return re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", re.sub(r"[^\S\n]+", " ", "".join(self.parts))).strip()


def parse_html(value):
    parser = DocumentHTML()
    parser.feed(value)
    return parser


def page_props(body):
    if body.lstrip().startswith(("{", "[")):
        return json.loads(body)
    match = re.search(r'<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>(.*?)</script>', body, re.S)
    if not match:
        raise ValueError("Missing public Next.js page data")
    return json.loads(match[1])["props"]["pageProps"]


def article_from(props, expected_id):
    article = props.get("article")
    if not article:
        raise ValueError(props.get("error") or props.get("serverError") or "Missing article (HTTP 200 is not extraction success)")
    if article.get("_id") != expected_id or article.get("isPublished") is not True:
        raise ValueError("Article identity/publication mismatch")
    return article


def walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            if key != "_nextI18Next":
                yield from walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_strings(item)


def linked_assets(value, base):
    urls = set()
    for s in walk_strings(value):
        if s.startswith(("https://", "http://", "//")):
            urls.add(s)
        if "<" in s:
            urls.update(parse_html(s).links)
    return {u for s in urls if (u := public_url(s, base))}


def asset_type(url):
    p = urlsplit(url)
    if re.search(r"\.pdf$", p.path, re.I):
        return "pdf"
    if p.hostname in {"youtube.com", "www.youtube.com"} and (p.path.startswith(("/@", "/channel/", "/c/", "/user/")) or p.path == "/"):
        return "recording_channel"
    if re.search(r"\.(mp3|mp4|m4a|wav|ogg|webm|m3u8)$", p.path, re.I) or p.hostname in {
        "youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com", "vimeo.com", "player.vimeo.com", "soundcloud.com", "w.soundcloud.com",
    }:
        return "recording"
    return "link"


class SafeRedirect(HTTPRedirectHandler):
    def __init__(self, allowed):
        self.allowed = allowed

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = public_url(newurl, req.full_url)
        if not u or urlsplit(u).hostname not in self.allowed:
            raise ValueError("Redirect outside permitted public hosts")
        return super().redirect_request(req, fp, code, msg, headers, u)


class Fetcher:
    def __init__(self, root, delay, refresh=False):
        self.root, self.delay, self.refresh = root, delay, refresh
        self.lock, self.next_request, self.robots = threading.Lock(), 0.0, None
        (root / "cache").mkdir(parents=True, exist_ok=True)

    def get(self, url, pdf=False, timeout=20, attempts=3):
        allowed = PDF_HOSTS if pdf else SITE_HOSTS
        if not public_url(url) or urlsplit(url).hostname not in allowed:
            raise ValueError("URL outside permitted public hosts")
        if self.robots and urlsplit(url).hostname in SITE_HOSTS and not self.robots.can_fetch(USER_AGENT, url):
            raise ValueError("Disallowed by robots.txt")
        key = digest(url)
        meta_path, body_path = self.root / "cache" / f"{key}.json", self.root / "cache" / f"{key}.body"
        if meta_path.exists() and body_path.exists() and not self.refresh:
            try:
                meta, body = json.loads(meta_path.read_text()), body_path.read_bytes()
                if digest(body) == meta["sha256"]:
                    # The publisher sometimes serves temporary application errors as 200.
                    application_error = False
                    if not pdf and meta["status"] == 200 and b'__NEXT_DATA__' in body:
                        cached_props = page_props(body.decode("utf-8"))
                        application_error = bool(cached_props.get("error") or cached_props.get("serverError"))
                    if meta["status"] < 500 and not application_error:
                        return meta, body
            except (ValueError, KeyError, UnicodeError):
                pass  # An interrupted/corrupt cache entry must be fetched again.
        for attempt in range(attempts):
            with self.lock:
                wait = max(0, self.next_request - time.monotonic())
                time.sleep(wait)
                self.next_request = time.monotonic() + self.delay
            try:
                opener = build_opener(SafeRedirect(allowed))
                try:
                    response = opener.open(Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"}), timeout=timeout)
                except HTTPError as e:
                    response = e
                with response:
                    if response.status == 429 or response.status >= 500:
                        retry = response.headers.get("Retry-After", "")
                        time.sleep(min(60, int(retry)) if retry.isdigit() else 2 ** (attempt + 1))
                        if attempt < attempts - 1:
                            continue
                    limit = 64 * 1024 * 1024 if pdf else 12 * 1024 * 1024
                    body = response.read(limit + 1)
                    if len(body) > limit:
                        raise ValueError("Response exceeds archive size limit")
                    wire_bytes = len(body)
                    encoding = response.headers.get("Content-Encoding", "identity").lower()
                    if encoding == "gzip":
                        with gzip.GzipFile(fileobj=io.BytesIO(body)) as compressed:
                            body = compressed.read(limit + 1)
                        if len(body) > limit:
                            raise ValueError("Decompressed response exceeds archive size limit")
                    elif encoding not in ("", "identity"):
                        raise ValueError(f"Unsupported response encoding: {encoding}")
                    meta = {"url": url, "finalUrl": response.url, "status": response.status,
                            "contentType": response.headers.get("Content-Type", ""), "fetchedAt": now(),
                            "sha256": digest(body), "bytes": len(body), "wireBytes": wire_bytes, "contentEncoding": encoding}
                if body_path.exists() and body_path.read_bytes() != body:
                    history = self.root / "cache" / "history"
                    history.mkdir(exist_ok=True)
                    previous = body_path.read_bytes()
                    (history / f"{key}-{digest(previous)}.body").write_bytes(previous)
                    if meta_path.exists():
                        (history / f"{key}-{digest(previous)}.json").write_bytes(meta_path.read_bytes())
                body_path.write_bytes(body)
                write_json(meta_path, meta)
                return meta, body
            except (OSError, TimeoutError):
                if attempt == attempts - 1:
                    raise
                time.sleep(2 ** (attempt + 1))

    def page(self, url, **options):
        meta, body = self.get(url, **options)
        if meta["status"] != 200:
            raise ValueError(f"HTTP {meta['status']}")
        return page_props(body.decode("utf-8")), meta


def chapter_url(kind, collection, chapter):
    ident, title = chapter["_id"], slug(chapter["title"])
    if kind == "book":
        return f"{ORIGIN}/kutub/{ident}/{title}"
    if kind == "magazine":
        return f"{ORIGIN}/magazines/magazine-details/article?{urlencode({'id': ident, 'title': title})}"
    return f"{ORIGIN}/{'duroos' if kind == 'duroos' else 'series'}/{slug(collection['title'])}/{ident}"


def extract(root, delay=0.5, refresh=False):
    root.mkdir(parents=True, exist_ok=True)
    for name in ("text", "html", "records", "pdfs", "pages"):
        (root / name).mkdir(exist_ok=True)
    fetch = Fetcher(root, delay, refresh)
    robots_meta, robots_body = fetch.get(ORIGIN + "/robots.txt")
    if robots_meta["status"] == 200:
        if "html" in robots_meta["contentType"]:
            raise ValueError("robots.txt returned HTML; inspect before crawling")
        fetch.robots = RobotFileParser()
        fetch.robots.parse(robots_body.decode().splitlines())
        fetch.delay = max(delay, fetch.robots.crawl_delay(USER_AGENT) or 0)
    elif robots_meta["status"] not in (404, 410):
        raise ValueError(f"Cannot establish crawling rules: HTTP {robots_meta['status']}")
    sitemap_meta, _ = fetch.get(ORIGIN + "/sitemap.xml")
    collections, tasks, failures, assets = [], {}, [], []
    locale_checks = []
    page_records = []

    def capture_page(path, **options):
        url = public_url(path)
        props, meta = fetch.page(url, **options)
        write_json(root / "pages" / f"{digest(url)}.json", {"url": url, "fetchedAt": meta["fetchedAt"], "data": {k: v for k, v in props.items() if k != "_nextI18Next"}})
        page_records.append({"url": url, "fetchedAt": meta["fetchedAt"], "sha256": meta["sha256"]})
        assets.extend({"url": u, "sourceUrl": url, "recordId": None, "kind": asset_type(u)} for u in linked_assets(props, url))
        _, html_body = fetch.get(url)
        # Footer/player links may be rendered outside Next's pageProps.
        for value in parse_html(html_body.decode("utf-8")).links:
            u = public_url(value, url)
            if u and asset_type(u) in {"pdf", "recording", "recording_channel"}:
                assets.append({"url": u, "sourceUrl": url, "recordId": None, "kind": asset_type(u)})
        return props

    home = capture_page("/")
    books = capture_page("/kutub")["bookList"]
    magazines = capture_page("/magazines")["magazineList"]
    duroos = capture_page("/duroos")["duroos"]
    categories = capture_page("/categories").get("categories", [])
    series = [c for group in home.get("allContent", []) if group.get("contentType") == "series" and group.get("isPublished") is True for c in group.get("listofchapters", [])]
    excluded = sum(c.get("isPublished") is not True for c in books + magazines + duroos + series)
    for kind, entries in (("book", books), ("magazine", magazines), ("duroos", duroos), ("series", series)):
        for collection in entries:
            if collection.get("isPublished") is not True:
                continue
            if not safe_id(collection.get("_id")):
                failures.append({"stage": "collection", "error": "Invalid collection identifier"})
                continue
            chapters = collection.get("chapters", [])
            if kind == "book":
                collection_url = ORIGIN + "/kutub"
            elif kind == "magazine":
                collection_url = ORIGIN + "/magazines/magazine-details?" + urlencode({"id": collection["_id"], "title": slug(collection["title"])})
            else:
                section = "duroos" if kind == "duroos" else "series"
                collection_url = f"{ORIGIN}/{section}/{slug(collection['title'])}?id={collection['_id']}"
            if kind in ("duroos", "series"):
                try:
                    listing, _ = fetch.page(ORIGIN + "/api/serverData?" + urlencode({"type": "series", "id": collection["_id"]}))
                    chapters = listing.get("chapters", [])
                    if not chapters and collection.get("chapterIds"):
                        raise ValueError(listing.get("message", "Empty chapter listing"))
                except Exception as e:
                    failures.append({"url": collection_url, "stage": "collection", "error": str(e)})
            missing = sorted(set(collection.get("chapterIds", [])) - {c["_id"] for c in chapters})
            collections.append({"kind": kind, "url": collection_url, "metadata": {k: v for k, v in collection.items() if k != "chapters"}, "resolvedChapters": len(chapters), "missingChapterIds": missing})
            for chapter in chapters:
                if chapter.get("isPublished") is not True:
                    excluded += 1
                    continue
                if not safe_id(chapter.get("_id")):
                    failures.append({"url": collection_url, "stage": "chapter", "error": "Invalid chapter identifier"})
                    continue
                tasks.setdefault(chapter["_id"], {"id": chapter["_id"], "kind": kind,
                    "url": chapter_url(kind, collection, chapter), "title": chapter["title"],
                    "collectionId": collection["_id"], "collectionTitle": collection["title"],
                    "collectionAuthor": collection.get("authorID"), "metadata": chapter})
    for path in ["/live"] + [f"/categories/{c['_id']}" for c in categories if c.get("isPublished") is True]:
        try:
            props = capture_page(path, timeout=12, attempts=1)
            # Category views are a cross-check, not a replacement for full catalogs.
            for chapter in props.get("categoriesContent", []):
                if chapter.get("isPublished") is True and chapter["_id"] not in tasks:
                    failures.append({"url": public_url(path), "stage": "discovery", "id": chapter["_id"], "error": "Published category item not resolved by primary catalogs"})
        except Exception as e:
            failures.append({"url": public_url(path), "stage": "page", "error": str(e)})
    for path in ("/en", "/en/kutub", "/en/magazines", "/en/duroos", "/en/categories"):
        try:
            props = capture_page(path, timeout=12, attempts=1)
            error = props.get("error")
            if isinstance(props.get("categories"), dict):
                error = props["categories"].get("message")
            if error:
                raise ValueError(error)
            # English routes currently error on the publisher. Surface any future
            # locale-specific collections explicitly instead of claiming coverage.
            locale_checks.append({"url": public_url(path), "status": "AVAILABLE_REQUIRES_LOCALE_REVIEW"})
        except Exception as e:
            locale_checks.append({"url": public_url(path), "status": "UNAVAILABLE", "error": str(e)})
    write_json(root / "collections.json", collections)
    print(f"Discovered {len(collections)} published collections, {len(tasks)} chapters; {excluded} unpublished entries excluded.", flush=True)
    failure_lock, stop_fetching = threading.Lock(), threading.Event()
    consecutive_failures = 0

    def process(task):
        nonlocal consecutive_failures
        record = {**task, "reviewStatus": "UNREVIEWED", "rightsStatus": "NOT_ATTESTED", "sourceSite": ORIGIN}
        if stop_fetching.is_set():
            record.update({"status": "DEFERRED", "error": "Paused after 12 consecutive reader failures; rerun to resume", "characters": 0,
                           "links": sorted(linked_assets(task["metadata"], task["url"]))})
            write_json(root / "records" / f"{task['id']}.json", record)
            return record
        try:
            props, meta = fetch.page(task["url"])
            article = article_from(props, task["id"])
            raw = article.get("contentData") or ""
            if not isinstance(raw, str):
                raise ValueError("Unexpected non-text contentData")
            parsed = parse_html(raw)
            text = parsed.text
            links = linked_assets(article, task["url"])
            _, reader_body = fetch.get(task["url"])
            for value in parse_html(reader_body.decode("utf-8")).links:
                u = public_url(value, task["url"])
                if u and asset_type(u) in {"pdf", "recording", "recording_channel"}:
                    links.add(u)
            record.update({"metadata": {k: v for k, v in article.items() if k != "contentData"},
                           "status": "TEXT_EXTRACTED" if text else "NO_TEXT", "fetchedAt": meta["fetchedAt"],
                           "responseSha256": meta["sha256"], "textSha256": digest(text), "characters": len(text),
                           "textPath": f"text/{task['id']}.txt" if text else None,
                           "htmlPath": f"html/{task['id']}.html" if raw else None,
                           "links": sorted(links)})
            record["qualityFlags"] = [label for label, condition in (
                ("REPLACEMENT_CHARACTERS", "\ufffd" in text), ("NUL_CHARACTERS", "\0" in text),
                ("SPARSE_TEXT", bool(text) and len(text) < 20)) if condition]
            if raw:
                (root / record["htmlPath"]).write_text(raw, encoding="utf-8")
            if text:
                (root / record["textPath"]).write_text(text + "\n", encoding="utf-8")
            with failure_lock:
                consecutive_failures = 0
        except Exception as e:
            record.update({"status": "UNAVAILABLE", "error": str(e), "checkedAt": now(), "characters": 0,
                           "links": sorted(linked_assets(task["metadata"], task["url"]))})
            with failure_lock:
                consecutive_failures += 1
                if consecutive_failures >= 12:
                    stop_fetching.set()
        write_json(root / "records" / f"{task['id']}.json", record)
        return record

    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for index, record in enumerate(pool.map(process, tasks.values()), 1):
            records.append(record)
            if record["status"] == "UNAVAILABLE":
                failures.append({"url": record["url"], "stage": "article", "id": record["id"], "error": record["error"]})
            assets.extend({"url": u, "sourceUrl": record["url"], "recordId": record["id"], "kind": asset_type(u)} for u in record["links"])
            if index % 50 == 0 or index == len(tasks):
                print(f"Processed {index}/{len(tasks)}; text={sum(r['status'] == 'TEXT_EXTRACTED' for r in records)}; unavailable={sum(r['status'] == 'UNAVAILABLE' for r in records)}", flush=True)

    browser_links_path = root / "browser-links.json"
    browser_links_checked = False
    if browser_links_path.exists():
        browser_data = json.loads(browser_links_path.read_text(encoding="utf-8"))
        source_url = public_url(browser_data.get("sourceUrl"))
        if source_url and urlsplit(source_url).hostname in SITE_HOSTS:
            browser_links_checked = True
            for link in browser_data.get("links", []):
                u = public_url(link.get("url"), source_url)
                if u:
                    assets.append({"url": u, "sourceUrl": source_url, "recordId": None, "kind": asset_type(u)})
    assets = list({(a["url"], a["sourceUrl"]): a for a in assets}.values())
    pdfs = []
    for url in sorted({a["url"] for a in assets if a["kind"] == "pdf"}):
        item = {"url": url, "referencedBy": [a["sourceUrl"] for a in assets if a["url"] == url], "status": "PENDING"}
        try:
            meta, body = fetch.get(url, pdf=True)
            if meta["status"] != 200 or not body.startswith(b"%PDF-"):
                raise ValueError(f"Not a downloadable PDF (HTTP {meta['status']})")
            path = f"pdfs/{digest(body)}.pdf"
            (root / path).write_bytes(body)
            item.update({"status": "DOWNLOADED", "path": path, "sha256": digest(body), "bytes": len(body), "fetchedAt": meta["fetchedAt"], "textStatus": "PENDING_EXTRACTION"})
            try:
                helper = Path(__file__).with_name("extract_pdf.mjs")
                subprocess.run(["node", str(helper), str(root / path)], check=True, timeout=120, capture_output=True, text=True)
                pages_path = path.removesuffix(".pdf") + ".pages.json"
                extracted = json.loads((root / pages_path).read_text())
                item.update({"textStatus": extracted["status"], "pagesPath": pages_path,
                             "pages": extracted["totalPages"], "pagesNeedingReview": extracted["pagesNeedingReview"]})
            except (OSError, subprocess.SubprocessError, ValueError) as e:
                item.update({"textStatus": "EXTRACTION_FAILED", "textError": str(e)})
                failures.append({"url": url, "stage": "pdf-text", "error": str(e)})
        except Exception as e:
            item.update({"status": "UNAVAILABLE", "error": str(e)})
            failures.append({"url": url, "stage": "pdf", "error": str(e)})
        pdfs.append(item)

    groups = {}
    for r in records:
        if r["status"] == "TEXT_EXTRACTED":
            groups.setdefault(r["textSha256"], []).append(r["id"])
    report = {"generatedAt": now(), "source": ORIGIN, "robotsHttpStatus": robots_meta["status"], "sitemapHttpStatus": sitemap_meta["status"],
              "scope": "Public published catalogs and reader pages; website text and linked PDFs; recording URLs only. No authentication or media transcription.",
              "collections": len(collections), "chapters": len(records), "unpublishedEntriesExcluded": excluded,
              "textDocuments": sum(r["status"] == "TEXT_EXTRACTED" for r in records), "textCharacters": sum(r["characters"] for r in records),
              "unavailableDocuments": sum(r["status"] == "UNAVAILABLE" for r in records), "documentsWithoutText": sum(r["status"] == "NO_TEXT" for r in records),
              "deferredDocuments": sum(r["status"] == "DEFERRED" for r in records),
              "unresolvedChapterIds": sum(len(c["missingChapterIds"]) for c in collections),
              "recordingUrls": len({a["url"] for a in assets if a["kind"] == "recording"}), "pdfLinks": len(pdfs), "pdfsDownloaded": sum(p["status"] == "DOWNLOADED" for p in pdfs),
              "recordingChannelUrls": len({a["url"] for a in assets if a["kind"] == "recording_channel"}),
              "exactDuplicateTextGroups": [ids for ids in groups.values() if len(ids) > 1],
              "uniqueTextDocuments": len(groups),
              "byKind": {kind: {"chapters": sum(r["kind"] == kind for r in records),
                                 "textDocuments": sum(r["kind"] == kind and r["status"] == "TEXT_EXTRACTED" for r in records),
                                 "characters": sum(r["characters"] for r in records if r["kind"] == kind)}
                         for kind in ("book", "magazine", "duroos", "series")},
              "documentsNeedingTextQualityReview": [r["id"] for r in records if r.get("qualityFlags")],
              "reviewStatus": "UNREVIEWED", "publishedToApplication": False, "clientRenderedLinksChecked": browser_links_checked,
              "localeChecks": locale_checks, "failures": failures}
    write_json(root / "report.json", report)
    write_json(root / "pdfs.json", pdfs)
    write_json(root / "pages.json", page_records)
    write_json(root / "links.json", assets)
    (root / "records.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
    with (root / "catalog.csv").open("w", encoding="utf-8-sig", newline="") as f:
        fields = ["id", "kind", "collectionTitle", "title", "status", "characters", "url", "textPath", "reviewStatus"]
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        # Avoid spreadsheet formula interpretation of third-party strings.
        for record in records:
            writer.writerow({k: ("'" + v if isinstance(v, str) and v[:1] in "=+-@" and v else v) for k, v in record.items()})
    with (root / "recordings.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["url", "sourceUrl", "recordId", "kind"])
        writer.writeheader()
        writer.writerows(a for a in assets if a["kind"] in {"recording", "recording_channel"})
    with (root / "lectures.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "collection", "title", "releaseDate", "transcriptUrl", "recordingUrls", "recordingStatus"])
        writer.writeheader()
        for r in records:
            if r["kind"] not in {"duroos", "series"}:
                continue
            media = [u for u in r["links"] if asset_type(u) == "recording"]
            row = {"id": r["id"], "collection": r["collectionTitle"], "title": r["title"],
                   "releaseDate": r["metadata"].get("releaseDate"), "transcriptUrl": r["url"],
                   "recordingUrls": " | ".join(media), "recordingStatus": "LINK_CATALOGED" if media else "NO_RECORDING_LINK_EXPOSED"}
            writer.writerow({k: ("'" + v if isinstance(v, str) and v[:1] in "=+-@" and v else v) for k, v in row.items()})
    (root / "README.md").write_text(f"# SJN source archive\n\nGenerated {report['generatedAt']} from {ORIGIN}.\n\n"
        f"- Published collections: {report['collections']}\n- Cataloged chapters: {report['chapters']}\n"
        f"- Extracted text documents: {report['textDocuments']} ({report['textCharacters']:,} characters)\n"
        f"- Unavailable reader pages: {report['unavailableDocuments']}\n- Pages without text: {report['documentsWithoutText']}\n"
        f"- Deferred after repeated reader failures: {report['deferredDocuments']}\n"
        f"- Unique recording URLs: {report['recordingUrls']} (not downloaded)\n- Linked PDFs: {report['pdfLinks']}; downloaded: {report['pdfsDownloaded']}\n\n"
        f"- Recording channel URLs: {report['recordingChannelUrls']}\n\n"
        "Start with catalog.csv and report.json. records.jsonl contains provenance, original metadata, and paths to UTF-8 text. "
        "html/ preserves original article markup as inert archive files; do not serve it in the app. cache/ preserves timestamped HTTP evidence. "
        "recordings.csv catalogs links; pdfs.json records PDF outcomes. Exact text duplicates retain separate source identities.\n\n"
        "This corpus is UNREVIEWED and has not been published to the application. Confirm attribution, usage rights, extraction quality, "
        "and educational applicability before approval. A missing chapter author is not filled with an assumed author. "
        "HTTP-200 error pages are listed as unavailable, never used as religious evidence.\n", encoding="utf-8")
    build_index(root)
    print(json.dumps({k: v for k, v in report.items() if k not in ("failures", "exactDuplicateTextGroups")}, ensure_ascii=False, indent=2), flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".local/sources/syedjawadnaqvi/archive"))
    parser.add_argument("--delay", type=float, default=0.5, help="Minimum seconds between requests (at least 0.25)")
    parser.add_argument("--refresh", action="store_true", help="Re-fetch cached responses for a fresh snapshot")
    args = parser.parse_args()
    extract(args.output, max(0.25, args.delay), args.refresh)
