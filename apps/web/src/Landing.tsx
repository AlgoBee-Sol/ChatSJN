import { Link } from 'react-router';
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  Languages,
  Check,
  Compass,
  Sparkles,
  Quote,
  ChevronDown,
} from 'lucide-react';
import { Logo, useAuth } from './App';
import { Button } from './components/ui/button';
const subjects = [
  {
    name: 'Fiqh & everyday life',
    desc: 'Explore practical questions through your selected Marja.',
    icon: Compass,
    tag: 'PRACTICE',
  },
  {
    name: 'Belief & understanding',
    desc: 'Make space for deeper questions about faith and purpose.',
    icon: Sparkles,
    tag: 'REFLECT',
  },
  {
    name: 'Quran & its meanings',
    desc: 'Discover perspectives with clear scholarly attribution.',
    icon: BookOpen,
    tag: 'DISCOVER',
  },
  {
    name: 'Character & growth',
    desc: 'Bring thoughtful Islamic learning into your everyday life.',
    icon: Quote,
    tag: 'BECOME',
  },
];
export function Landing() {
  const { user } = useAuth();
  const enter = user ? '/app/chat' : '/register';
  return (
    <div className="landing">
      <header className="public-nav">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="#approach">Our approach</a>
          <a href="#explore">Explore knowledge</a>
          <a href="#questions">Common questions</a>
        </nav>
        <div className="nav-actions">
          <Link className="login-link" to={user ? '/app/chat' : '/login'}>
            {user ? 'My workspace' : 'Log in'}
          </Link>
          <Button asChild size="sm">
            <Link to={enter}>
              Start your journey <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-star">✦</span> ROOTED IN FAITH. GUIDED BY SOURCES.
            </div>
            <h1>
              A clearer path to
              <br />
              <em>Islamic knowledge.</em>
            </h1>
            <p>
              A thoughtful space for your questions. Explore faith, find understanding, and learn
              from scholarly sources — in a language that feels like home.
            </p>
            <div className="hero-actions">
              <Button asChild>
                <Link to={enter}>
                  Begin your conversation <ArrowUpRight size={18} />
                </Link>
              </Button>
              <a className="text-link" href="#approach">
                Discover the approach <ArrowRight size={16} />
              </a>
            </div>
            <div className="hero-foot">
              <span>
                <ShieldCheck size={17} /> Source-based answers
              </span>
              <i />
              <span>
                اردو <b>·</b> English <b>·</b> Roman Urdu
              </span>
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="An illustration of a calm, source-guided learning space"
          >
            <div className="art-grid" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="art-star star-one">✧</span>
            <span className="art-star star-two">✦</span>
            <div className="arch">
              <div className="arch-inner">
                <div className="arabic-art" lang="ar" dir="rtl">
                  بِسْمِ اللَّهِ
                </div>
                <div className="arch-rule" />
                <span>
                  A LITTLE CURIOSITY.
                  <br />A LIFETIME OF LEARNING.
                </span>
                <BookOpen strokeWidth={1} className="art-book" />
              </div>
              <div className="arch-bottom" />
            </div>
            <div className="art-card card-question">
              <span className="small-icon">
                <Sparkles size={17} />
              </span>
              <div>
                <small>EVERY QUESTION IS A BEGINNING</small>
                <p>Let’s seek understanding.</p>
              </div>
            </div>
            <div className="art-card card-source">
              <span className="check-orb">
                <Check size={16} />
              </span>
              <div>
                <strong>Knowledge with a reference.</strong>
                <small>Clear sources. Thoughtful context.</small>
              </div>
              <BookOpen size={18} />
            </div>
            <span className="art-caption">A SPACE TO ASK. A PATH TO UNDERSTAND.</span>
          </div>
        </section>
        <div className="principles-strip">
          <span>
            YOUR CURIOSITY.
            <br />
            <strong>A considered approach.</strong>
          </span>
          <div>
            <ShieldCheck />
            <p>
              Grounded in sources<small>References you can explore</small>
            </p>
          </div>
          <div>
            <Compass />
            <p>
              Respectful of your Marja<small>Distinct authority. Clear attribution.</small>
            </p>
          </div>
          <div>
            <Languages />
            <p>
              Learning in your language<small>Urdu, English & Roman Urdu</small>
            </p>
          </div>
        </div>
        <section className="explore-section section-wrap" id="explore">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ROOM FOR EVERY QUESTION</span>
              <h2>Where would you like to begin?</h2>
            </div>
            <Link to={enter} className="text-link">
              Explore with SJN <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="subject-grid">
            {subjects.map((s) => (
              <Link to={enter} className="subject-card" key={s.name}>
                <div className="subject-top">
                  <s.icon size={25} strokeWidth={1.4} />
                  <span>{s.tag}</span>
                </div>
                <h3>{s.name}</h3>
                <p>{s.desc}</p>
                <span className="subject-arrow">
                  <ArrowUpRight size={19} />
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className="approach-section section-wrap" id="approach">
          <div>
            <span className="eyebrow">TRUST BEGINS WITH TRANSPARENCY</span>
            <h2>
              Not just an answer.
              <br />
              <em>A way to understand.</em>
            </h2>
            <p>
              Religious knowledge deserves care. SJN is designed to keep the source, the scholar,
              and the explanation in view.
            </p>
            <Link to={enter} className="text-link">
              Find your starting point <ArrowRight size={17} />
            </Link>
          </div>
          <div className="approach-steps">
            {[
              [
                '01',
                'Your faith, your preferences',
                'Choose your Marja and preferred language. Fiqh sources stay specific to your selection.',
              ],
              [
                '02',
                'Sources before certainty',
                'Only approved material is available for answers. When evidence is missing, we say so.',
              ],
              [
                '03',
                'An invitation to learn more',
                'Open the reference, read the passage, and take personal questions to a qualified scholar.',
              ],
            ].map(([n, title, desc]) => (
              <div key={n}>
                <span>{n}</span>
                <article>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </article>
              </div>
            ))}
          </div>
        </section>
        <section className="faq-section section-wrap" id="questions">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A FEW THINGS TO KNOW</span>
              <h2>Clarity, from the beginning.</h2>
            </div>
            <span className="pill">PRIVATE BETA · V0.1</span>
          </div>
          {[
            [
              'Is SJN an official religious authority?',
              'No. SJN is an AI educational assistant, not an official representative of any scholar or Marja. AI can make mistakes. Personal religious decisions should be discussed with a qualified scholar or authorized office.',
            ],
            [
              'How are different scholarly sources used?',
              'Fiqh retrieval is restricted to your selected Marja: Ayatollah Sayyid Ali al-Sistani or Ayatollah Sayyid Ali Khamenei. Other Islamic education uses approved Syed Jawad Naqvi material and attributes interpretations to their source.',
            ],
            [
              'Can I use SJN in Urdu?',
              'Yes. Choose Urdu, English or Roman Urdu during onboarding, and change your preference in settings. Urdu answers use right-to-left text and dedicated Arabic-script typography.',
            ],
            [
              'What is available in this private beta?',
              'Adults aged 18 and over can create an account, set preferences and save conversations. AI answers require a configured model and approved sources. The beta does not provide answers when verified material is unavailable.',
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="closing">
          <span className="tiny-star">✦</span>
          <h2>
            Every meaningful journey
            <br />
            begins with a question.
          </h2>
          <Button asChild>
            <Link to={enter}>
              Make room for understanding <ArrowUpRight size={18} />
            </Link>
          </Button>
          <p>Thoughtfully built for a life of learning.</p>
        </section>
      </main>
      <footer className="public-footer">
        <Logo />
        <p>An AI educational companion. Not an official religious authority.</p>
        <span>© {new Date().getFullYear()} SJN · Private beta</span>
      </footer>
    </div>
  );
}
