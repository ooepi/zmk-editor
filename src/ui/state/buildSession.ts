import { useEffect, useRef, useState } from 'react';
import {
  ArtifactDownloadError,
  BuildWaitCancelled,
  downloadFirmware,
  findLatestRun,
  waitForRun,
  type WorkflowRun,
} from '../../core/github/builds.ts';
import { GitHubClient, type RepoRef } from '../../core/github/client.ts';
import type { FirmwareFile } from '../../core/github/firmware.ts';
import { LoginError } from '../../core/github/oauth.ts';
import { commitFiles, isConfigFile, loadRepoFiles } from '../../core/github/repo.ts';
import { clearGitHubSettings, loadGitHubSettings } from './github.ts';
import { authConfig, clearTokens, freshTokens, isLoginCallback, loadTokens } from './githubLogin.ts';

export interface Connection {
  client: GitHubClient;
  ref: RepoRef;
  repoUrl: string;
  /** The branch's config files when last loaded. */
  files: Record<string, string>;
  /** Null for an empty repository (no commits yet). */
  headSha: string | null;
  /** Connected through "Log in with GitHub", whose token is refreshed before use. */
  viaLogin: boolean;
}

export type BuildState =
  | { phase: 'idle' }
  | { phase: 'committing' }
  | { phase: 'waiting'; sha: string; run: WorkflowRun | null }
  | { phase: 'downloading'; run: WorkflowRun }
  | { phase: 'done'; run: WorkflowRun; firmware: FirmwareFile[] }
  | { phase: 'failed'; message: string; run?: WorkflowRun }
  | { phase: 'blocked'; run: WorkflowRun; message: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Opens a repo branch: checks access and reads the config files. */
export async function openRepo(client: GitHubClient, owner: string, repo: string, branch: string, viaLogin: boolean): Promise<Connection> {
  const info = await client.getRepo({ owner, repo });
  const ref = { owner, repo, branch: branch || info.default_branch };
  const { files, headSha } = await loadRepoFiles(client, ref, isConfigFile);
  return { client, ref, repoUrl: info.html_url, files, headSha, viaLogin };
}

/** A client with a live token: a login's token is renewed (once, shared) before it runs out. */
async function freshClient(connection: Connection): Promise<GitHubClient> {
  const config = authConfig();
  if (!connection.viaLogin || !config) return connection.client;
  return new GitHubClient((await freshTokens(config)).accessToken);
}

/** The repository used last, and how to reach it again without asking. */
function savedRepo(): { owner: string; repo: string; branch: string; token: string; viaLogin: boolean } | null {
  if (isLoginCallback()) return null;
  const settings = loadGitHubSettings();
  if (!settings?.owner || !settings.repo) return null;
  if (settings.token) return { ...settings, viaLogin: false };
  return authConfig() && loadTokens() ? { ...settings, viaLogin: true } : null;
}

async function reconnect(saved: NonNullable<ReturnType<typeof savedRepo>>): Promise<Connection> {
  const config = authConfig();
  const token = saved.viaLogin && config ? (await freshTokens(config)).accessToken : saved.token;
  return openRepo(new GitHubClient(token), saved.owner, saved.repo, saved.branch, saved.viaLogin);
}

export type BuildSession = ReturnType<typeof useBuildSession>;

/**
 * The GitHub side of Build & flash, kept for the whole app so it survives leaving the tab:
 * the connected repository (reopened on its own when the page loads) and the build being followed.
 */
export function useBuildSession() {
  const [connection, setConnection] = useState<Connection | null>(null);
  // Bumped on every explicit connect, so a hand-edit confirmation never carries over from a
  // previous connection to the same repo (e.g. Disconnect then reconnect, with nothing changed).
  const [connectionSeq, setConnectionSeq] = useState(0);
  const [reconnecting, setReconnecting] = useState(() => savedRepo() !== null);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  /** Why the last Refresh the user asked for didn't work. */
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildState>({ phase: 'idle' });
  /** The connection as of the last render, for work started by a click. */
  const latest = useRef<Connection | null>(null);
  useEffect(() => {
    latest.current = connection;
  });
  /**
   * Bumped on every connect and disconnect. Async work notes it when it starts and drops its
   * result if it changed, so a commit or build for a repository you've left never comes back.
   */
  const generation = useRef(0);
  const current = (g: number) => generation.current === g;

  // Reopen the repository used last, quietly, as soon as the app starts.
  useEffect(() => {
    const saved = savedRepo();
    if (!saved) return;
    const g = generation.current;
    let cancelled = false;
    reconnect(saved).then(
      (conn) => {
        if (cancelled) return;
        if (current(g)) setConnection(conn);
        setReconnecting(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof LoginError) clearTokens();
        setReconnectError(`Couldn’t reopen ${saved.owner}/${saved.repo}: ${message(error)}`);
        setReconnecting(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = (conn: Connection) => {
    generation.current += 1;
    latest.current = conn;
    setConnection(conn);
    setConnectionSeq((n) => n + 1);
    setReconnecting(false);
    setReconnectError(null);
    setRefreshError(null);
    setBuild({ phase: 'idle' });
  };

  /** Leaves the repository; `why` explains it when it wasn't the user's choice. */
  const disconnect = (why?: string) => {
    generation.current += 1;
    latest.current = null;
    clearGitHubSettings();
    clearTokens();
    setConnection(null);
    setRefreshError(null);
    setReconnectError(why ?? null);
    setBuild({ phase: 'idle' });
  };

  /** An expired login can't be fixed from here: log out so the Log in button shows again. */
  const failed = (g: number, error: unknown, show: (text: string) => void) => {
    if (!current(g) || error instanceof BuildWaitCancelled) return;
    if (error instanceof LoginError) disconnect(error.message);
    else show(message(error));
  };

  /**
   * Rereads the branch, so the changes list matches GitHub. Quiet when the tab opens; when the
   * user asks (`quiet: false`), a failure is shown.
   */
  const refresh = async ({ quiet = true } = {}) => {
    const conn = latest.current;
    if (!conn) return;
    const g = generation.current;
    if (!quiet) setRefreshError(null);
    try {
      const client = await freshClient(conn);
      const next = await openRepo(client, conn.ref.owner, conn.ref.repo, conn.ref.branch, conn.viaLogin);
      if (!current(g)) return;
      // Only replace the connection it read from: a commit or reconnect in the meantime wins.
      setConnection((now) => (now === conn && next.headSha !== conn.headSha ? next : now));
    } catch (error) {
      failed(g, error, (text) => {
        if (!quiet) setRefreshError(text);
      });
    }
  };

  const fetchFirmware = async (g: number, conn: Connection, run: WorkflowRun) => {
    if (!current(g)) return;
    if (run.conclusion !== 'success') {
      setBuild({ phase: 'failed', message: `The build ${run.conclusion ?? 'did not finish'}. Open it on GitHub to see why.`, run });
      return;
    }
    setBuild({ phase: 'downloading', run });
    try {
      const firmware = await downloadFirmware(conn.client, conn.ref, run.id);
      if (current(g)) setBuild({ phase: 'done', run, firmware });
    } catch (error) {
      if (!current(g)) return;
      if (error instanceof ArtifactDownloadError) setBuild({ phase: 'blocked', run, message: error.message });
      else setBuild({ phase: 'failed', message: message(error), run });
    }
  };

  const follow = async (g: number, conn: Connection, sha: string) => {
    try {
      const run = await waitForRun(conn.client, conn.ref, sha, {
        onUpdate: (r) => current(g) && setBuild({ phase: 'waiting', sha, run: r }),
        isCancelled: () => !current(g),
      });
      await fetchFirmware(g, conn, run);
    } catch (error) {
      failed(g, error, (text) => setBuild({ phase: 'failed', message: text }));
    }
  };

  /**
   * Commits `changes` (a null text deletes the file) and follows the build it starts.
   * `generated` is every file the editor writes, which the branch holds after the commit.
   */
  const commitAndBuild = async (conn: Connection, changes: [string, string | null][], generated: Record<string, string>, commitMessage: string) => {
    const g = generation.current;
    setBuild({ phase: 'committing' });
    try {
      const client = await freshClient(conn);
      const result = await commitFiles(client, conn.ref, Object.fromEntries(changes), commitMessage);
      if (!current(g)) return;
      const deleted = new Set(changes.filter(([, text]) => text === null).map(([path]) => path));
      const files = Object.fromEntries(Object.entries({ ...conn.files, ...generated }).filter(([path]) => !deleted.has(path)));
      const next = { ...conn, client, files, headSha: result.sha };
      latest.current = next;
      setConnection(next);
      setBuild({ phase: 'waiting', sha: result.sha, run: null });
      await follow(g, next, result.sha);
    } catch (error) {
      failed(g, error, (text) => setBuild({ phase: 'failed', message: text }));
    }
  };

  const latestBuild = async () => {
    const conn = latest.current;
    if (!conn) return;
    const g = generation.current;
    try {
      const client = await freshClient(conn);
      const next = { ...conn, client };
      const run = await findLatestRun(client, conn.ref);
      if (!current(g)) return;
      if (!run) {
        setBuild({ phase: 'failed', message: 'No builds on this branch yet.' });
        return;
      }
      if (run.status === 'completed') await fetchFirmware(g, next, run);
      else {
        setBuild({ phase: 'waiting', sha: run.head_sha, run });
        await follow(g, next, run.head_sha);
      }
    } catch (error) {
      failed(g, error, (text) => setBuild({ phase: 'failed', message: text }));
    }
  };

  return {
    connection,
    connectionSeq,
    reconnecting,
    reconnectError,
    refreshError,
    build,
    setBuild,
    connect,
    disconnect,
    refresh,
    commitAndBuild,
    latestBuild,
  };
}
