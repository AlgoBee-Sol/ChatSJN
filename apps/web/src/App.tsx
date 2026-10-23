import { lazy, Suspense, createContext, useContext, useEffect, type ReactNode } from 'react';
import { Route, Routes, Navigate, useLocation, Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@sjn/shared';
import { api, ApiError } from './api';
import { Landing } from './Landing';
import { AuthPage, Onboarding } from './Auth';
const Workspace = lazy(() =>
  import('./Workspace').then((module) => ({ default: module.Workspace })),
);
import { Button } from './components/ui/button';
const AuthContext = createContext<{ user: User | null; refresh: () => Promise<unknown> }>({
  user: null,
  refresh: async () => {},
});
export const useAuth = () => useContext(AuthContext);
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link className={`logo ${light ? 'logo-light' : ''}`} to="/" aria-label="SJN home">
      <img src="/favicon.svg" alt="" />
      <span>
        SJN<span className="logo-ai">AI</span>
        <small>KNOWLEDGE WITH PURPOSE</small>
      </span>
    </Link>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status">
      {children}
    </div>
  );
}
function Guard({ children }: { children: ReactNode }) {
  const { user } = useAuth(),
    location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboardingComplete && location.pathname !== '/onboarding')
    return <Navigate to="/onboarding" replace />;
  return children;
}
export function App() {
  const qc = useQueryClient(),
    location = useLocation();
  const auth = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
  });
  useEffect(() => {
    window.scrollTo(0, 0);
    const robots = document.querySelector('meta[name=robots]');
    if (location.pathname !== '/') robots?.setAttribute('content', 'noindex,nofollow');
    document.title =
      location.pathname === '/'
        ? 'SJN — A clearer path to Islamic knowledge'
        : `${location.pathname.includes('settings') ? 'Settings' : location.pathname.includes('admin') ? 'Source studio' : location.pathname.includes('chat') ? 'Your learning space' : 'Welcome'} · SJN`;
  }, [location.pathname]);
  if (auth.isPending)
    return (
      <div className="page-loader">
        <img src="/favicon.svg" alt="" />
        <p>Opening your learning space…</p>
      </div>
    );
  if (auth.isError)
    return (
      <div className="page-loader">
        <h1>Let’s reconnect.</h1>
        <p>The service is temporarily unavailable. Please try again in a moment.</p>
        <Button onClick={() => auth.refetch()}>Try again</Button>
      </div>
    );
  return (
    <AuthContext.Provider
      value={{ user: auth.data || null, refresh: () => qc.invalidateQueries({ queryKey: ['me'] }) }}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Suspense fallback={<div className="page-loader">Opening your learning space…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<AuthPage register />} />
          <Route path="/login" element={<AuthPage />} />
          <Route
            path="/onboarding"
            element={
              <Guard>
                <Onboarding />
              </Guard>
            }
          />
          <Route
            path="/app/*"
            element={
              <Guard>
                <Workspace />
              </Guard>
            }
          />
          <Route
            path="*"
            element={
              <main id="main" className="page-loader">
                <h1>This page is still unwritten.</h1>
                <Button asChild>
                  <Link to="/">Back to home</Link>
                </Button>
              </main>
            }
          />
        </Routes>
      </Suspense>
    </AuthContext.Provider>
  );
}
