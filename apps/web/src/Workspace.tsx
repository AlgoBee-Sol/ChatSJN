import { authClient, checkAuthError } from './auth-client';
import { GoogleAccess } from './GoogleAccess';
import { MARJAS, LANGUAGES } from '@sjn/shared/display';
import { FIQH_ENABLED } from '@sjn/shared/features';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
  useLocation,
  Navigate,
} from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  Copy,
  History,
  Languages,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Pencil,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
} from 'lucide-react';
import './workspace.css';
import ReactMarkdown from 'react-markdown';
import {
  type User,
  type Conversation,
  type Message,
  type Citation,
  type Marja,
  type Language,
} from '@sjn/shared';
import { api, json, streamAnswer } from './api';
import { useAuth, Logo, Notice } from './App';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { MarjaNotice } from './Auth';
import { Admin } from './Admin';
const ui = {
  en: {
    newChat: 'New conversation',
    greeting: 'Assalamu alaikum',
    heading: 'What’s on your mind today?',
    sub: 'Every question is a step toward understanding.',
    placeholder: 'Ask a question. Explore a thought.',
    send: 'Send question',
  },
  ur: {
    newChat: 'نئی گفتگو',
    greeting: 'السلام علیکم',
    heading: 'آج آپ کیا جاننا چاہتے ہیں؟',
    sub: 'ہر سوال سمجھنے کی طرف ایک قدم ہے۔',
    placeholder: 'اپنا سوال یہاں لکھیں…',
    send: 'سوال بھیجیں',
  },
  roman: {
    newChat: 'Nayi guftagu',
    greeting: 'Assalamu alaikum',
    heading: 'Aaj aap kya jaanna chahte hain?',
    sub: 'Har sawal samajhne ki taraf aik qadam hai.',
    placeholder: 'Apna sawal yahan likhein…',
    send: 'Sawal bhejein',
  },
};
export function Workspace() {
  const { user, refresh } = useAuth(),
    navigate = useNavigate(),
    location = useLocation(),
    qc = useQueryClient();
  const [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [historySearch, setHistorySearch] = useState(''),
    [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ['conversations', page],
    queryFn: () => api<{ items: Conversation[]; total: number }>(`/conversations?page=${page}`),
  });
  useEffect(() => setMobile(false), [location.pathname]);
  async function logout() {
    checkAuthError(await authClient.signOut());
    qc.clear();
    await refresh();
    navigate('/');
  }
  const sidebar = (
    <>
      <div className="sidebar-brand">
        <Logo light />
        <button
          className="icon-button desktop-toggle"
          aria-label="Collapse sidebar"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftClose size={18} />
        </button>
        <button
          className="icon-button mobile-only"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <PanelLeftClose size={20} />
        </button>
      </div>
      <Button asChild className="new-chat">
        <Link to="/app/chat">
          <Plus size={19} />
          {ui[user!.language].newChat}
        </Link>
      </Button>
      <nav className="workspace-nav" aria-label="Workspace">
        <NavLink to="/app/chat">
          <MessageSquare size={18} /> Your learning space
        </NavLink>
        <NavLink to="/app/history">
          <History size={18} /> Conversation history
        </NavLink>
        {user!.role === 'ADMIN' && (
          <NavLink to="/app/admin">
            <BookOpen size={18} /> Source studio <span className="nav-dot" />
          </NavLink>
        )}
      </nav>
      <div className="sidebar-history">
        <div className="history-heading">
          <span className="eyebrow">YOUR NOTEBOOK</span>
          <History size={14} />
        </div>
        <label className="sidebar-search">
          <Search size={15} />
          <input
            aria-label="Search recent conversations on this page"
            placeholder="Find a conversation…"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        </label>
        {history.isLoading ? (
          <p className="muted">Loading conversations…</p>
        ) : history.isError ? (
          <button onClick={() => history.refetch()} className="text-link">
            Retry history
          </button>
        ) : history.data?.items.length ? (
          history.data.items
            .filter((c) => c.title.toLocaleLowerCase().includes(historySearch.toLocaleLowerCase()))
            .map((c) => (
              <Link
                key={c._id}
                to={`/app/chat/${c._id}`}
                className={
                  location.pathname.includes(c._id) ? 'history-item selected' : 'history-item'
                }
              >
                <MessageSquare size={15} />
                <span>{c.title}</span>
              </Link>
            ))
        ) : (
          <div className="history-empty">
            <MessageSquare size={24} strokeWidth={1.3} />
            <strong>A place for your questions.</strong>
            <span>Your conversations will appear here, ready to return to.</span>
          </div>
        )}
        {!!history.data?.items.length &&
          !history.data.items.some((c) =>
            c.title.toLocaleLowerCase().includes(historySearch.toLocaleLowerCase()),
          ) && <p className="history-empty">No matches on this page. Try another title.</p>}
        {(history.data?.total || 0) > 25 && (
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>{page}</span>
            <button
              disabled={page * 25 >= (history.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Curiosity, with a reference.</strong>
            <p>Open the sources. Read the context. Build your understanding.</p>
          </div>
        </div>
        <NavLink to="/app/settings" className="profile-link">
          <span className="avatar">{user!.fullName.slice(0, 1)}</span>
          <span>
            <strong>{user!.fullName}</strong>
            <small>Your preferences</small>
          </span>
          <Settings size={18} />
        </NavLink>
        <button className="logout-button" onClick={() => void logout()}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </>
  );
  return (
    <div className={`workspace learning-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">{sidebar}</aside>
      <Dialog
        open={mobile}
        onOpenChange={setMobile}
        className="navigation-dialog"
        title="Your workspace"
        description="Navigate your conversations and preferences."
      >
        <div className="mobile-sidebar">{sidebar}</div>
      </Dialog>
      <div className="workspace-body">
        <header className="workspace-header">
          <div>
            {collapsed && (
              <button
                className="icon-button desktop-toggle"
                aria-label="Expand sidebar"
                aria-expanded={false}
                onClick={() => setCollapsed(false)}
              >
                <PanelLeftOpen size={20} />
              </button>
            )}
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span className="workspace-breadcrumb">
              The learning room <span>/</span>{' '}
              <strong>
                {location.pathname.includes('admin')
                  ? 'Source studio'
                  : location.pathname.includes('settings')
                    ? 'Preferences'
                    : location.pathname.includes('history')
                      ? 'History'
                      : 'A new perspective'}
              </strong>
            </span>
          </div>
          <div className="header-status">
            <span className="beta-label">BETA</span> <span className="header-divider" />
            <Languages size={16} />
            <span>{LANGUAGES[user!.language]}</span>
          </div>
        </header>
        <main id="main" className="workspace-main">
          <Routes>
            <Route path="chat" element={<Chat key="new" />} />
            <Route path="chat/:id" element={<Chat key={location.pathname} />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="admin"
              element={user!.role === 'ADMIN' ? <Admin /> : <Navigate to="/app/chat" replace />}
            />
            <Route path="*" element={<Navigate to="/app/chat" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  return (
    <details className="citation-card">
      <summary>
        <span className="citation-number">{index + 1}</span>
        <span>
          <strong>{citation.title}</strong>
          <small>
            {citation.scholar} ·{' '}
            {citation.rulingNumber
              ? `Ruling ${citation.rulingNumber}`
              : citation.section || 'Source passage'}
          </small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="citation-detail">
        <div className="eyebrow">DIRECT SOURCE TEXT · VERSION {citation.version}</div>
        <blockquote dir="auto">{citation.originalText}</blockquote>
        <p>
          {citation.pageNumber ? `Page ${citation.pageNumber} · ` : ''}
          {citation.authority.replaceAll('_', ' ')}
        </p>
        <a href={citation.url} target="_blank" rel="noopener noreferrer">
          Open original source <ExternalLink size={14} />
        </a>
      </div>
    </details>
  );
}
export function Chat() {
  const { user } = useAuth(),
    { id } = useParams(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const [question, setQuestion] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState(''),
    [optimistic, setOptimistic] = useState(''),
    [copied, setCopied] = useState(''),
    [page, setPage] = useState(1);
  const pending = useRef<{ id: string; requestId: string; question: string } | null>(null),
    bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const t = ui[user!.language];
  const history = useQuery({
    queryKey: ['messages', id, page],
    queryFn: () =>
      api<{ items: Message[]; total: number }>(
        `/conversations/${id}/messages?page=${page}&limit=50`,
      ),
    enabled: !!id,
  });
  const readiness = useQuery({
    queryKey: ['ready'],
    queryFn: () => api<{ aiConfigured: boolean }>('/ready'),
  });
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.data, draft, busy]);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`;
  }, [question]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setError('');
    setBusy(true);
    setDraft('');
    setOptimistic(question);
    let target = id;
    try {
      if (!target) {
        target = pending.current?.id;
        if (!target) {
          target = (await api<{ conversation: Conversation }>('/conversations', { method: 'POST' }))
            .conversation._id;
        }
      }
      if (!pending.current || pending.current.question !== question)
        pending.current = { id: target, requestId: crypto.randomUUID(), question };
      await streamAnswer(target, question, pending.current.requestId, (delta) =>
        setDraft((text) => text + delta),
      );
      setQuestion('');
      setOptimistic('');
      pending.current = null;
      setDraft('');
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      await qc.invalidateQueries({ queryKey: ['messages', target] });
      if (!id) navigate(`/app/chat/${target}`);
    } catch (e) {
      setError((e as Error).message);
      setDraft('');
      setOptimistic('');
    } finally {
      setBusy(false);
    }
  }
  const prompts =
    user!.language === 'ur'
      ? [
          ['علم اور تربیت', 'علم اور تعلیم کی اہمیت کے بارے میں بتائیں۔'],
          ['عقائد کو سمجھیں', 'توحید کے بارے میں مزید بتائیں۔'],
          ['اخلاق اور کردار', 'صبر کے بارے میں علمی مصادر کیا بتاتے ہیں؟'],
        ]
      : user!.language === 'roman'
        ? [
            ['Ilm aur tarbiyat', 'Ilm aur taleem ki ahmiyat ke bare mein batayein.'],
            ['Aqaid ko samjhein', 'Tawhid ke bare mein mazeed batayein.'],
            ['Akhlaq aur kirdar', 'Sabr ke bare mein sources kya kehte hain?'],
          ]
        : [
            ['Knowledge & growth', 'What do the sources teach about education?'],
            ['A deeper understanding', 'Help me explore the concept of Tawhid.'],
            ['A thoughtful life', 'What do scholarly sources teach about patience?'],
          ];
  const empty = !id && !busy;
  return (
    <div className={`chat-page ${empty ? 'is-empty' : ''}`}>
      <div className="chat-context">
        <span>
          <span className="context-mark">
            <BookOpen size={15} />
          </span>{' '}
          Source-guided learning
        </span>
        {FIQH_ENABLED ? (
          <Link to="/app/settings">
            {user!.marja === 'SISTANI' ? 'Ayatollah al-Sistani' : 'Ayatollah Ali Khamenei'}
            <ChevronDown size={14} />
          </Link>
        ) : (
          <span className="education-scope">Aqaid · Akhlaq · Learning</span>
        )}
      </div>
      {empty ? (
        <section className="chat-welcome" dir={user!.language === 'ur' ? 'rtl' : 'ltr'}>
          <div className="welcome-art" aria-hidden="true">
            <span />
            <BookOpen size={30} strokeWidth={1.3} />
            <span />
          </div>
          <span className="eyebrow">
            {t.greeting}, {user!.fullName.split(' ')[0]}
          </span>
          <h1>{t.heading}</h1>
          <p>{t.sub}</p>
        </section>
      ) : (
        <div className="message-list" aria-live="polite">
          {history.isLoading && <div className="message-skeleton">Opening your conversation…</div>}
          {history.isError && (
            <Notice>
              Unable to load this conversation.{' '}
              <button onClick={() => history.refetch()}>Retry</button>
            </Notice>
          )}
          {(history.data?.total || 0) > 50 && (
            <div className="pagination">
              <button
                disabled={page * 50 >= (history.data?.total || 0)}
                onClick={() => setPage(page + 1)}
              >
                Earlier messages
              </button>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Newer messages
              </button>
            </div>
          )}
          {history.data?.items.map((m) => (
            <article key={m._id} className={`message ${m.role}`}>
              <div className="message-avatar">
                {m.role === 'assistant' ? (
                  <img src="/favicon.svg" alt="SJN" />
                ) : (
                  user!.fullName.slice(0, 1)
                )}
              </div>
              <div className="message-body">
                <div className="message-label">
                  {m.role === 'assistant' ? 'SJN' : 'You'}
                  <span>
                    {m.role === 'assistant'
                      ? m.mode === 'grounded'
                        ? 'AI explanation · source-based'
                        : m.mode === 'clarification'
                          ? 'A little more context'
                          : 'Source guidance'
                      : new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </span>
                </div>
                <div className="markdown" dir={m.language === 'ur' ? 'rtl' : 'auto'}>
                  <ReactMarkdown
                    skipHtml
                    components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
                {m.citations.length > 0 && (
                  <div className="citations">
                    <span className="eyebrow">
                      <BookOpen size={14} /> EXPLORE THE SOURCES{' '}
                      <span className="source-count">{m.citations.length}</span>
                    </span>
                    {m.citations.map((c, i) => (
                      <CitationCard key={c.chunkId} citation={c} index={i} />
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && (
                  <div className="message-tools">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.content);
                          setCopied(m._id);
                          setTimeout(() => setCopied(''), 2000);
                        } catch {
                          setError(
                            'Your browser could not copy this answer. Please select and copy the text.',
                          );
                        }
                      }}
                    >
                      {copied === m._id ? <Check size={14} /> : <Copy size={14} />}{' '}
                      {copied === m._id ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={() => input.current?.focus()}>
                      <MessageSquare size={14} /> Ask a follow-up
                    </button>
                    <span>
                      {FIQH_ENABLED &&
                        `${m.marjaSnapshot === 'SISTANI' ? 'Sistani' : 'Ali Khamenei'} · `}
                      {LANGUAGES[m.language]}
                    </span>
                  </div>
                )}
              </div>
            </article>
          ))}
          {optimistic && (
            <article className="message user">
              <div className="message-avatar">{user!.fullName.slice(0, 1)}</div>
              <div className="message-body">
                <div className="message-label">You</div>
                <p dir="auto">{optimistic}</p>
              </div>
            </article>
          )}
          {busy && (
            <article className="message assistant">
              <div className="message-avatar">
                <img src="/favicon.svg" alt="SJN" />
              </div>
              <div className="message-body">
                <div className="message-label">
                  SJN <span>Checking the sources</span>
                </div>
                {draft ? (
                  <p dir="auto">{draft}</p>
                ) : (
                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                    <small>Preparing a carefully sourced response…</small>
                  </div>
                )}
              </div>
            </article>
          )}
          <div ref={bottom} />
        </div>
      )}
      <div className="composer-area">
        {error && (
          <Notice>
            {error} <button onClick={() => input.current?.focus()}>Review and retry</button>
          </Notice>
        )}
        {!readiness.data?.aiConfigured && readiness.isSuccess && !error && (
          <div className="configuration-note">
            <span className="status-dot amber" />
            Your learning space is ready. AI answers will be available once a provider is connected.
          </div>
        )}
        <form className="composer" onSubmit={send}>
          <textarea
            ref={input}
            aria-label="Your question"
            placeholder={t.placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={4000}
            disabled={busy}
            dir={user!.language === 'ur' ? 'rtl' : 'auto'}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="composer-bottom">
            <Link
              to="/app/settings"
              className="composer-preferences"
              aria-label={
                FIQH_ENABLED
                  ? 'Change answer language and Marja preferences'
                  : 'Change answer language'
              }
            >
              <Languages size={15} />
              {LANGUAGES[user!.language]}
              <ChevronDown size={13} />
            </Link>
            <div>
              <small>{question.length ? `${question.length}/4000` : 'Enter to send'}</small>
              <Button
                type="submit"
                size="icon"
                disabled={busy || !question.trim()}
                aria-label={t.send}
              >
                <ArrowUp size={20} />
              </Button>
            </div>
          </div>
        </form>
        <p className="chat-disclaimer">
          <ShieldCheck size={13} /> SJN is an AI educational assistant, not an official religious
          authority. Please verify important answers.
        </p>
      </div>
      {empty && (
        <section
          className="chat-discover"
          aria-label="Explore a question"
          dir={user!.language === 'ur' ? 'rtl' : 'ltr'}
        >
          <div className="discovery-label">
            <span />
            {user!.language === 'ur'
              ? 'ایک سوال سے آغاز کریں'
              : user!.language === 'roman'
                ? 'Aik sawal se shuru karein'
                : 'A FEW PLACES TO BEGIN'}
            <span />
          </div>
          <div className="prompt-grid">
            {prompts.map(([title, q], i) => (
              <button
                key={title}
                onClick={() => {
                  setQuestion(q);
                  input.current?.focus();
                }}
              >
                <span className="prompt-icon">
                  {i === 0 ? (
                    <Compass size={21} />
                  ) : i === 1 ? (
                    <Sparkles size={21} />
                  ) : (
                    <BookOpen size={21} />
                  )}
                </span>
                <strong>{title}</strong>
                <span>{q}</span>
                <ArrowUpRight size={16} className="prompt-arrow" />
              </button>
            ))}
          </div>
          <div className="welcome-footnote">
            <ShieldCheck size={15} />
            <span>
              {user!.language === 'ur'
                ? 'جواب کے ساتھ مصادر پڑھیں اور سیاق کو سمجھیں۔'
                : user!.language === 'roman'
                  ? 'Jawab ke saath sources parhein aur pas-e-manzar samjhein.'
                  : 'An answer is a beginning. The sources take you further.'}
            </span>
          </div>
          <Link className="notebook-link" to="/app/history">
            Return to your notebook <ArrowRight size={14} />
          </Link>
        </section>
      )}
    </div>
  );
}
function HistoryPage() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [editing, setEditing] = useState<Conversation | null>(null),
    [deleting, setDeleting] = useState<Conversation | null>(null),
    [title, setTitle] = useState(''),
    [error, setError] = useState('');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['conversations', page],
    queryFn: () => api<{ items: Conversation[]; total: number }>(`/conversations?page=${page}`),
  });
  async function mutate() {
    try {
      if (editing)
        await api(`/conversations/${editing._id}`, { method: 'PATCH', body: json({ title }) });
      if (deleting) await api(`/conversations/${deleting._id}`, { method: 'DELETE' });
      setEditing(null);
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="content-page">
      <span className="eyebrow">YOUR PATH SO FAR</span>
      <h1>Conversations worth returning to.</h1>
      <p>A home for your questions, reflections, and discoveries.</p>
      <div className="search-field">
        <Search size={18} />
        <input
          aria-label="Search this page of history"
          placeholder="Search conversations on this page…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {isLoading ? (
        <p>Loading…</p>
      ) : data?.items.length ? (
        <div className="history-table">
          {data.items
            .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <article key={c._id}>
                <MessageSquare size={20} />
                <Link to={`/app/chat/${c._id}`}>
                  <strong>{c.title}</strong>
                  <small>
                    {new Date(c.updatedAt).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </small>
                </Link>
                <button
                  className="icon-button"
                  aria-label={`Rename ${c.title}`}
                  onClick={() => {
                    setEditing(c);
                    setTitle(c.title);
                    setError('');
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => {
                    setDeleting(c);
                    setError('');
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
        </div>
      ) : (
        <div className="empty-state">
          <History size={36} />
          <h2>A fresh page.</h2>
          <p>Your first conversation is waiting to happen.</p>
          <Button asChild>
            <Link to="/app/chat">
              Start a conversation <Plus size={16} />
            </Link>
          </Button>
        </div>
      )}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button disabled={page * 25 >= (data?.total || 0)} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
      <Dialog
        open={!!editing || !!deleting}
        onOpenChange={(v) => {
          if (!v) {
            setEditing(null);
            setDeleting(null);
          }
        }}
        title={editing ? 'Rename conversation' : 'Delete this conversation?'}
        description={
          editing
            ? 'Give this conversation a meaningful name.'
            : 'This permanently deletes the messages. This cannot be undone.'
        }
      >
        {error && <Notice>{error}</Notice>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate();
          }}
        >
          {editing && (
            <label>
              Conversation title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={1}
                maxLength={100}
                required
              />
            </label>
          )}
          <Button variant={deleting ? 'danger' : 'default'}>
            {editing ? 'Save name' : 'Delete conversation'}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
function PasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function change(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmation) {
      setStatus('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      checkAuthError(
        await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setStatus('Your password has been changed. Other sessions have been signed out.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <div>
        <h2>Change password</h2>
        <p>Update the password for your email sign-in.</p>
      </div>
      {status && <Notice>{status}</Notice>}
      <form onSubmit={change}>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            maxLength={128}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <small>Use at least 12 characters. Your other sessions will be signed out.</small>
        <Button disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</Button>
      </form>
    </section>
  );
}
function SettingsPage() {
  const { user, refresh } = useAuth(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const [name, setName] = useState(user!.fullName),
    [age, setAge] = useState(user!.age),
    [gender, setGender] = useState(user!.gender),
    [marja, setMarja] = useState<Marja>(user!.marja),
    [language, setLanguage] = useState<Language>(user!.language),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () =>
      api<{ sessions: { _id: string; createdAt: string; expiresAt: string }[] }>('/sessions'),
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await api<{ user: User }>('/profile', {
        method: 'PATCH',
        body: json({ fullName: name, age, gender, ...(FIQH_ENABLED ? { marja } : {}), language }),
      });
      await refresh();
      setStatus('Your preferences have been saved. New answers will use these settings.');
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-page settings-page">
      <span className="eyebrow">MAKE YOURSELF AT HOME</span>
      <h1>Your space. Your preferences.</h1>
      <p>A few thoughtful choices for a more personal learning journey.</p>
      {status && <Notice>{status}</Notice>}
      <form onSubmit={save}>
        <section className="settings-card">
          <div>
            <h2>Personal details</h2>
            <p>How you appear in your learning space.</p>
          </div>
          <label>
            Full name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label>
            Email address
            <input value={user!.email} disabled />
            <small>Your sign-in email.</small>
          </label>
          <div className="form-columns">
            <label>
              Age
              <input
                type="number"
                min={18}
                max={120}
                required
                value={age ?? ''}
                onChange={(e) => setAge(Number(e.target.value))}
              />
            </label>
            <label>
              Gender
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option>Prefer not to say</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </label>
          </div>
        </section>
        <section className="settings-card">
          <div>
            <h2>Learning preferences</h2>
            <p>
              {FIQH_ENABLED
                ? 'Your Marja applies to Fiqh sources. Educational sources retain their own scholarly attribution.'
                : 'Explore Aqaid, Akhlaq and Islamic education in your preferred language. Fiqh rulings are not available in this phase.'}
            </p>
          </div>
          {FIQH_ENABLED && (
            <>
              <label>
                Marja-e-Taqleed
                <select value={marja} onChange={(e) => setMarja(e.target.value as Marja)}>
                  {Object.entries(MARJAS).map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                      {id === 'ALI_KHAMENEI' ? ' (deceased, 2026)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {marja === 'ALI_KHAMENEI' && <MarjaNotice />}
              <small>
                Changing your Marja affects new answers. Previous references remain unchanged.
              </small>
            </>
          )}
          <label>
            Answer language
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {Object.entries(LANGUAGES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </section>
        <Button disabled={busy}>
          {busy ? 'Saving…' : 'Save preferences'}
          <Check size={17} />
        </Button>
      </form>
      <section className="settings-card">
        <div>
          <h2>Connected accounts</h2>
          <p>
            Use Google to sign in to this same learning space. Connect a Google account with your
            sign-in email.
          </p>
        </div>
        <GoogleAccess link />
      </section>
      <PasswordSettings />
      <section className="settings-card session-card">
        <div>
          <h2>Account sessions</h2>
          <p>
            {sessions.data?.sessions.length || 0} active sessions. Sessions expire after seven days
            of inactivity.
          </p>
        </div>
        <Button variant="outline" onClick={() => setConfirm(true)}>
          Sign out everywhere <LogOut size={16} />
        </Button>
      </section>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out of all sessions?"
        description="This includes the session you are using now."
      >
        <Button
          variant="danger"
          onClick={async () => {
            checkAuthError(await authClient.revokeSessions());
            checkAuthError(await authClient.signOut());
            qc.clear();
            await refresh();
            navigate('/login');
          }}
        >
          Sign out everywhere
        </Button>
      </Dialog>
    </div>
  );
}
