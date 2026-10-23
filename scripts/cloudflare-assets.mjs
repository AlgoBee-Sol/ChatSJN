// Prepare a manifest, or upload assets using a short-lived, scoped upload-session JWT.
// Upload-session files are never printed and must live under the ignored .local directory.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
const directory = '.local/cloudflare',
  root = 'apps/web/dist';
await mkdir(directory, { recursive: true, mode: 0o700 });
const manifest = {},
  files = {};
async function walk(path = '') {
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const relative = join(path, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else {
      const data = await readFile(join(root, relative));
      const hash = createHash('sha256').update(data).digest('hex').slice(0, 32);
      manifest['/' + relative] = { hash, size: data.length };
      files[hash] = relative;
    }
  }
}
await walk();
await writeFile(`${directory}/asset-manifest.json`, JSON.stringify({ manifest }), { mode: 0o600 });
if (process.argv[2] !== 'upload') {
  console.log(`Prepared ${Object.keys(manifest).length} static assets.`);
  process.exit(0);
}
const session = JSON.parse(await readFile(`${directory}/upload-session.json`, 'utf8'));
let completion = session.jwt;
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.json': 'application/json',
};
for (const bucket of session.buckets) {
  const form = new FormData();
  for (const hash of bucket) {
    if (!files[hash]) throw new Error('Asset manifest changed after upload session creation.');
    const file = files[hash],
      data = await readFile(join(root, file));
    form.append(
      hash,
      new File([data.toString('base64')], hash, {
        type: mime[extname(file)] || 'application/octet-stream',
      }),
    );
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${session.accountId}/workers/assets/upload?base64=true`,
    { method: 'POST', headers: { Authorization: `Bearer ${session.jwt}` }, body: form },
  );
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(`Asset upload failed (${response.status}): ${JSON.stringify(data.errors)}`);
  if (data.result?.jwt) completion = data.result.jwt;
  console.log(`Uploaded ${bucket.length} assets.`);
}
await writeFile(`${directory}/asset-completion.json`, JSON.stringify({ jwt: completion }), {
  mode: 0o600,
});
console.log('Asset upload complete; token saved privately.');
