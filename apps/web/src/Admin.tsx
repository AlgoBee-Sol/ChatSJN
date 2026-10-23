import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  FileText,
  Plus,
  Search,
  Upload,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { Source, Chunk } from '@sjn/shared';
import { api, json } from './api';
import { Notice } from './App';
import { Dialog } from './components/ui/dialog';
import { Button } from './components/ui/button';
export function Admin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [upload, setUpload] = useState(false),
    [selected, setSelected] = useState(''),
    [category, setCategory] = useState('FIQH'),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const sources = useQuery({
    queryKey: ['sources', search, page],
    queryFn: () =>
      api<{ items: Source[]; total: number }>(
        `/admin/sources?q=${encodeURIComponent(search)}&page=${page}`,
      ),
  });
  const detail = useQuery({
    queryKey: ['source', selected],
    queryFn: () =>
      api<{ source: Source; chunks: Chunk[]; jobs: { status: string; error?: string }[] }>(
        `/admin/sources/${selected}`,
      ),
    enabled: !!selected,
  });
  async function action(action: string) {
    setError('');
    setBusy(true);
    try {
      await api(`/admin/sources/${selected}/action`, { method: 'POST', body: json({ action }) });
      await qc.invalidateQueries({ queryKey: ['sources'] });
      await qc.invalidateQueries({ queryKey: ['source', selected] });
      setReviewed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a source document.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Maximum file size is 8 MB.');
      return;
    }
    setBusy(true);
    const form = new FormData(e.currentTarget),
      data = new FormData();
    data.set('file', file);
    data.set(
      'metadata',
      json({
        title: form.get('title'),
        scholar: form.get('scholar'),
        sourceCategory: category,
        religiousAuthorityId: category === 'EDUCATIONAL' ? 'JAWAD_NAQVI' : form.get('authority'),
        topics: [category === 'FIQH' ? 'FIQH' : form.get('topic')],
        language: form.get('language'),
        originalSourceURL: form.get('url'),
        publication: form.get('publication'),
        version: form.get('version'),
        section: form.get('section'),
        rulingNumber: form.get('rulingNumber'),
        rightsConfirmed: form.get('rights') === 'on',
      }),
    );
    try {
      const result = await api<{ source: Source }>('/admin/sources', {
        method: 'POST',
        body: data,
      });
      await qc.invalidateQueries({ queryKey: ['sources'] });
      setUpload(false);
      setFile(null);
      setSelected(result.source._id);
      setReviewed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-page admin-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CARE BEHIND EVERY ANSWER</span>
          <h1>Source studio.</h1>
          <p>A considered path from original text to approved knowledge.</p>
        </div>
        <Button
          onClick={() => {
            setUpload(true);
            setError('');
          }}
        >
          <Plus size={17} /> Import source
        </Button>
      </div>
      <div className="admin-banner">
        <ShieldCheck size={27} />
        <div>
          <strong>Review first. Publish with confidence.</strong>
          <p>
            Only approved, embedded passages can appear in answers. A published source is immutable;
            revisions require a new version.
          </p>
        </div>
      </div>
      <div className="source-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search sources"
            placeholder="Find a source by title…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <span>{sources.data?.total || 0} sources</span>
      </div>
      {sources.isError ? (
        <Notice>
          Sources could not be loaded. <button onClick={() => sources.refetch()}>Retry</button>
        </Notice>
      ) : sources.data?.items.length ? (
        <div className="source-list">
          {sources.data.items.map((source) => (
            <button
              className="source-row"
              key={source._id}
              onClick={() => {
                setSelected(source._id);
                setReviewed(false);
                setError('');
              }}
            >
              <span className="source-file-icon">
                <FileText size={23} />
              </span>
              <span>
                <strong>{source.title}</strong>
                <small>
                  {source.scholar} · {source.religiousAuthorityId.replaceAll('_', ' ')} · v
                  {source.version}
                </small>
              </span>
              <span className={`source-status ${source.approvalStatus.toLowerCase()}`}>
                {source.approvalStatus.replaceAll('_', ' ')}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen size={40} />
          <h2>Good knowledge starts with a source.</h2>
          <p>
            Your library is intentionally empty. Import authorized source material,
            <br />
            check the extracted passages, and approve it for retrieval.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setUpload(true);
              setError('');
            }}
          >
            Import your first source <Upload size={16} />
          </Button>
        </div>
      )}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={page * 25 >= (sources.data?.total || 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      <Dialog
        open={upload}
        onOpenChange={setUpload}
        title="Bring a source into the library"
        description="Import only material you are authorized to use. Review is required before publication."
      >
        {error && <Notice>{error}</Notice>}
        <form className="source-form" onSubmit={submit}>
          <label className="file-drop">
            <Upload size={25} />
            <strong>{file ? file.name : 'Choose a source document'}</strong>
            <small>Text-based PDF, TXT or Markdown · up to 8 MB</small>
            <input
              aria-label="Source file"
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
          </label>
          <label>
            Source title
            <input
              name="title"
              placeholder="Exact title of the original work"
              required
              minLength={3}
              maxLength={200}
            />
          </label>
          <div className="form-columns">
            <label>
              Knowledge collection
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="FIQH">Fiqh · Marja rulings</option>
                <option value="EDUCATIONAL">Islamic education</option>
              </select>
            </label>
            <label>
              Authority
              <select name="authority" key={category}>
                {category === 'FIQH' ? (
                  <>
                    <option value="SISTANI">Ayatollah al-Sistani</option>
                    <option value="ALI_KHAMENEI">Ayatollah Ali Khamenei</option>
                  </>
                ) : (
                  <option value="JAWAD_NAQVI">Syed Jawad Naqvi</option>
                )}
              </select>
            </label>
          </div>
          <label>
            Author / scholar
            <input
              name="scholar"
              required
              minLength={2}
              placeholder="As attributed in the original source"
            />
          </label>
          {category === 'EDUCATIONAL' && (
            <label>
              Topic
              <select name="topic">
                {['AQAID', 'QURAN', 'HADITH', 'HISTORY', 'AKHLAQ'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Original source URL
            <input name="url" type="url" placeholder="https://…" required />
          </label>
          <div className="form-columns">
            <label>
              Source language
              <select name="language">
                <option value="ur">Urdu</option>
                <option value="en">English</option>
                <option value="roman">Roman Urdu</option>
              </select>
            </label>
            <label>
              Version
              <input name="version" defaultValue="1" required maxLength={40} />
            </label>
          </div>
          <label>
            Publication / edition metadata
            <input
              name="publication"
              placeholder="Publisher, edition, publication date"
              maxLength={500}
            />
          </label>
          <div className="form-columns">
            <label>
              Section
              <input name="section" maxLength={200} placeholder="Optional" />
            </label>
            <label>
              Ruling number
              <input
                name="rulingNumber"
                maxLength={50}
                placeholder="Only for a single-ruling import"
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" name="rights" required />I have authorization to use this
            material and will review its accuracy before publication.
          </label>
          <Button disabled={busy} className="full-width">
            {busy ? 'Extracting and preparing…' : 'Import for review'}
            <ArrowIcon />
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected('');
        }}
        title={detail.data?.source.title || 'Source review'}
        description="Inspect the exact passages, provenance and extraction quality."
      >
        {error && <Notice>{error}</Notice>}
        {detail.data && (
          <div className="source-review">
            <div className="source-meta">
              <span className={`source-status ${detail.data.source.approvalStatus.toLowerCase()}`}>
                {detail.data.source.approvalStatus.replaceAll('_', ' ')}
              </span>
              <p>
                {detail.data.source.scholar} · {detail.data.source.religiousAuthorityId} · v
                {detail.data.source.version}
              </p>
              <p>
                {detail.data.source.publication || 'No additional publication metadata supplied.'}
              </p>
              <a href={detail.data.source.originalSourceURL} target="_blank" rel="noreferrer">
                Inspect original source <ExternalLink size={14} />
              </a>
            </div>
            {detail.data.source.error && <Notice>{detail.data.source.error}</Notice>}
            <span className="eyebrow">{detail.data.chunks.length} EXTRACTED PASSAGES</span>
            <div className="chunk-preview">
              {detail.data.chunks.map((chunk) => (
                <article key={chunk._id}>
                  <small>
                    Passage {chunk.chunkIndex + 1}
                    {chunk.pageNumber ? ` · Page ${chunk.pageNumber}` : ''}
                    {chunk.rulingNumber ? ` · Ruling ${chunk.rulingNumber}` : ''}
                  </small>
                  <p dir="auto">{chunk.originalText}</p>
                </article>
              ))}
            </div>
            {detail.data.source.approvalStatus === 'READY_FOR_REVIEW' && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I have checked the source, authority, passage accuracy, references and permission to
                publish.
              </label>
            )}
            <div className="review-actions">
              {detail.data.source.approvalStatus === 'READY_FOR_REVIEW' && (
                <Button disabled={busy || !reviewed} onClick={() => void action('approve')}>
                  <Check size={16} />
                  {busy ? 'Embedding…' : 'Approve & publish'}
                </Button>
              )}
              {detail.data.source.approvalStatus === 'APPROVED' && (
                <Button disabled={busy} variant="outline" onClick={() => void action('unpublish')}>
                  Unpublish source
                </Button>
              )}
              {!['APPROVED', 'PROCESSING', 'REJECTED'].includes(
                detail.data.source.approvalStatus,
              ) && (
                <Button disabled={busy} variant="outline" onClick={() => void action('reject')}>
                  Reject
                </Button>
              )}
              {!detail.data.source.everPublished &&
                detail.data.source.approvalStatus !== 'PROCESSING' && (
                  <Button disabled={busy} variant="ghost" onClick={() => void action('reprocess')}>
                    <RefreshCw size={15} /> Reprocess
                  </Button>
                )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
function ArrowIcon() {
  return <Upload size={16} />;
}
