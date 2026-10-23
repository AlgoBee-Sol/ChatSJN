import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('public site, onboarding, grounded chat, references, history and preferences', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A clearer path/ })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await mkdir('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Begin your conversation' }).click();
  const email = `${testInfo.project.name}-${Date.now()}@example.org`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-test-password-123');
  await page.getByLabel('Your age').fill('27');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page.getByRole('heading', { name: 'Let’s get to know you.' })).toBeVisible();
  await page.getByLabel('Full name').fill('Ayesha Test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Who is your Marja-e-Taqleed?' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Who is your Marja-e-Taqleed?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: /English/ }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start chatting' }).click();
  await expect(page.getByRole('heading', { name: 'What’s on your mind today?' })).toBeVisible();
  await page.screenshot({
    path: `.local/screenshots/chat-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel('Your question').fill('What do approved sources say about wudu?');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.getByText('SYNTHETIC TEST ANSWER', { exact: false })).toBeVisible();
  await page.locator('.citation-card summary').click();
  await expect(page.getByText('SYNTHETIC TEST FIXTURE:', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open original source' })).toHaveAttribute(
    'href',
    'https://example.org/synthetic-test-fixture',
  );
  await page.screenshot({
    path: `.local/screenshots/answer-${testInfo.project.name}.png`,
    fullPage: true,
  });
  async function navigate(name: string) {
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name, exact: true }).click();
  }
  await navigate('Conversation history');
  await expect(
    page.getByRole('heading', { name: 'Conversations worth returning to.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Rename What/ }).click();
  await page.getByLabel('Conversation title').fill('My learning notes');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(
    page.locator('.history-table').getByRole('link', { name: /My learning notes/ }),
  ).toBeVisible();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: /Ayesha Test Your preferences/ }).click();
  await page.getByLabel('Full name').fill('Ayesha Updated');
  await page.getByLabel('Marja-e-Taqleed').selectOption('ALI_KHAMENEI');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Your preferences have been saved.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Ayesha Updated');
  await page.getByLabel('Answer language').selectOption('ur');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await navigate('Your learning space');
  await expect(page.getByRole('heading', { name: 'آج آپ کیا جاننا چاہتے ہیں؟' })).toBeVisible();
  await expect(page.locator('.chat-welcome')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `.local/screenshots/urdu-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.goto('/app/settings');
  await page.getByLabel('Current password', { exact: true }).fill('Synthetic-test-password-123');
  await page.getByLabel('New password', { exact: true }).fill('Changed-synthetic-password-456');
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('Changed-synthetic-password-456');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('Your password has been changed.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out everywhere' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Changed-synthetic-password-456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/chat$/);
  expect(errors).toEqual([]);
});

test('administrator imports, inspects, publishes and unpublishes an explicitly synthetic source', async ({
  page,
}, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('synthetic-admin@example.org');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-admin-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s on your mind today?' })).toBeVisible();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Source studio', exact: true }).click();
  await page.getByRole('button', { name: 'Import source', exact: true }).click();
  await page.getByLabel('Source file').setInputFiles({
    name: 'synthetic.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'SYNTHETIC TEST DOCUMENT ONLY. This is not a religious ruling. It exists to verify source ingestion and approval.',
    ),
  });
  await page.getByLabel('Source title').fill(`SYNTHETIC browser ${testInfo.project.name}`);
  await page.getByLabel('Author / scholar').fill('Synthetic test author');
  await page.getByLabel('Original source URL').fill('https://example.org/synthetic-browser-source');
  await page.getByRole('checkbox', { name: /I have authorization/ }).check();
  await page.getByRole('button', { name: 'Import for review' }).click();
  await expect(
    page.getByRole('heading', { name: `SYNTHETIC browser ${testInfo.project.name}` }),
  ).toBeVisible();
  await expect(page.getByText('SYNTHETIC TEST DOCUMENT ONLY.', { exact: false })).toBeVisible();
  await page.getByRole('checkbox', { name: /I have checked/ }).check();
  await page.getByRole('button', { name: 'Approve & publish' }).click();
  await expect(page.getByRole('button', { name: 'Unpublish source' })).toBeVisible();
  await page.getByRole('button', { name: 'Unpublish source' }).click();
  await expect(page.getByRole('button', { name: 'Approve & publish' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({
    path: `.local/screenshots/admin-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('auth screens show Google availability and safe callback errors', async ({
  page,
}, testInfo) => {
  await page.goto('/login?error=access_denied');
  await expect(page.getByRole('alert')).toContainText('Google sign-in was cancelled');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await expect(page.getByText('Google sign-in will be available', { exact: false })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await mkdir('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await expect(page.getByLabel('Your age')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `.local/screenshots/register-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
