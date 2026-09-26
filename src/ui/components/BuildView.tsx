import { useMemo, useState, type Dispatch } from 'react';
import { configPaths, generateConfig, importConfig, type ZmkConfig } from '../../core/config.ts';
import {
  ArtifactDownloadError,
  downloadFirmware,
  findLatestRun,
  waitForRun,
  type WorkflowRun,
} from '../../core/github/builds.ts';
import { GitHubClient, type RepoRef } from '../../core/github/client.ts';
import { diffStats, lineDiff } from '../../core/github/diff.ts';
import { extractUf2, type FirmwareFile } from '../../core/github/firmware.ts';
import { commitFiles, loadRepoFiles } from '../../core/github/repo.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { clearGitHubSettings, loadGitHubSettings, saveGitHubSettings, type GitHubSettings } from '../state/github.ts';
import { DiffView } from './DiffView.tsx';

interface BuildViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}

interface Connection {
  client: GitHubClient;
  ref: RepoRef;
  repoUrl: string;
  /** The branch's config files when last loaded. */
  files: Record<string, string>;
  headSha: string;
}

type BuildState =
  | { phase: 'idle' }
  | { phase: 'committing' }
  | { phase: 'waiting'; sha: string; run: WorkflowRun | null }
  | { phase: 'downloading'; run: WorkflowRun }
  | { phase: 'done'; run: WorkflowRun; firmware: FirmwareFile[] }
  | { phase: 'failed'; message: string; run?: WorkflowRun }
  | { phase: 'blocked'; run: WorkflowRun; message: string };

const isConfigFile = (path: string) =>
  /^config\/[^/]+\.(keymap|conf)$/.test(path) || path === 'config/west.yml' || path === 'build.yaml' || path === '.github/workflows/build.yml';

function save(data: Uint8Array | string, name: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Connect to the zmk-config repo, commit, follow the build and get the firmware. */
export function BuildView({ config, dispatch }: BuildViewProps) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [build, setBuild] = useState<BuildState>({ phase: 'idle' });
  const [commitMessage, setCommitMessage] = useState('Update keymap with ZMK Editor');

  const generated = useMemo(() => generateConfig(config), [config]);
  const changes = useMemo(
    () =>
      connection
        ? Object.entries(generated).filter(([path, text]) => connection.files[path] !== text)
        : [],
    [generated, connection],
  );
  const busy = build.phase === 'committing' || build.phase === 'waiting' || build.phase === 'downloading';

  const follow = async (conn: Connection, sha: string) => {
    try {
      const run = await waitForRun(conn.client, conn.ref, sha, { onUpdate: (r) => setBuild({ phase: 'waiting', sha, run: r }) });
      await fetchFirmware(conn, run);
    } catch (error) {
      setBuild({ phase: 'failed', message: message(error) });
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

  const commitAndBuild = async () => {
    if (!connection) return;
    setBuild({ phase: 'committing' });
    try {
      const result = await commitFiles(connection.client, connection.ref, Object.fromEntries(changes), commitMessage);
      const files = { ...connection.files, ...generated };
      const next = { ...connection, files, headSha: result.sha };
      setConnection(next);
      setBuild({ phase: 'waiting', sha: result.sha, run: null });
      await follow(next, result.sha);
    } catch (error) {
      setBuild({ phase: 'failed', message: message(error) });
    }
  };

  const latestBuild = async () => {
    if (!connection) return;
    try {
      const run = await findLatestRun(connection.client, connection.ref);
      if (!run) {
        setBuild({ phase: 'failed', message: 'No builds on this branch yet.' });
        return;
      }
      if (run.status === 'completed') await fetchFirmware(connection, run);
      else {
        setBuild({ phase: 'waiting', sha: run.head_sha, run });
        await follow(connection, run.head_sha);
      }
    } catch (error) {
      setBuild({ phase: 'failed', message: message(error) });
    }
  };

  return (
    <div className="build-view">
      <ConnectSection
        connection={connection}
        onConnected={(conn) => {
          setConnection(conn);
          setBuild({ phase: 'idle' });
        }}
        onDisconnect={() => {
          clearGitHubSettings();
          setConnection(null);
          setBuild({ phase: 'idle' });
        }}
        onLoad={() => {
          if (!connection) return;
          if (!window.confirm(`Replace the editor contents with ${connection.ref.owner}/${connection.ref.repo}?`)) return;
          try {
            const { config: next, warnings } = importConfig(connection.files);
            dispatch({ type: 'load', config: next, warnings });
          } catch (error) {
            window.alert(message(error));
          }
        }}
      />

      {connection && (
        <section className="build-section" aria-label="Changes">
          <h2 className="panel-title">Changes to commit</h2>
          {changes.length === 0 ? (
            <p className="muted">The branch already matches the editor.</p>
          ) : (
            <>
              <FirstCommitNote connection={connection} keyboard={config.keyboard} />
              <ul className="change-list">
                {changes.map(([path, text]) => (
                  <ChangedFile key={path} path={path} before={connection.files[path]} after={text} />
                ))}
              </ul>
            </>
          )}
          <div className="row wrap">
            <input
              className="input grow"
              aria-label="Commit message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />
            <button
              type="button"
              className="button primary"
              disabled={busy || changes.length === 0 || !commitMessage.trim()}
              onClick={() => void commitAndBuild()}
            >
              Commit &amp; build
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void latestBuild()}>
              Latest build
            </button>
          </div>
        </section>
      )}

      {build.phase !== 'idle' && <BuildStatus build={build} onFirmware={(run, firmware) => setBuild({ phase: 'done', run, firmware })} />}
    </div>
  );
}

function ConnectSection({
  connection,
  onConnected,
  onDisconnect,
  onLoad,
}: {
  connection: Connection | null;
  onConnected: (connection: Connection) => void;
  onDisconnect: () => void;
  onLoad: () => void;
}) {
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
      const client = new GitHubClient(token.trim());
      const info = await client.getRepo({ owner, repo });
      const ref = { owner, repo, branch: branch.trim() || info.default_branch };
      const { files, headSha } = await loadRepoFiles(client, ref, isConfigFile);
      const settings: GitHubSettings = { token: token.trim(), ...ref };
      saveGitHubSettings(settings, remember);
      setBranch(ref.branch);
      onConnected({ client, ref, repoUrl: info.html_url, files, headSha });
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  };

  if (connection) {
    return (
      <section className="build-section" aria-label="Repository">
        <h2 className="panel-title">Repository</h2>
        <p>
          Connected to{' '}
          <a href={connection.repoUrl} target="_blank" rel="noreferrer" className="mono">
            {connection.ref.owner}/{connection.ref.repo}
          </a>{' '}
          on <span className="mono">{connection.ref.branch}</span> at{' '}
          <span className="mono">{connection.headSha.slice(0, 7)}</span>.
        </p>
        <div className="row wrap">
          <button type="button" className="button" onClick={onLoad}>
            Load config from repo
          </button>
          <button type="button" className="button" onClick={() => void connect()} disabled={working}>
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
      <p className="muted small">
        The editor commits to your zmk-config repository and GitHub Actions builds the firmware. Create a{' '}
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
    </section>
  );
}

function FirstCommitNote({ connection, keyboard }: { connection: Connection; keyboard: string }) {
  const keymapPath = configPaths(keyboard).keymap;
  const otherKeymaps = Object.keys(connection.files).filter((p) => p.endsWith('.keymap') && p !== keymapPath);
  return (
    <>
      {connection.files[keymapPath] !== undefined && (
        <p className="muted small">
          Files are written in the editor’s format, so the first commit reformats them (comments inside the keymap are
          not kept). Review the changes below.
        </p>
      )}
      {otherKeymaps.length > 0 && (
        <p className="field-error">
          The repo also has {otherKeymaps.join(', ')}; the editor writes {keymapPath}. Load the config from the repo first
          if that isn’t what you want.
        </p>
      )}
    </>
  );
}

function ChangedFile({ path, before, after }: { path: string; before: string | undefined; after: string }) {
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => diffStats(lineDiff(before, after)), [before, after]);
  return (
    <li>
      <button type="button" className="item" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="mono">{path}</span>
        <span className="small">
          {before === undefined ? <span className="diff-added-text">new file</span> : null}{' '}
          <span className="diff-added-text">+{stats.added}</span> <span className="diff-removed-text">−{stats.removed}</span>
        </span>
      </button>
      {open && <DiffView before={before} after={after} />}
    </li>
  );
}

const STATUS_TEXT: Record<string, string> = {
  queued: 'Waiting for a runner…',
  in_progress: 'Building firmware…',
  completed: 'Finished',
};

function BuildStatus({ build, onFirmware }: { build: BuildState; onFirmware: (run: WorkflowRun, firmware: FirmwareFile[]) => void }) {
  const run = 'run' in build ? build.run : undefined;
  return (
    <section className="build-section" aria-label="Build">
      <h2 className="panel-title">Build</h2>
      <p role="status" className={build.phase === 'failed' || build.phase === 'blocked' ? 'field-error' : ''}>
        {build.phase === 'committing' && 'Committing…'}
        {build.phase === 'waiting' && (build.run ? STATUS_TEXT[build.run.status] ?? build.run.status : 'Waiting for the build to start…')}
        {build.phase === 'downloading' && 'Downloading firmware…'}
        {build.phase === 'done' && `Firmware ready: ${build.firmware.length} file${build.firmware.length === 1 ? '' : 's'}.`}
        {(build.phase === 'failed' || build.phase === 'blocked') && build.message}
      </p>
      {run && (
        <p className="small">
          <a href={run.html_url} target="_blank" rel="noreferrer">
            Open the build on GitHub
          </a>
        </p>
      )}
      {build.phase === 'blocked' && (
        <div className="field">
          <span className="field-help">
            Download the “firmware” artifact from the build page, then open the zip here to get the .uf2 files.
          </span>
          <input
            type="file"
            accept=".zip"
            aria-label="Open firmware zip"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onFirmware(build.run, extractUf2(new Uint8Array(await file.arrayBuffer())));
            }}
          />
        </div>
      )}
      {build.phase === 'done' && <FirmwareList firmware={build.firmware} />}
    </section>
  );
}

interface DirectoryPicker {
  showDirectoryPicker?: (options?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

function FirmwareList({ firmware }: { firmware: FirmwareFile[] }) {
  const [written, setWritten] = useState<Record<string, string>>({});
  const picker = (window as unknown as DirectoryPicker).showDirectoryPicker;

  const writeToKeyboard = async (file: FirmwareFile) => {
    if (!picker) return;
    try {
      const drive = await picker({ mode: 'readwrite' });
      const handle = await drive.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(file.data));
      await writable.close();
      setWritten((w) => ({ ...w, [file.name]: 'Written. The keyboard restarts with the new firmware.' }));
    } catch (error) {
      // The drive disconnecting as the bootloader reboots can look like a failed write.
      setWritten((w) => ({ ...w, [file.name]: `Not written: ${message(error)}` }));
    }
  };

  return (
    <>
      <ul className="firmware-list" aria-label="Firmware files">
        {firmware.map((file) => (
          <li key={file.name} className="firmware-item">
            <span className="mono">{file.name}</span>
            <span className="muted small">{Math.round(file.data.byteLength / 1024)} KB</span>
            <button type="button" className="button" onClick={() => save(file.data, file.name)}>
              Download
            </button>
            {picker && (
              <button type="button" className="button primary" onClick={() => void writeToKeyboard(file)}>
                Write to keyboard…
              </button>
            )}
            {written[file.name] && <span className="small">{written[file.name]}</span>}
          </li>
        ))}
      </ul>
      <ol className="notes">
        <li>Connect one half by USB and double-tap its reset button. A drive (e.g. NICENANO) appears.</li>
        <li>
          {picker ? 'Choose “Write to keyboard…” and pick that drive' : 'Copy the matching .uf2 onto that drive'} (left
          file for the left half).
        </li>
        <li>The half restarts with the new firmware. Repeat for the other half.</li>
      </ol>
    </>
  );
}
