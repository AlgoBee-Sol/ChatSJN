"""Build a searchable local catalog without rendering publisher HTML."""
import argparse
from html import escape
import json
from pathlib import Path


def build_index(root):
    report = json.loads((root / 'report.json').read_text(encoding='utf-8'))
    records = [json.loads(line) for line in (root / 'records.jsonl').read_text(encoding='utf-8').splitlines()]
    rows = []
    for r in records:
        title = escape(r['title'])
        if r.get('textPath') == f"text/{r['id']}.txt" and r['id'].isalnum():
            title = f'<a href="{escape(r["textPath"], quote=True)}">{title}</a>'
        rows.append(f'<tr data-kind="{escape(r["kind"], quote=True)}" data-status="{escape(r["status"], quote=True)}">'
                    f'<td dir="auto">{title}<small>{escape(r["id"])}</small></td>'
                    f'<td dir="auto">{escape(r["collectionTitle"])}</td><td>{escape(r["kind"])}</td>'
                    f'<td>{escape(r["status"].replace("_", " ").lower())}</td><td>{r["characters"]:,}</td>'
                    f'<td><a href="{escape(r["url"], quote=True)}" target="_blank" rel="noopener noreferrer">Original ↗</a></td></tr>')
    stats = [(report['collections'], 'Published collections'), (report['textDocuments'], 'Text documents'),
             (report['recordingUrls'], 'Recording URLs'),
             (report['unavailableDocuments'] + report.get('deferredDocuments', 0), 'Unavailable / deferred')]
    document = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>SJN · Source archive review</title><style>
:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#192d27;background:#f5f7f5}*{box-sizing:border-box}body{margin:0}main{max-width:1400px;margin:auto;padding:48px 28px}
header{max-width:850px}.eyebrow{font-weight:700;color:#477761;font-size:12px;letter-spacing:.16em}h1{font-size:clamp(28px,5vw,44px);letter-spacing:-.04em;margin:12px 0}p{line-height:1.65;color:#53645c}.meta{font-size:13px}
.stats{display:flex;flex-wrap:wrap;gap:16px;margin:30px 0}.stat{background:white;border:1px solid #dce4de;border-radius:12px;padding:20px;min-width:180px;flex:1}.stat strong{display:block;font-size:30px;letter-spacing:-.04em}.stat span{font-size:13px;color:#53645c}
.tools{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:24px 0}label{display:grid;gap:7px;font-size:13px;font-weight:600}.search{flex:1;min-width:240px}input,select{font:inherit;color:inherit;border:1px solid #bdccc2;border-radius:8px;padding:12px;background:white;min-height:44px}input:focus,select:focus,a:focus-visible{outline:3px solid #8db9a0;outline-offset:3px}a{color:#176444;text-underline-offset:4px}
.table{overflow:auto;background:white;border:1px solid #dce4de;border-radius:12px}table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;background:#eaf0ec;font-size:12px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}th,td{padding:17px 16px;border-bottom:1px solid #e9eeea;vertical-align:top}td:first-child{min-width:240px}td:nth-child(2){min-width:160px}td[dir="auto"]{font-size:22px;line-height:2}td small{display:block;font-size:11px;color:#7a8981;direction:ltr}
[data-status="UNAVAILABLE"] td,[data-status="DEFERRED"] td{background:#fff8ec}[hidden]{display:none!important}footer,#shown{font-size:13px;color:#53645c}footer{margin-top:22px}@media(max-width:600px){main{padding:26px 16px}.stat{min-width:130px;padding:16px}}
</style></head><body><main><header><div class="eyebrow">SJN AI / RESEARCH LIBRARY</div>
<h1>Your first source collection.</h1><p>Published material discovered on syedjawadnaqvi.com, with original URLs and preserved Urdu text. Open a chapter title to inspect its extracted text.</p>
<p class="meta">Snapshot: __DATE__ · <strong>Unreviewed · Not published to the application</strong></p></header>
<section class="stats" aria-label="Extraction totals">__STATS__</section>
<p><a href="report.json">Coverage &amp; failures</a> · <a href="catalog.csv">Catalog CSV</a> · <a href="lectures.csv">Lecture pages</a> · <a href="recordings.csv">Recording links</a> · <a href="pdfs.json">PDF manifest</a></p>
<div class="tools"><label class="search">Search chapters, collections or IDs<input id="search" type="search" placeholder="Search in Urdu or English…"></label>
<label>Collection type<select id="kind"><option value="">All types</option><option>book</option><option>magazine</option><option>duroos</option><option>series</option></select></label>
<label>Extraction status<select id="status"><option value="">All statuses</option><option value="TEXT_EXTRACTED">Text extracted</option><option value="NO_TEXT">No text</option><option value="UNAVAILABLE">Unavailable</option><option value="DEFERRED">Deferred</option></select></label></div>
<p id="shown" role="status"></p><div class="table"><table><thead><tr><th>Chapter</th><th>Collection</th><th>Type</th><th>Status</th><th>Characters</th><th>Source</th></tr></thead><tbody>__ROWS__</tbody></table></div>
<footer>Confirm attribution, usage rights and extraction fidelity before approval. Recording files are not downloaded. Original article HTML is retained only as archive evidence.</footer>
<script>
const rows=Array.from(document.querySelectorAll('tbody tr'));
const search=document.querySelector('#search'),kind=document.querySelector('#kind'),status=document.querySelector('#status');
const entries=rows.map(row=>({row,text:row.textContent.toLocaleLowerCase()}));
function filter(){const query=search.value.trim().toLocaleLowerCase();let count=0;for(const {row,text} of entries){row.hidden=!(text.includes(query)&&(!kind.value||row.dataset.kind===kind.value)&&(!status.value||row.dataset.status===status.value));if(!row.hidden)count++}document.querySelector('#shown').textContent=count.toLocaleString()+' of '+rows.length.toLocaleString()+' chapters shown'}
search.addEventListener('input',filter);kind.addEventListener('change',filter);status.addEventListener('change',filter);filter();
</script></main></body></html>'''
    document = document.replace('__DATE__', escape(report['generatedAt']))
    document = document.replace('__STATS__', ''.join(f'<div class="stat"><strong>{value:,}</strong><span>{label}</span></div>' for value, label in stats))
    document = document.replace('__ROWS__', ''.join(rows))
    (root / 'index.html').write_text(document, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    build_index(parser.parse_args().archive)
