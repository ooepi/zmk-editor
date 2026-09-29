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
  /** Stop waiting (e.g. the user disconnected): the wait rejects with `BuildWaitCancelled`. */
  isCancelled?: () => boolean;
}

/** Thrown when a wait is called off; not an error to show. */
export class BuildWaitCancelled extends Error {
  constructor() {
    super('Stopped following the build.');
    this.name = 'BuildWaitCancelled';
  }
}

/** Polls until the build for `sha` completes. */
export async function waitForRun(client: GitHubClient, ref: RepoRef, sha: string, options: WaitOptions = {}): Promise<WorkflowRun> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const start = now();
  for (;;) {
    if (options.isCancelled?.()) throw new BuildWaitCancelled();
    const run = await findRunForCommit(client, ref, sha);
    if (options.isCancelled?.()) throw new BuildWaitCancelled();
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

/** One half (or board) whose build failed, and what can be said about why. */
export interface FailedJob {
  /** e.g. "Build ZMK firmware (lily58_left)" */
  name: string;
  /** The step that failed, e.g. "West Build (lily58_left)". */
  step: string | null;
  /** The job's log on GitHub. */
  url: string;
  /** A plain-language guess at the cause, when the step or the errors point to one. */
  hint: string | null;
  /** The lines of the log that say what went wrong; empty when the log couldn't be read. */
  lines: string[];
}

const LOG_ERROR = /\berror\b|\bFATAL\b|undefined reference|not found|No such file|devicetree/i;
const LOG_NOISE = /-Werror|--error|error-format|ignore-error|^\s*\d+ errors? generated/i;

/** The lines of a job log that say what went wrong: GitHub's timestamps and colour codes removed, at most `max`. */
export function errorLines(log: string, max = 12): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of log.split(/\r?\n/)) {
    const line = raw
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '')
      .replace(/^##\[(error|warning)\]/, '')
      .trim();
    if (!line || !LOG_ERROR.test(line) || LOG_NOISE.test(line) || seen.has(line)) continue;
    seen.add(line);
    lines.push(line.length > 240 ? `${line.slice(0, 240)}…` : line);
    if (lines.length >= max) break;
  }
  return lines;
}

/** A guess at the cause from the failed step and the error lines, for people who don't read build logs. */
export function failureHint(step: string | null, lines: string[]): string | null {
  const text = lines.join('\n');
  if (/undefined reference to `?(zmk_behavior|behavior_)/i.test(text) || /behavior.*not (found|defined)/i.test(text)) {
    return 'A key uses a behavior that isn’t in the firmware: its module or setting may be off (Modules, Settings).';
  }
  if (/devicetree error|undefined node label|DT_N_|\.dtsi?:\d+/i.test(text)) {
    return 'ZMK couldn’t read the keymap or the keyboard’s hardware description (devicetree). A key or setting may refer to something this keyboard doesn’t have.';
  }
  if (/Kconfig|CONFIG_[A-Z0-9_]+/.test(text)) {
    return 'A setting in the .conf isn’t known to this ZMK version, or needs hardware the keyboard doesn’t have (Settings).';
  }
  if (step && /west update/i.test(step)) return 'A module or ZMK version in west.yml couldn’t be downloaded (Modules, ZMK version).';
  if (step && /(fetch build|build matrix)/i.test(step)) return 'build.yaml couldn’t be read, so GitHub didn’t know what to build.';
  if (step && /west build/i.test(step)) return 'ZMK couldn’t compile this config. The lines below say where.';
  return null;
}

/**
 * Why a run failed: its failed jobs, each with the failed step, a hint and the error lines of its
 * log. The log is best effort: without it (the browser may not be allowed to read it) the job and
 * step are still named. Never throws.
 */
export async function buildFailure(client: GitHubClient, ref: RepoRef, runId: number): Promise<FailedJob[]> {
  let jobs: { id: number; name: string; conclusion: string | null; html_url: string; steps?: { name: string; conclusion: string | null }[] }[];
  try {
    jobs = (await client.request<{ jobs: typeof jobs }>(`${repoPath(ref)}/actions/runs/${runId}/jobs?per_page=50&filter=latest`)).jobs;
  } catch {
    return [];
  }
  const failed = jobs.filter((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out').slice(0, 4);
  return Promise.all(
    failed.map(async (job) => {
      const step = job.steps?.find((s) => s.conclusion === 'failure')?.name ?? null;
      let lines: string[] = [];
      try {
        const bytes = await client.download(`https://api.github.com${repoPath(ref)}/actions/jobs/${job.id}/logs`);
        lines = errorLines(new TextDecoder().decode(bytes));
      } catch {
        // No log for us: the job and step names still help.
      }
      return { name: job.name.replace(/^build \/ /i, ''), step, url: job.html_url, hint: failureHint(step, lines), lines };
    }),
  );
}
