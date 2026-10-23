import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { authClient, checkAuthError, oauthError } from './auth-client';
import { api } from './api';
import { Button } from './components/ui/button';

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
      />
    </svg>
  );
}
export function GoogleAccess({
  link = false,
  disabled = false,
}: {
  link?: boolean;
  disabled?: boolean;
}) {
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<{ googleEnabled: boolean; origin: string }>('/auth/config'),
    staleTime: 60000,
  });
  const accounts = useQuery({
    queryKey: ['linked-accounts'],
    enabled: link,
    queryFn: async () => {
      const result = await authClient.listAccounts();
      checkAuthError(result);
      return result.data || [];
    },
  });
  const connected = accounts.data?.some((account) => account.providerId === 'google');
  const message = error || oauthError(params.get('error'));
  async function connect() {
    setError('');
    setBusy(true);
    try {
      // OAuth state and its callback must use the same hostname, even in local development.
      if (config.data && location.origin !== config.data.origin) {
        location.assign(new URL(link ? '/app/settings' : '/login', config.data.origin).href);
        return;
      }
      if (link) {
        checkAuthError(
          await authClient.linkSocial({
            provider: 'google',
            callbackURL: '/app/settings',
            errorCallbackURL: '/app/settings',
          }),
        );
      } else {
        checkAuthError(
          await authClient.signIn.social({
            provider: 'google',
            callbackURL: '/app/chat',
            newUserCallbackURL: '/onboarding',
            errorCallbackURL: '/login',
          }),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="google-access">
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className={link ? '' : 'full-width google-button'}
        disabled={
          disabled ||
          busy ||
          !config.data?.googleEnabled ||
          Boolean(connected) ||
          (link && (accounts.isPending || accounts.isError))
        }
        onClick={connect}
      >
        <GoogleMark />{' '}
        {busy
          ? 'Opening Google…'
          : connected
            ? 'Google connected'
            : link
              ? 'Connect Google'
              : 'Continue with Google'}
      </Button>
      {!config.isPending && !config.data?.googleEnabled && (
        <p className="auth-provider-note">
          {config.isError
            ? 'Google sign-in is temporarily unavailable. Please use email.'
            : 'Google sign-in will be available once this site’s connection is configured.'}
        </p>
      )}
      {accounts.isError && link && (
        <p className="auth-provider-note" role="alert">
          Unable to load connected accounts. Please refresh to try again.
        </p>
      )}
    </div>
  );
}
