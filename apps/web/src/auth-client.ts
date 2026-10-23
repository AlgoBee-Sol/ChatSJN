import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

// Same-origin requests keep HttpOnly credentials out of browser storage.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { age: { type: 'number', required: false } } })],
});
export function checkAuthError(result: { error: { message?: string; code?: string } | null }) {
  if (result.error) throw new Error(result.error.message || 'Unable to sign in. Please try again.');
}
export function oauthError(code: string | null) {
  if (!code) return '';
  if (code === 'account_not_linked')
    return 'An account already uses this email. Sign in with your password, then connect Google in your preferences.';
  if (code === 'access_denied')
    return 'Google sign-in was cancelled. You can try again or use your email.';
  return 'Google sign-in could not be completed. Please try again from this page.';
}
