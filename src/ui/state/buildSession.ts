import { useEffect, useRef, useState } from 'react';
import { ArtifactDownloadError, downloadFirmware, findLatestRun, waitForRun, type WorkflowRun } from '../../core/github/builds.ts';
import { GitHubClient, type RepoRef } from '../../core/github/client.ts';
import type { FirmwareFile } from '../../core/github/firmware.ts';
import { ensureFresh } from '../../core/github/oauth.ts';
import { commitFiles, isConfigFile, loadRepoFiles } from '../../core/github/repo.ts';
import { clearGitHubSettings, loadGitHubSettings } from './github.ts';
import { authConfig, clearTokens, isLoginCallback, loadTokens, saveTokens } from './githubLogin.ts';

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

/** A client with a live token: login tokens expire after hours and are refreshed first. */
async function freshClient(connection: Connection): Promise<GitHubClient> {
  const config = authConfig();
  const stored = loadTokens();
  if (!connection.viaLogin || !config || !stored) return connection.client;
  const tokens = await ensureFresh(config, stored);
  if (tokens !== stored) saveTokens(tokens);
  return tokens.accessToken === stored.accessToken ? connection.client : new GitHubClient(tokens.accessToken);
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
  let token = saved.token;
  if (saved.viaLogin) {
    const config = authConfig();
    const stored = loadTokens();
    if (!config || !stored) throw new Error('Not logged in.');
    const tokens = await ensureFresh(config, stored);
    if (tokens !== stored) saveTokens(tokens);
    token = tokens.accessToken;
  }
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
  const [build, setBuild] = useState<BuildState>({ phase: 'idle' });
  /** The connection as of the last render, for async work that outlives it. */
  const latest = useRef<Connection | null>(null);
  useEffect(() => {
    latest.current = connection;
  });

  // Reopen the repository used last, quietly, as soon as the app starts.
  useEffect(() => {
    const saved = savedRepo();
    if (!saved) return;
    let cancelled = false;
    reconnect(saved).then(
      (conn) => {
        if (cancelled) return;
        setConnection((current) => current ?? conn);
        setReconnecting(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        setReconnectError(`Couldn’t reopen ${saved.owner}/${saved.repo}: ${message(error)}`);
        setReconnecting(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = (conn: Connection) => {
    setConnection(conn);
    setConnectionSeq((n) => n + 1);
    setReconnectError(null);
    setBuild({ phase: 'idle' });
  };

  const disconnect = () => {
    clearGitHubSettings();
    clearTokens();
    setConnection(null);
    setBuild({ phase: 'idle' });
  };

  /** Rereads the branch, e.g. when the Build tab opens, so the changes list matches GitHub. */
  const refresh = async () => {
    const conn = latest.current;
    if (!conn) return;
    try {
      const client = await freshClient(conn);
      const next = await openRepo(client, conn.ref.owner, conn.ref.repo, conn.ref.branch, conn.viaLogin);
      // Keep the connection object when nothing changed, so nothing re-renders for it.
      if (latest.current === conn) setConnection(next.headSha === conn.headSha && client === conn.client ? conn : next);
    } catch {
      // A failed background refresh keeps what was there; the next commit reports any real problem.
    }
  };

  const fetchFirmware = async (conn: Connection, run: WorkflowRun) => {
    if (run.conclusion !== 'success') {
      setBuild({ phase: 'failed', message: `The build ${run.conclusion ?? 'did not finish'}. Open it on GitHub to see why.`, run });
      return;
    }
    setBuild({ phase: 'downloading', run });
    try {
      setBuild({ phase: 'done', run, firmware: await downloadFirmware(conn.client, conn.ref, run.id) });
    } catch (error) {
      if (error instanceof ArtifactDownloadError) setBuild({ phase: 'blocked', run, message: error.message });
      else setBuild({ phase: 'failed', message: message(error), run });
    }
  };

  const follow = async (conn: Connection, sha: string) => {
    try {
      const run = await waitForRun(conn.client, conn.ref, sha, { onUpdate: (r) => setBuild({ phase: 'waiting', sha, run: r }) });
      await fetchFirmware(conn, run);
    } catch (error) {
      setBuild({ phase: 'failed', message: message(error) });
    }
  };

  /**
   * Commits `changes` (a null text deletes the file) and follows the build it starts.
   * `generated` is every file the editor writes, which the branch holds after the commit.
   */
  const commitAndBuild = async (conn: Connection, changes: [string, string | null][], generated: Record<string, string>, commitMessage: string) => {
    setBuild({ phase: 'committing' });
    try {
      const client = await freshClient(conn);
      const result = await commitFiles(client, conn.ref, Object.fromEntries(changes), commitMessage);
      const deleted = new Set(changes.filter(([, text]) => text === null).map(([path]) => path));
      const files = Object.fromEntries(Object.entries({ ...conn.files, ...generated }).filter(([path]) => !deleted.has(path)));
      const next = { ...conn, client, files, headSha: result.sha };
      setConnection(next);
      setBuild({ phase: 'waiting', sha: result.sha, run: null });
      await follow(next, result.sha);
    } catch (error) {
      setBuild({ phase: 'failed', message: message(error) });
    }
  };

  const latestBuild = async () => {
    const conn = latest.current;
    if (!conn) return;
    try {
      const client = await freshClient(conn);
      const next = client === conn.client ? conn : { ...conn, client };
      const run = await findLatestRun(client, conn.ref);
      if (!run) {
        setBuild({ phase: 'failed', message: 'No builds on this branch yet.' });
        return;
      }
      if (run.status === 'completed') await fetchFirmware(next, run);
      else {
        setBuild({ phase: 'waiting', sha: run.head_sha, run });
        await follow(next, run.head_sha);
      }
    } catch (error) {
      setBuild({ phase: 'failed', message: message(error) });
    }
  };

  return {
    connection,
    connectionSeq,
    reconnecting,
    reconnectError,
    build,
    setBuild,
    connect,
    disconnect,
    refresh,
    commitAndBuild,
    latestBuild,
  };
}
