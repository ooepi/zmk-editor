import { useMemo, useState, type Dispatch } from 'react';
import { configPaths, generateConfig, importConfig, type ZmkConfig } from '../../core/config.ts';
import {
  ArtifactDownloadError,
  downloadFirmware,
  findLatestRun,
  waitForRun,
  type WorkflowRun,
} from '../../core/github/builds.ts';
import { diffStats, lineDiff } from '../../core/github/diff.ts';
import { extractUf2, type FirmwareFile } from '../../core/github/firmware.ts';
import { commitFiles } from '../../core/github/repo.ts';
import { handEditedShieldFiles } from '../../core/hardware/generate.ts';
import { validateHardware } from '../../core/hardware/validate.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { clearGitHubSettings } from '../state/github.ts';
import { clearTokens } from '../state/githubLogin.ts';
import { ConnectSection, type Connection } from './ConnectSection.tsx';
import { DiffView } from './DiffView.tsx';
import { HardwareIssueList } from './HardwareIssueList.tsx';

interface BuildViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}


type BuildState =
  | { phase: 'idle' }
  | { phase: 'committing' }
  | { phase: 'waiting'; sha: string; run: WorkflowRun | null }
  | { phase: 'downloading'; run: WorkflowRun }
  | { phase: 'done'; run: WorkflowRun; firmware: FirmwareFile[] }
  | { phase: 'failed'; message: string; run?: WorkflowRun }
  | { phase: 'blocked'; run: WorkflowRun; message: string };


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
  // Bumped on every explicit connect, so a hand-edit confirmation never carries over from a
  // previous connection to the same repo (e.g. Disconnect then reconnect, with nothing changed).
  const [connectionSeq, setConnectionSeq] = useState(0);
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
  const handEdited = useMemo(
    () => (connection ? handEditedShieldFiles(connection.files, config.keyboard).filter((path) => changes.some(([p]) => p === path)) : []),
    [connection, config.keyboard, changes],
  );
  const hardwareErrors = useMemo(() => (config.hardware ? validateHardware(config.hardware).filter((i) => i.level === 'error') : []), [config.hardware]);
  const handEditKey = connection
    ? `${connectionSeq}:${connection.ref.owner}/${connection.ref.repo}@${connection.headSha}:${handEdited.join('|')}`
    : '';
  const [confirmedHandEdits, setConfirmedHandEdits] = useState<string | null>(null);
  const replaceHandEdits = handEdited.length > 0 && confirmedHandEdits === handEditKey;
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
          setConnectionSeq((n) => n + 1);
          setBuild({ phase: 'idle' });
        }}
        onDisconnect={() => {
          clearGitHubSettings();
          clearTokens();
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
          {handEdited.length > 0 && (
            <div className="field">
              <p className="field-error">
                {handEdited.join(', ')} {handEdited.length === 1 ? 'was' : 'were'} changed outside the editor. Committing replaces{' '}
                {handEdited.length === 1 ? 'it' : 'them'} with the editor’s version.
              </p>
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={replaceHandEdits}
                  onChange={(e) => setConfirmedHandEdits(e.target.checked ? handEditKey : null)}
                />
                <span>Replace my changes to the shield files</span>
              </label>
            </div>
          )}
          {hardwareErrors.length > 0 && (
            <div className="field">
              <p className="field-error">Fix the keyboard’s hardware (Keyboard ▸ Edit hardware) before committing:</p>
              <HardwareIssueList issues={hardwareErrors} />
            </div>
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
              disabled={
                busy || changes.length === 0 || !commitMessage.trim() || (handEdited.length > 0 && !replaceHandEdits) || hardwareErrors.length > 0
              }
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
