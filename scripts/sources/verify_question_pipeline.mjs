// Creates a disposable learner; its ID is saved for explicit cleanup after verification.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
const stage = process.argv[2] || 'after';
if (!['before', 'after'].includes(stage))
  throw new Error('Use before or after as the report label.');
const origin = 'https://sjn-ai-beta.algobee-solutions.workers.dev';
const directory = '.local/question-audit';
await mkdir(directory, { recursive: true });
const credentialPath = `${directory}/test-learner.json`;
let credentials;
try {
  credentials = JSON.parse(await readFile(credentialPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = {
    email: `source-check-${Date.now()}@example.test`,
    password: randomBytes(32).toString('base64url'),
  };
  await writeFile(credentialPath, JSON.stringify(credentials), { mode: 0o600 });
}
let cookie = '';
async function request(path, method = 'GET', body) {
  const r = await fetch(origin + path, {
    method,
    signal: AbortSignal.timeout(180000),
    headers: {
      Origin: origin,
      'X-SJN-Request': '1',
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}: ${(await r.text()).slice(0, 600)}`);
  return r;
}
const login = await request(
  credentials.userId ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email',
  'POST',
  {
    email: credentials.email,
    password: credentials.password,
    name: 'Source verification',
    age: 25,
  },
);
cookie = login.headers
  .getSetCookie()
  .map((x) => x.split(';')[0])
  .join('; ');
credentials.userId = (await login.json()).user.id;
await writeFile(credentialPath, JSON.stringify(credentials), { mode: 0o600 });
const results = [];
try {
  await request('/api/profile', 'PATCH', {
    fullName: 'Source verification',
    age: 25,
    language: 'ur',
    complete: true,
  });
  for (const [language, question, expected] of [
    [
      'ur',
      'ایران کے اندر عظیم انقلاب کے رونما ہونے کے سلسلے میں کیا راجح اور چند غیر راجح نظریات پائے جاتے ہیں؟',
      'grounded',
    ],
    [
      'en',
      'What prevalent and less prevalent theories explain the emergence of the revolution in Iran?',
      'grounded',
    ],
    [
      'roman',
      'Iran mein inqilab ke barpa hone ke mutaliq raij aur ghair raij nazriyat kya hain?',
      'grounded',
    ],
    [
      'ur',
      'ایران کے اندر عظیم انقلاب کے رونما ہونے کے سلسلے میں کیا رائج اور چند غیر رائج نظریات پائے جاتے ہیں؟',
      'grounded',
    ],
    ['ur', 'اس کے بارے میں بتائیں', 'clarification'],
    ['en', 'What do the approved sources say about the imaginary Zorblax nebula?', 'insufficient'],
    ['en', 'What is the ruling for prayer?', 'guidance'],
  ]) {
    await request('/api/profile', 'PATCH', { language });
    const conversation = (await (await request('/api/conversations', 'POST', {})).json())
      .conversation;
    const started = Date.now();
    const response = await request(`/api/conversations/${conversation._id}/messages`, 'POST', {
      question,
      requestId: randomUUID(),
    });
    const events = (await response.text())
      .trim()
      .split('\n\n')
      .filter((x) => x.startsWith('data: '))
      .map((x) => JSON.parse(x.slice(6)));
    const done = events.find((x) => x.type === 'done');
    const message = done?.message;
    const result = {
      question,
      language,
      expected,
      mode: message?.mode,
      ms: Date.now() - started,
      content: message?.content,
      citations: message?.citations,
      events: message ? undefined : events,
      checks: {
        expectedMode:
          message?.mode === expected ||
          (question.includes('راجح') && message?.mode === 'insufficient'),
        expectedArticle:
          !/انقلاب|revolution|inqilab/.test(question) ||
          (question.includes('راجح') && message?.mode === 'insufficient') ||
          message?.citations?.some((c) => c.documentId === '23e547af-3640-4143-a99b-3af5858c5bec'),
        wording: !question.includes('راجح') || message?.content?.includes('رائج'),
        languageScript: language !== 'roman' || !/\p{Script=Arabic}/u.test(message?.content || ''),
        authority: message?.citations?.every((c) => c.authority === 'JAWAD_NAQVI'),
      },
    };
    results.push(result);
    console.log(
      JSON.stringify({
        language,
        mode: result.mode,
        expected,
        ms: result.ms,
        citations: message?.citations?.length,
        errors: message ? undefined : events,
        checks: result.checks,
      }),
    );
  }
} finally {
  await writeFile(
    `${directory}/${stage}.json`,
    JSON.stringify({ userId: credentials.userId, at: new Date().toISOString(), results }, null, 2) +
      '\n',
  );
  await request('/api/auth/sign-out', 'POST', {}).catch(() => {});
}
if (
  results.length !== 7 ||
  results.some(
    (x) =>
      Object.values(x.checks).some((value) => !value) ||
      (x.mode === 'grounded' && !x.citations?.length),
  )
)
  process.exitCode = 1;
