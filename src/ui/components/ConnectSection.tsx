import { useEffect, useState } from 'react';
import { GitHubClient, type RepoRef } from '../../core/github/client.ts';
import { ensureFresh, getUser, listAppRepos, listBranches, type AuthConfig, type Tokens, type UserRepo } from '../../core/github/oauth.ts';
import { loadRepoFiles } from '../../core/github/repo.ts';
import { loadGitHubSettings, saveGitHubSettings } from '../state/github.ts';
import { authConfig, beginLogin, clearTokens, completeLogin, isLoginCallback, loadTokens, saveTokens } from '../state/githubLogin.ts';

export interface Connection {
  client: GitHubClient;
  ref: RepoRef;
  repoUrl: string;
  /** The branch's config files when last loaded. */
  files: Record<string, string>;
  headSha: string;
}

const isConfigFile = (path: string) =>
  /^config\/[^/]+\.(keymap|conf)$/.test(path) ||
  path.startsWith('config/boards/shields/') ||
  ['config/west.yml', 'config/info.json', 'build.yaml', '.github/workflows/build.yml'].includes(path);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Opens a repo branch: checks access and reads the config files. */
async function openRepo(client: GitHubClient, owner: string, repo: string, branch: string): Promise<Connection> {
  const info = await client.getRepo({ owner, repo });
  const ref = { owner, repo, branch: branch || info.default_branch };
  const { files, headSha } = await loadRepoFiles(client, ref, isConfigFile);
  return { client, ref, repoUrl: info.html_url, files, headSha };
}

interface ConnectSectionProps {
  connection: Connection | null;
  onConnected: (connection: Connection) => void;
  onDisconnect: () => void;
  onLoad: () => void;
}

export function ConnectSection({ connection, onConnected, onDisconnect, onLoad }: ConnectSectionProps) {
  const config = authConfig();

  if (connection) {
    return (
      <section className="build-section" aria-label="Repository">
        <h2 className="panel-title">Repository</h2>
        <p>
          Connected to{' '}
          <a href={connection.repoUrl} target="_blank" rel="noreferrer" className="mono">
            {connection.ref.owner}/{connection.ref.repo}
          </a>{' '}
          on <span className="mono">{connection.ref.branch}</span> at <span className="mono">{connection.headSha.slice(0, 7)}</span>.
        </p>
        <div className="row wrap">
          <button type="button" className="button" onClick={onLoad}>
            Load config from repo
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              const { client, ref } = connection;
              void openRepo(client, ref.owner, ref.repo, ref.branch).then(onConnected, (e: unknown) => window.alert(message(e)));
            }}
          >
            Refresh
          </button>
          <button type="button" className="button danger" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="build-section" aria-label="Connect to GitHub">
      <h2 className="panel-title">Connect to GitHub</h2>
      <p className="muted small">The editor commits to your zmk-config repository and GitHub Actions builds the firmware.</p>
      {config ? (
        <>
          <LoginPanel config={config} onConnected={onConnected} />
          <details className="token-details">
            <summary>Use a token instead</summary>
            <TokenForm onConnected={onConnected} />
          </details>
        </>
      ) : (
        <TokenForm onConnected={onConnected} />
      )}
    </section>
  );
}

type LoginState =
  | { phase: 'out' }
  | { phase: 'working'; note: string }
  | { phase: 'in'; tokens: Tokens; user: { login: string; avatar_url: string }; repos: UserRepo[] }
  | { phase: 'error'; message: string };

function LoginPanel({ config, onConnected }: { config: AuthConfig; onConnected: (connection: Connection) => void }) {
  const [state, setState] = useState<LoginState>(() =>
    isLoginCallback() || loadTokens() ? { phase: 'working', note: 'Logging in…' } : { phase: 'out' },
  );
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (!isLoginCallback() && !loadTokens()) return;
    let cancelled = false;
    const run = async () => {
      const fromCallback = await completeLogin(config);
      const stored = fromCallback ?? loadTokens();
      if (!stored) return { phase: 'out' } as const;
      const tokens = await ensureFresh(config, stored);
      if (tokens !== stored) saveTokens(tokens);
      const client = new GitHubClient(tokens.accessToken);
      const [user, repos] = await Promise.all([getUser(client), listAppRepos(client)]);
      return { phase: 'in', tokens, user, repos } as const;
    };
    run().then(
      (next) => !cancelled && setState(next),
      (error: unknown) => {
        clearTokens();
        if (!cancelled) setState({ phase: 'error', message: message(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [config]);

  const installUrl = `https://github.com/apps/${config.appSlug}/installations/new`;

  if (state.phase === 'working') return <p role="status">{state.note}</p>;

  if (state.phase === 'in') {
    return (
      <RepoPicker
        user={state.user}
        repos={state.repos}
        installUrl={installUrl}
        tokens={state.tokens}
        config={config}
        onConnected={onConnected}
        onLogout={() => {
          clearTokens();
          setState({ phase: 'out' });
        }}
      />
    );
  }

  return (
    <div className="login">
      <button
        type="button"
        className="button primary login-button"
        onClick={() => {
          setState({ phase: 'working', note: 'Opening GitHub…' });
          void beginLogin(config, remember);
        }}
      >
        Log in with GitHub
      </button>
      <label className="field checkbox">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Stay logged in on this device</span>
      </label>
      <p className="muted small">
        GitHub asks which repositories the editor may use. It can read and commit files and follow builds there,
        nothing else. You can change or revoke this any time in your GitHub settings.
      </p>
      {state.phase === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

function RepoPicker({
  user,
  repos,
  installUrl,
  tokens,
  config,
  onConnected,
  onLogout,
}: {
  user: { login: string; avatar_url: string };
  repos: UserRepo[];
  installUrl: string;
  tokens: Tokens;
  config: AuthConfig;
  onConnected: (connection: Connection) => void;
  onLogout: () => void;
}) {
  const stored = loadGitHubSettings();
  const initial = repos.find((r) => stored && r.owner === stored.owner && r.repo === stored.repo) ?? repos[0];
  const [selected, setSelected] = useState(initial ? `${initial.owner}/${initial.repo}` : '');
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState(stored?.branch ?? '');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const repo = repos.find((r) => `${r.owner}/${r.repo}` === selected);

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    listBranches(new GitHubClient(tokens.accessToken), repo.owner, repo.repo).then(
      (names) => {
        if (cancelled) return;
        setBranches(names);
        setBranch((current) => (names.includes(current) ? current : repo.defaultBranch));
      },
      () => !cancelled && setBranches([repo.defaultBranch]),
    );
    return () => {
      cancelled = true;
    };
  }, [repo, tokens]);

  const open = async () => {
    if (!repo) return;
    setWorking(true);
    setError(null);
    try {
      const fresh = await ensureFresh(config, tokens);
      if (fresh !== tokens) saveTokens(fresh);
      const connection = await openRepo(new GitHubClient(fresh.accessToken), repo.owner, repo.repo, branch);
      saveGitHubSettings({ token: '', owner: repo.owner, repo: repo.repo, branch: connection.ref.branch }, true);
      onConnected(connection);
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="repo-picker">
      <div className="row wrap user-row">
        <img className="avatar" src={user.avatar_url} alt="" width={28} height={28} />
        <span>
          Logged in as <strong>{user.login}</strong>
        </span>
        <button type="button" className="button" onClick={onLogout}>
          Log out
        </button>
      </div>
      {repos.length === 0 ? (
        <p>
          The editor can’t see any repositories yet.{' '}
          <a href={installUrl} target="_blank" rel="noreferrer">
            Choose repositories on GitHub
          </a>
          , then reload this page.
        </p>
      ) : (
        <>
          <div className="connect-form">
            <label className="field">
              <span className="field-label">Repository</span>
              <select className="input mono" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {repos.map((r) => (
                  <option key={`${r.owner}/${r.repo}`} value={`${r.owner}/${r.repo}`}>
                    {r.owner}/{r.repo}
                    {r.private ? ' (private)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Branch</span>
              <select className="input mono" value={branch} disabled={!branches} onChange={(e) => setBranch(e.target.value)}>
                {(branches ?? [branch]).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row wrap">
            <button type="button" className="button primary" disabled={working || !repo || !branches} onClick={() => void open()}>
              {working ? 'Opening…' : 'Open repository'}
            </button>
            <a className="small" href={installUrl} target="_blank" rel="noreferrer">
              Add or remove repositories
            </a>
          </div>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TokenForm({ onConnected }: { onConnected: (connection: Connection) => void }) {
  const stored = loadGitHubSettings();
  const [token, setToken] = useState(stored?.token ?? '');
  const [repoName, setRepoName] = useState(stored ? `${stored.owner}/${stored.repo}` : '');
  const [branch, setBranch] = useState(stored?.branch ?? '');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const connect = async () => {
    const [owner, repo] = repoName.trim().replace(/^https:\/\/github\.com\//, '').split('/');
    if (!owner || !repo) {
      setError('Enter the repository as owner/name, e.g. ooepi/zmk-lily.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const connection = await openRepo(new GitHubClient(token.trim()), owner, repo, branch.trim());
      saveGitHubSettings({ token: token.trim(), ...connection.ref }, remember);
      onConnected(connection);
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <p className="muted small">
        Create a{' '}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
          fine-grained token
        </a>{' '}
        for just that repository with <strong>Contents: read and write</strong>, <strong>Actions: read</strong> and{' '}
        <strong>Workflows: read and write</strong>. The token is sent only to api.github.com.
      </p>
      <form
        className="connect-form"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <label className="field">
          <span className="field-label">Token</span>
          <input className="input mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Repository</span>
          <input className="input mono" placeholder="owner/zmk-config" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Branch</span>
          <input className="input mono" placeholder="default branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label className="field checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember on this device</span>
        </label>
        <button type="submit" className="button primary" disabled={working || !token.trim() || !repoName.trim()}>
          {working ? 'Connecting…' : 'Connect'}
        </button>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  );
}
