# Public source extraction

The manually invoked SJN extractor archives the public, published catalog at
[syedjawadnaqvi.com](https://www.syedjawadnaqvi.com/). It extracts website text,
downloads explicitly linked PDFs, and catalogs recording links. It does not download
or transcribe audio/video, log in, or request unpublished chapters.

## Run locally

Requires Python 3.9 or newer. No Python packages are needed. Linked PDF text
extraction also uses Node and the app's installed `unpdf` dependency (`pnpm install`).

```sh
python3 scripts/sources/extract_sjn.py
```

The publisher's footer renders only in the browser. To also capture its recording
channel links, run this before extraction (uses the project's Playwright dependency
and installed Google Chrome):

```sh
node scripts/sources/capture_site_links.mjs
python3 scripts/sources/extract_sjn.py
```

Pass an alternative archive directory as the Node command's first argument when
using Python's `--output`. The timestamped result is `browser-links.json`, and the
coverage report records whether this browser capture was included.

Output: `.local/sources/syedjawadnaqvi/archive/`, already excluded from Git.
The default is two in-flight requests with at least 0.5 seconds between starts.
The extractor checks robots.txt, retries temporary HTTP/network failures, and uses
timestamped, SHA-256-verified cached responses to resume interrupted work.
Use `--refresh` to re-fetch for a fresh snapshot, preferably with a different
`--output .local/sources/syedjawadnaqvi/YYYY-MM-DD` to retain the earlier archive.
An ordinary rerun retains original fetch timestamps. HTTP-200 application errors
are retried, and replaced responses are retained in `cache/history/`. Twelve
consecutive reader failures pause further requests and mark remaining chapters
`DEFERRED`; rerun to resume after the publisher's service recovers.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/sources -p 'test_*.py'
```

## Archive contents

Open `index.html` for a searchable local catalog with type/status filters and
links to extracted text. It works directly from disk without a server.

`lectures.csv` separately catalogs lesson/sermon transcript pages, their dates,
and any direct recording URLs. A transcript page is never mislabeled as an audio
or video recording; absent media links are marked `NO_RECORDING_LINK_EXPOSED`.
Channel links in `recordings.csv` are labeled `recording_channel`.

| File or directory              | Purpose                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `README.md`, `report.json`     | Coverage, counts, failures, unresolved chapters, duplicate groups                             |
| `catalog.csv`                  | Human-readable chapter inventory with source URLs and extraction outcomes                     |
| `collections.json`             | Book, magazine, lesson, and series hierarchy with original metadata                           |
| `records.jsonl`, `records/`    | Per-document provenance, hashes, timestamps, and review status                                |
| `text/`                        | UTF-8 text, preserving Urdu/Arabic characters and paragraph order                             |
| `html/`                        | Original article markup; archive only, never serve as trusted application HTML                |
| `cache/`, `pages/`             | Raw HTTP evidence and public catalog page data                                                |
| `links.json`, `recordings.csv` | Discovered links and recording references; media is not fetched                               |
| `pdfs.json`, `pdfs/`           | Linked PDF originals, download outcomes, and page-numbered extracted text, if any are exposed |

The website may return HTTP 200 with an error instead of an article. Such pages
are marked `UNAVAILABLE`, never converted into educational passages. The extractor
also checks article identity and publication status. Missing author fields remain
missing; the collection author is retained separately. Identical text keeps each
original source identity rather than discarding citation provenance.

The archive covers the default Urdu published catalogs and their reader pages, not every file
that might exist on the publisher's infrastructure. External links are cataloged;
only the site and its observed S3 asset hosts are allowed for PDF downloads.
Unrecognized hosts, oversize downloads, unavailable pages, or PDF parsing/OCR needs
must be handled explicitly, rather than silently claiming completeness. The
extractor never executes downloaded JavaScript or article markup.
PDFs with sparse or replacement-character text are flagged for OCR/layout review;
the extractor does not invent text for scanned pages.
English navigation views are checked separately in `localeChecks`. The publisher
currently returns errors for those views; any future available English corpus
is flagged for a locale adapter rather than silently counted as extracted.

## Review before application ingestion

Extraction does not approve sources or attest to copyright ownership. Records
start as `UNREVIEWED` with `rightsStatus: NOT_ATTESTED`. Review attribution,
usage rights, edition/date, paragraph fidelity, and educational applicability.
Preserve source URLs and publication metadata in each approved import.

The existing Source Studio workflow remains the publication gate. This command
does not write to MongoDB, D1, R2, or the live application's retrieval index.
The hosted index now uses D1 full-text search with bounded semantic reranking;
the former 500-passage corpus limit has been removed. The separate operator-authorized
[review and indexing workflow](SOURCE_INDEXING.md) publishes eligible texts without
silently truncating the archive. Website extracts do not gain authoritative
Fiqh status merely by appearing on this website.
