import { authClient, checkAuthError } from './auth-client';
import { GoogleAccess } from './GoogleAccess';
import { MARJAS, LANGUAGES } from '@sjn/shared/display';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  BookOpen,
  Languages,
  Eye,
  EyeOff,
} from 'lucide-react';
import { type User, type Marja, type Language } from '@sjn/shared';
import { FIQH_ENABLED } from '@sjn/shared/features';
import { api, json } from './api';
import { Logo, useAuth, Notice } from './App';
import { Button } from './components/ui/button';
export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, refresh } = useAuth(),
    navigate = useNavigate();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  if (user) return <Navigate to={user.onboardingComplete ? '/app/chat' : '/onboarding'} replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const credentials = {
        email: String(data.get('email')).trim().toLowerCase(),
        password: String(data.get('password')),
      };
      const result = register
        ? await authClient.signUp.email({
            ...credentials,
            name: 'Learner',
            age: Number(data.get('age')),
          })
        : await authClient.signIn.email(credentials);
      checkAuthError(result);
      await refresh();
      navigate(register ? '/onboarding' : '/app/chat');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page" id="main">
      <aside className="auth-story">
        <Logo light />
        <div>
          <span className="eyebrow">YOUR LEARNING JOURNEY</span>
          <h1>
            A little curiosity.
            <br />
            <em>A deeper connection.</em>
          </h1>
          <p>
            A quiet space to ask meaningful questions and explore Islamic knowledge, one
            conversation at a time.
          </p>
          <div className="story-mark">✦</div>
        </div>
        <small>
          <ShieldCheck size={16} /> Thoughtful answers begin with trusted sources.
        </small>
      </aside>
      <section className="auth-form-wrap">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to SJN
        </Link>
        <div className="auth-form">
          <span className="eyebrow">
            {register ? 'BEGIN WITH BISMILLAH' : 'CONTINUE YOUR JOURNEY'}
          </span>
          <h2>{register ? 'Welcome to your learning space.' : 'A warm welcome back.'}</h2>
          <p>
            {register
              ? 'Create your account. Bring your questions.'
              : 'Sign in to pick up where your curiosity left off.'}
          </p>
          {error && <Notice>{error}</Notice>}
          <GoogleAccess disabled={busy} />
          <div className="auth-divider">
            <span>or continue with email</span>
          </div>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  placeholder={register ? 'At least 12 characters' : 'Your password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  minLength={12}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register && (
              <label>
                Your age
                <input
                  name="age"
                  type="number"
                  min={18}
                  max={120}
                  placeholder="18 or above"
                  required
                />
                <small>
                  Our private beta is for adults aged 18+. We don’t need your date of birth.
                </small>
              </label>
            )}
            <Button disabled={busy} className="full-width">
              {busy ? 'Just a moment…' : register ? 'Create your account' : 'Sign in'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to SJN?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Begin your journey'}
            </Link>
          </p>
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <span>
              Your account uses a secure session. Your profile and conversations are saved privately
              to your account.
            </span>
          </div>
        </div>
        <small className="auth-caption">A space to ask. A path to understand.</small>
      </section>
    </main>
  );
}
export function MarjaNotice() {
  return (
    <div className="marja-notice">
      Ayatollah Sayyid Ali Khamenei is a deceased Marja (2026). Questions about beginning or
      continuing his Taqlid require guidance from an authorized office or qualified scholar. SJN
      does not decide this issue.
    </div>
  );
}
export function Onboarding() {
  const { user, refresh } = useAuth(),
    navigate = useNavigate();
  const steps = FIQH_ENABLED ? [1, 2, 3, 4] : [1, 3, 4];
  const [step, setStep] = useState(
      !FIQH_ENABLED && user!.onboardingStep === 2 ? 3 : user!.onboardingStep,
    ),
    [name, setName] = useState(user!.fullName),
    [age, setAge] = useState(user!.age),
    [gender, setGender] = useState(user!.gender),
    [marja, setMarja] = useState<Marja>(user!.marja),
    [language, setLanguage] = useState<Language>(user!.language),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (user!.onboardingComplete) return <Navigate to="/app/chat" replace />;
  async function next(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api<{ user: User }>('/profile', {
        method: 'PATCH',
        body: json({
          fullName: name,
          age,
          gender,
          ...(FIQH_ENABLED ? { marja } : {}),
          language,
          onboardingStep: steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)],
          complete: step === 4,
        }),
      });
      await refresh();
      if (step === 4) navigate('/app/chat');
      else setStep(steps[steps.indexOf(step) + 1]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <header>
        <Logo />
        <span>Your space, your preferences</span>
      </header>
      <main id="main">
        <div className="onboarding-progress">
          {steps.map((s, i) => (
            <div className={step >= s ? 'active' : ''} key={s}>
              <span>{step > s ? <Check size={15} /> : i + 1}</span>
              <small>{['About you', 'Your Marja', 'Your language', 'Welcome'][s - 1]}</small>
            </div>
          ))}
        </div>
        <form className="onboarding-card" onSubmit={next}>
          <span className="eyebrow">
            STEP {steps.indexOf(step) + 1} OF {steps.length}
          </span>
          <h1>
            {
              [
                'Let’s get to know you.',
                'Who is your Marja-e-Taqleed?',
                'A language that feels like home.',
                'Your curiosity belongs here.',
              ][step - 1]
            }
          </h1>
          <p>
            {
              [
                'Just a few details to make this space yours.',
                'Your choice keeps Fiqh answers specific to your religious authority.',
                'Choose how you’d like to receive your answers. You can change this anytime.',
                'Ask freely, read thoughtfully, and always explore the source.',
              ][step - 1]
            }
          </p>
          {error && <Notice>{error}</Notice>}
          {step === 1 && (
            <div className="form-stack">
              <label>
                Full name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <div className="form-columns">
                <label>
                  Age
                  <input
                    type="number"
                    value={age ?? ''}
                    onChange={(e) => setAge(Number(e.target.value))}
                    min={18}
                    max={120}
                    required
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
              <small>Private beta · Adults aged 18 and above.</small>
            </div>
          )}
          {FIQH_ENABLED && step === 2 && (
            <>
              <div className="choice-stack">
                {Object.entries(MARJAS).map(([id, title]) => (
                  <label className={`choice ${marja === id ? 'selected' : ''}`} key={id}>
                    <input
                      type="radio"
                      name="marja"
                      value={id}
                      checked={marja === id}
                      onChange={() => setMarja(id as Marja)}
                    />
                    <span>
                      <strong>{title}</strong>
                      <small>
                        {id === 'ALI_KHAMENEI'
                          ? 'Published rulings · Deceased Marja (2026)'
                          : 'Fiqh through approved, attributed rulings'}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <MarjaNotice />
            </>
          )}
          {step === 3 && (
            <div className="choice-stack">
              {Object.entries(LANGUAGES).map(([id, title]) => (
                <label className={`choice ${language === id ? 'selected' : ''}`} key={id}>
                  <input
                    type="radio"
                    name="language"
                    checked={language === id}
                    onChange={() => setLanguage(id as Language)}
                  />
                  <span>
                    <strong>{title}</strong>
                    <small>
                      {id === 'ur'
                        ? 'Urdu · Recommended for Pakistani readers'
                        : id === 'en'
                          ? 'Learn and explore in English'
                          : 'Urdu, written in the Latin alphabet'}
                    </small>
                  </span>
                  <Languages size={20} />
                </label>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="welcome-features">
              <article>
                <BookOpen />
                <div>
                  <strong>Follow the source</strong>
                  <p>Answers use approved passages, with references you can inspect.</p>
                </div>
              </article>
              <article>
                <ShieldCheck />
                <div>
                  <strong>Make room for care</strong>
                  <p>
                    AI can make mistakes. SJN is an educational assistant, not an official
                    representative of a scholar.
                  </p>
                </div>
              </article>
              <div className="sample-question">
                Try asking: “What do the sources teach about patience?”
              </div>
              {!FIQH_ENABLED && (
                <p>
                  Aqaid, Akhlaq and Islamic education. Fiqh rulings are not available in this phase.
                </p>
              )}
            </div>
          )}
          <div className="onboarding-actions">
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(steps[steps.indexOf(step) - 1])}
              >
                <ArrowLeft size={16} /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={busy}>
              {busy ? 'Saving…' : step === 4 ? 'Start chatting' : 'Continue'}
              <ArrowRight size={17} />
            </Button>
          </div>
        </form>
        <p className="resume-note">
          Your progress is saved as you continue. Come back whenever you’re ready.
        </p>
      </main>
    </div>
  );
}
