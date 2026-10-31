import { pathToFileURL } from 'node:url';

export function validateRelease({ sha, comparison, deployment, status }) {
  if (!/^[a-f0-9]{40}$/.test(sha || ''))
    throw new Error('Supply a full lowercase 40-character commit SHA.');
  if (!['identical', 'behind'].includes(comparison.status))
    throw new Error('Release commit must belong to main.');
  if (deployment?.sha !== sha || deployment?.environment !== 'staging')
    throw new Error('Release must match the latest staging deployment.');
  if (status?.state !== 'success')
    throw new Error('The latest staging deployment must have passed its smoke checks.');
}

export async function verifyStagedRelease(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha || ''))
    throw new Error('Supply a full lowercase 40-character commit SHA.');
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (repository !== 'AlgoBee-Sol/ChatSJN' || !token)
    throw new Error('Run this gate in the ChatSJN GitHub Actions workflow.');
  const get = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Release verification failed: GitHub HTTP ${response.status}`);
    return response.json();
  };
  const comparison = await get(`/compare/main...${sha}`);
  const [deployment] = await get('/deployments?environment=staging&per_page=1');
  const [status] = deployment ? await get(`/deployments/${deployment.id}/statuses?per_page=1`) : [];
  validateRelease({ sha, comparison, deployment, status });
  console.log(`PASS: ${sha} is on main and is the successful current staging deployment.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await verifyStagedRelease(process.env.RELEASE_SHA);
