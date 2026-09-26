// Spike: can a browser page on another origin download a GitHub Actions artifact?
// Run in CI with GITHUB_TOKEN, GITHUB_REPOSITORY and ARTIFACT_RUN_ID set.
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const page = `<!doctype html><script>
window.runSpike = async (token, repo, runId) => {
  const api = 'https://api.github.com';
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const list = await fetch(api + '/repos/' + repo + '/actions/runs/' + runId + '/artifacts', { headers });
  const artifacts = (await list.json()).artifacts;
  if (!artifacts?.length) return { step: 'list', status: list.status, error: 'no artifacts' };
  try {
    const zip = await fetch(artifacts[0].archive_download_url, { headers });
    const bytes = (await zip.arrayBuffer()).byteLength;
    return { step: 'download', ok: zip.ok, status: zip.status, bytes, url: zip.url.split('?')[0] };
  } catch (error) {
    return { step: 'download', ok: false, error: String(error) };
  }
};
</script>`;

const server = createServer((_, res) => res.end(page)).listen(8080);
const browser = await chromium.launch();
const tab = await browser.newPage();
tab.on('console', (m) => console.log('[browser]', m.text()));
await tab.goto('http://localhost:8080/');
const result = await tab.evaluate(
  ([token, repo, runId]) => window.runSpike(token, repo, runId),
  [process.env.GITHUB_TOKEN, process.env.GITHUB_REPOSITORY, process.env.ARTIFACT_RUN_ID],
);
console.log('RESULT', JSON.stringify(result));
await browser.close();
server.close();
