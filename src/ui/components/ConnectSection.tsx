import { useEffect, useState } from 'react';
import { GitHubClient } from '../../core/github/client.ts';
import { getUser, listAppRepos, listBranches, type AuthConfig, type Tokens, type UserRepo } from '../../core/github/oauth.ts';
import { createRepo } from '../../core/github/repo.ts';
import { openRepo, type Connection } from '../state/buildSession.ts';
import { loadGitHubSettings, saveGitHubSettings } from '../state/github.ts';
import { authConfig, beginLogin, clearTokens, completeLogin, freshTokens, isLoginCallback, loadTokens } from '../state/githubLogin.ts';
import { HelpLink } from '../help/HelpLink.tsx';
import { httpsUrl } from '../../core/url.ts';
import { Section } from './ui/Section.tsx';
import { Switch } from './ui/Switch.tsx';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface ConnectSectionProps {
  connection: Connection | null;
  /** The repository used last is being reopened. */
  reconnecting: boolean;
  /** Why reopening it didn't work, if it didn't. */
  reconnectError: string | null;
  onConnected: (connection: Connection) => void;
  /** A repository was just created for this config. */
  onCreated: (connection: Connection) => void;
  onRefresh: () => void;
  /** Why the last Refresh didn't work. */
  refreshError: string | null;
  onDisconnect: () => void;
  onLoad: () => void;
}

export function ConnectSection({
  connection,
  reconnecting,
  reconnectError,
  onConnected,
  onCreated,
  onRefresh,
  refreshError,
  onDisconnect,
  onLoad,
}: ConnectSectionProps) {
  const config = authConfig();
  const saved = loadGitHubSettings();

  if (!connection && reconnecting) {
    return (
      <Section title="Repository" icon="github" description={saved ? `Reopening ${saved.owner}/${saved.repo}…` : 'Reopening…'}>
        <p role="status" className="muted small">
          Reading the branch from GitHub.
        </p>
      </Section>
    );
  }

  if (connection) {
    return (
      <Section
        title="Repository"
        icon="github"
        description={
          <>
            Connected to{' '}
            <a href={httpsUrl(connection.repoUrl)} target="_blank" rel="noreferrer" className="mono">
              {connection.ref.owner}/{connection.ref.repo}
            </a>{' '}
            on <span className="mono">{connection.ref.branch}</span>
            {connection.headSha ? (
              <>
                {' '}
                at <span className="mono">{connection.headSha.slice(0, 7)}</span>.
              </>
            ) : (
              ', which is still empty.'
            )}
          </>
        }
      >
        <div className="row wrap">
          <button type="button" className="button" onClick={onLoad}>
            Load config from repo
          </button>
          <button type="button" className="button" onClick={onRefresh}>
            Refresh
          </button>
          <button type="button" className="button danger" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
        {refreshError && (
          <p className="field-error" role="alert">
            {refreshError}
          </p>
        )}
      </Section>
    );
  }

  return (
    <Section
      title="Connect to GitHub"
      icon="github"
      description={
        <>
          The editor commits to your zmk-config repository and GitHub Actions builds the firmware. <HelpLink to="building" />
        </>
      }
    >
      {reconnectError && (
        <p className="field-error" role="alert">
          {reconnectError}
        </p>
      )}
      {config ? (
        <>
          <LoginPanel config={config} onConnected={onConnected} onCreated={onCreated} />
          <details className="token-details">
            <summary>Use a token instead</summary>
            <TokenForm onConnected={onConnected} />
          </details>
        </>
      ) : (
        <TokenForm onConnected={onConnected} />
      )}
    </Section>
  );
}

type LoginState =
  | { phase: 'out' }
  | { phase: 'working'; note: string }
  | { phase: 'in'; tokens: Tokens; user: { login: string; avatar_url: string }; repos: UserRepo[] }
  | { phase: 'error'; message: string };

function LoginPanel({
  config,
  onConnected,
  onCreated,
}: {
  config: AuthConfig;
  onConnected: (connection: Connection) => void;
  onCreated: (connection: Connection) => void;
}) {
  const [state, setState] = useState<LoginState>(() =>
    isLoginCallback() || loadTokens() ? { phase: 'working', note: 'Logging in…' } : { phase: 'out' },
  );
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (!isLoginCallback() && !loadTokens()) return;
    let cancelled = false;
    const run = async () => {
      const fromCallback = await completeLogin(config);
      if (!fromCallback && !loadTokens()) return { phase: 'out' } as const;
      const tokens = await freshTokens(config);
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
        onCreated={onCreated}
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
        GitHub asks which repositories the editor may use. It reads and commits files and follows builds there, and can
        create a new repository for your config. You can change or revoke this any time in your GitHub settings.
      </p>
      {state.phase === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

/** A free name like `zmk-config`, `zmk-config-2`… among the user's repositories. */
function freeRepoName(repos: UserRepo[], owner: string): string {
  const taken = new Set(repos.filter((r) => r.owner === owner).map((r) => r.repo.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? 'zmk-config' : `zmk-config-${n}`;
    if (!taken.has(name)) return name;
  }
}

const REPO_NAME = /^(?!\.+$)[A-Za-z0-9._-]{1,100}$/;

function RepoPicker({
  user,
  repos: initialRepos,
  installUrl,
  tokens,
  config,
  onConnected,
  onCreated,
  onLogout,
}: {
  user: { login: string; avatar_url: string };
  repos: UserRepo[];
  installUrl: string;
  tokens: Tokens;
  config: AuthConfig;
  onConnected: (connection: Connection) => void;
  onCreated: (connection: Connection) => void;
  onLogout: () => void;
}) {
  const stored = loadGitHubSettings();
  const [repos, setRepos] = useState(initialRepos);
  const initial = repos.find((r) => stored && r.owner === stored.owner && r.repo === stored.repo) ?? repos[0];
  const [selected, setSelected] = useState(initial ? `${initial.owner}/${initial.repo}` : '');
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState(stored?.branch ?? '');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<'open' | 'create' | 'list' | null>(null);
  // Someone with no repositories here yet most likely wants a new one.
  const [creating, setCreating] = useState(initialRepos.length === 0);
  const [newName, setNewName] = useState(() => freeRepoName(initialRepos, user.login));
  const [newPrivate, setNewPrivate] = useState(false);
  const repo = repos.find((r) => `${r.owner}/${r.repo}` === selected);
  const validName = REPO_NAME.test(newName.trim());

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    listBranches(new GitHubClient(tokens.accessToken), repo.owner, repo.repo).then(
      (names) => {
        if (cancelled) return;
        // An empty repository has no branches yet; its default branch appears with the first commit.
        const shown = names.length > 0 ? names : [repo.defaultBranch];
        setBranches(shown);
        setBranch((current) => (shown.includes(current) ? current : repo.defaultBranch));
      },
      () => !cancelled && setBranches([repo.defaultBranch]),
    );
    return () => {
      cancelled = true;
    };
  }, [repo, tokens]);

  const client = async () => {
    return new GitHubClient((await freshTokens(config)).accessToken);
  };

  const run = async (what: 'open' | 'create' | 'list', task: () => Promise<void>) => {
    setWorking(what);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(null);
    }
  };

  const open = () =>
    run('open', async () => {
      if (!repo) return;
      const connection = await openRepo(await client(), repo.owner, repo.repo, branch, true);
      saveGitHubSettings({ token: '', owner: repo.owner, repo: repo.repo, branch: connection.ref.branch }, true);
      onConnected(connection);
    });

  // After adding repositories on GitHub: fetch the list again instead of reloading the page.
  const refreshList = () =>
    run('list', async () => {
      const next = await listAppRepos(await client());
      setRepos(next);
      if (!next.some((r) => `${r.owner}/${r.repo}` === selected) && next[0]) setSelected(`${next[0].owner}/${next[0].repo}`);
    });

  const create = () =>
    run('create', async () => {
      const gh = await client();
      const created = await createRepo(gh, { name: newName.trim(), private: newPrivate });
      // A just-created repository can take a moment to show up in the API.
      let connection: Connection | null = null;
      for (let attempt = 0; !connection && attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        connection = await openRepo(gh, created.owner, created.repo, created.defaultBranch, true).catch(() => null);
      }
      if (!connection) {
        throw new Error(
          `GitHub created ${created.owner}/${created.repo}, but the editor can’t open it yet. If it isn’t in the list after Refresh list, add it under “Add or remove repositories”.`,
        );
      }
      saveGitHubSettings({ token: '', owner: created.owner, repo: created.repo, branch: connection.ref.branch }, true);
      onCreated(connection);
    });

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
        <p className="muted small">The editor can’t see any of your repositories yet. Create one below, or add existing ones on GitHub.</p>
      ) : (
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
      )}
      <div className="row wrap repo-picker-actions">
        {repos.length > 0 && (
          <button
            type="button"
            className={`button${creating ? '' : ' primary'}`}
            disabled={working !== null || !repo || !branches}
            onClick={() => void open()}
          >
            {working === 'open' ? 'Opening…' : 'Open repository'}
          </button>
        )}
        {!creating && (
          <button type="button" className="button" onClick={() => setCreating(true)}>
            New repository
          </button>
        )}
        <a className="small" href={installUrl} target="_blank" rel="noreferrer">
          Add or remove repositories
        </a>
        <button type="button" className="link-button small" disabled={working !== null} onClick={() => void refreshList()}>
          {working === 'list' ? 'Refreshing…' : 'Refresh list'}
        </button>
      </div>
      {creating && (
        <form
          className="new-repo"
          aria-label="New repository"
          onSubmit={(e) => {
            e.preventDefault();
            if (validName) void create();
          }}
        >
          <p className="new-repo-title">Create a new zmk-config repository</p>
          <p className="muted small">On your GitHub account, with this config committed and the first firmware build started.</p>
          <div className="new-repo-fields">
            <label className="field grow">
              <span className="field-label">Repository name</span>
              <span className="input-prefixed">
                <span className="input-prefix mono" aria-hidden="true">
                  {user.login}/
                </span>
                <input
                  className={`input mono${validName ? '' : ' invalid'}`}
                  aria-label="Repository name"
                  aria-invalid={!validName}
                  aria-describedby={validName ? undefined : 'new-repo-name-error'}
                  value={newName}
                  spellCheck={false}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </span>
            </label>
            <label className="field checkbox new-repo-private">
              <Switch checked={newPrivate} onChange={setNewPrivate} />
              <span>Private</span>
            </label>
          </div>
          {!validName && (
            <p id="new-repo-name-error" className="field-error">
              Use letters, digits, dots, dashes and underscores.
            </p>
          )}
          <div className="row wrap">
            <button type="submit" className="button primary" disabled={working !== null || !validName}>
              {working === 'create' ? 'Creating…' : 'Create and build'}
            </button>
            {repos.length > 0 && (
              <button type="button" className="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
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
      const connection = await openRepo(new GitHubClient(token.trim()), owner, repo, branch.trim(), false);
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
