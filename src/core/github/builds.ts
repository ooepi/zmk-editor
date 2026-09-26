import type { GitHubClient, RepoRef } from './client.ts';
import { extractUf2, type FirmwareFile } from './firmware.ts';

export interface WorkflowRun {
  id: number;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  path?: string;
  created_at?: string;
}

const repoPath = (ref: RepoRef) => `/repos/${ref.owner}/${ref.repo}`;

/** Prefers the ZMK build workflow when a commit triggers several. */
function pickBuild(runs: WorkflowRun[]): WorkflowRun | null {
  return runs.find((r) => r.path?.endsWith('/build.yml')) ?? runs[0] ?? null;
}

export async function findRunForCommit(client: GitHubClient, ref: RepoRef, sha: string): Promise<WorkflowRun | null> {
  const { workflow_runs } = await client.request<{ workflow_runs: WorkflowRun[] }>(
    `${repoPath(ref)}/actions/runs?head_sha=${sha}&per_page=10`,
    { what: 'the builds (does the token have Actions: read?)' },
  );
  return pickBuild(workflow_runs);
}

export async function findLatestRun(client: GitHubClient, ref: RepoRef): Promise<WorkflowRun | null> {
  const { workflow_runs } = await client.request<{ workflow_runs: WorkflowRun[] }>(
    `${repoPath(ref)}/actions/runs?branch=${encodeURIComponent(ref.branch)}&per_page=10`,
    { what: 'the builds (does the token have Actions: read?)' },
  );
  return pickBuild(workflow_runs);
}

export interface WaitOptions {
  onUpdate?: (run: WorkflowRun | null) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** How long to wait for the build to appear. */
  timeoutMs?: number;
  /** How long to wait for it to finish. */
  maxDurationMs?: number;
  intervalMs?: number;
}

/** Polls until the build for `sha` completes. */
export async function waitForRun(client: GitHubClient, ref: RepoRef, sha: string, options: WaitOptions = {}): Promise<WorkflowRun> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const start = now();
  for (;;) {
    const run = await findRunForCommit(client, ref, sha);
    options.onUpdate?.(run);
    if (run?.status === 'completed') return run;
    const elapsed = now() - start;
    if (!run && elapsed >= (options.timeoutMs ?? 3 * 60_000)) {
      throw new Error("The build didn't start. Check that the repo has .github/workflows/build.yml and Actions are enabled.");
    }
    if (elapsed >= (options.maxDurationMs ?? 45 * 60_000)) throw new Error('The build is taking unusually long; check it on GitHub.');
    await sleep(options.intervalMs ?? 10_000);
  }
}

/** The browser couldn't read the artifact (e.g. CORS); the user can download it from the run page instead. */
export class ArtifactDownloadError extends Error {
  readonly runUrl: string;
  constructor(runUrl: string, cause: unknown) {
    super(`Your browser couldn't download the firmware directly (${String(cause)}).`);
    this.name = 'ArtifactDownloadError';
    this.runUrl = runUrl;
  }
}

/** Downloads a run's artifacts and returns the `.uf2` files inside. */
export async function downloadFirmware(client: GitHubClient, ref: RepoRef, runId: number): Promise<FirmwareFile[]> {
  const run = await client.request<WorkflowRun>(`${repoPath(ref)}/actions/runs/${runId}`);
  const { artifacts } = await client.request<{ artifacts: { id: number; name: string; archive_download_url: string }[] }>(
    `${repoPath(ref)}/actions/runs/${runId}/artifacts`,
  );
  if (artifacts.length === 0) throw new Error('This build has no firmware files. Did it fail?');
  const files: FirmwareFile[] = [];
  for (const artifact of artifacts) {
    let zip: Uint8Array;
    try {
      zip = await client.download(artifact.archive_download_url);
    } catch (error) {
      if (error instanceof TypeError) throw new ArtifactDownloadError(run.html_url, error.message);
      throw error;
    }
    files.push(...extractUf2(zip));
  }
  return files;
}
