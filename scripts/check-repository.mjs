import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';

// A lightweight publishing guard, not a replacement for GitHub secret scanning.
// Only report paths and rule names: never print matched credential values.
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const paths = (output) => output.toString().split('\0').filter(Boolean);
const tracked = new Set(paths(git('ls-files', '--cached', '-z')));
const candidates = new Set([
  ...tracked,
  ...paths(git('ls-files', '--others', '--exclude-standard', '-z')),
]);
const issues = [];
for (const path of paths(git('ls-files', '--cached', '--ignored', '--exclude-standard', '-z')))
  issues.push(`${path}: ignored file is still tracked`);
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['OpenAI-shaped token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/],
  ['Google OAuth secret', /GOCSPX-[A-Za-z0-9_-]{12,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{24,})/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['credential-bearing MongoDB URI', /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s@]+@/],
];
function inspect(path, buffer, location) {
  if (buffer.length > 5 * 1024 * 1024)
    issues.push(`${path}: ${location} file exceeds the 5 MiB publishing limit`);
  if (buffer.includes(0)) return;
  const content = buffer.toString('utf8');
  for (const [name, pattern] of patterns)
    if (pattern.test(content)) issues.push(`${path}: possible ${name} in ${location}`);
  if (path.endsWith('.env.example')) {
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]*(?:SECRET|PASSWORD|TOKEN|API_KEY)[A-Z_]*)=(.*)$/);
      if (match && match[2].trim() && !match[2].startsWith('replace-'))
        issues.push(`${path}: ${match[1]} must be empty or a replace- placeholder in ${location}`);
    }
  }
}
for (const path of candidates) {
  if (tracked.has(path)) inspect(path, git('show', `:${path}`), 'Git index');
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    continue;
  }
  if (stat.isSymbolicLink()) {
    issues.push(`${path}: review symlink before publishing`);
    continue;
  }
  if (stat.isFile()) inspect(path, readFileSync(path), 'working tree');
}
if (issues.length) {
  console.error(
    'Repository publishing check failed:\n' +
      [...new Set(issues)].map((issue) => `- ${issue}`).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${candidates.size} publishable files checked; no ignored tracked files or recognized credential patterns.`,
  );
}
