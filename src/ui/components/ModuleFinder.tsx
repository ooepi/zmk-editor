import { useState, type Dispatch, type FormEvent } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { findModule } from '../../core/catalog/modules.ts';
import { GitHubClient, GitHubError } from '../../core/github/client.ts';
import { inspectModule, searchModules, type ModuleInspection, type ModuleSearchResult } from '../../core/github/moduleSearch.ts';
import { addCustomModule, parseModuleRepo } from '../../core/modules.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { loadGitHubSettings } from '../state/github.ts';
import { loadTokens } from '../state/githubLogin.ts';
import { httpsUrl } from '../../core/url.ts';

interface ModuleFinderProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}

/** The signed-in token when there is one (higher rate limits), else anonymous. */
function savedToken(): string {
  const tokens = loadTokens();
  if (tokens && (!tokens.expiresAt || tokens.expiresAt > Date.now() + 60_000)) return tokens.accessToken;
  return loadGitHubSettings()?.token ?? '';
}

/** Runs a request with the saved token, retrying anonymously if GitHub rejects the token. */
async function withClient<T>(run: (client: GitHubClient) => Promise<T>): Promise<T> {
  const token = savedToken();
  try {
    return await run(new GitHubClient(token));
  } catch (error) {
    if (token && error instanceof GitHubError && error.status === 401) return run(new GitHubClient(''));
    throw error;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Search = { state: 'idle' } | { state: 'loading' } | { state: 'error'; error: string } | { state: 'done'; total: number; results: ModuleSearchResult[] };
type Inspect = { state: 'loading'; name: string } | { state: 'error'; name: string; error: string } | { state: 'done'; inspection: ModuleInspection };

/** Search GitHub for modules tagged `zmk-module`, or paste a repo URL, and add one to west.yml. */
export function ModuleFinder({ config, dispatch }: ModuleFinderProps) {
  const [query, setQuery] = useState('');
  const [repoText, setRepoText] = useState('');
  const [search, setSearch] = useState<Search>({ state: 'idle' });
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const installed = new Set(config.west.modules.map((m) => m.name));

  const runSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    setSearch({ state: 'loading' });
    try {
      const { total, results } = await withClient((client) => searchModules(client, query));
      setSearch({ state: 'done', total, results });
    } catch (error) {
      setSearch({ state: 'error', error: message(error) });
    }
  };

  const open = async (owner: string, repo: string) => {
    const name = `${owner}/${repo}`;
    setInspect({ state: 'loading', name });
    try {
      const inspection = await withClient((client) => inspectModule(client, owner, repo, config.west.zmkVersion));
      setInspect({ state: 'done', inspection });
    } catch (error) {
      setInspect({ state: 'error', name, error: message(error) });
    }
  };

  const openTyped = (event: FormEvent) => {
    event.preventDefault();
    const ref = parseModuleRepo(repoText);
    if (!ref) setInspect({ state: 'error', name: repoText, error: 'Enter a GitHub repository like owner/repo or its URL.' });
    else void open(ref.owner, ref.repo);
  };

  return (
    <section className="module-finder" aria-label="Find more modules">
      <h2 className="panel-title">Find more modules on GitHub</h2>
      <p className="muted small">
        Searches repositories tagged <code>zmk-module</code>. Modules are other people’s code built into your firmware:
        add only ones you trust, and check their README for setup the editor can’t do for you.
      </p>
      <form className="row wrap" onSubmit={(e) => void runSearch(e)}>
        <input
          className="input grow"
          type="search"
          placeholder="e.g. trackball, display, mouse"
          aria-label="Search GitHub for modules"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="button" disabled={search.state === 'loading'}>
          {search.state === 'loading' ? 'Searching…' : query.trim() ? 'Search' : 'Show most starred'}
        </button>
      </form>
      <form className="row wrap" onSubmit={openTyped}>
        <input
          className="input grow"
          placeholder="or paste a repository: owner/repo or https://github.com/owner/repo"
          aria-label="Module repository"
          value={repoText}
          onChange={(e) => setRepoText(e.target.value)}
        />
        <button type="submit" className="button">
          Check
        </button>
      </form>

      {inspect && (
        <ModuleDetails
          inspect={inspect}
          installed={inspect.state === 'done' && installed.has(inspect.inspection.repo)}
          onClose={() => setInspect(null)}
          onAdd={(inspection, includes) => {
            try {
              const next = addCustomModule(config, {
                owner: inspection.owner,
                repo: inspection.repo,
                ...(inspection.revision ? { revision: inspection.revision } : {}),
                includes,
              });
              dispatch({ type: 'editConfig', config: next, notice: `Added ${inspection.repo} to west.yml.` });
              setInspect(null);
            } catch (error) {
              setInspect({ state: 'error', name: inspection.repo, error: message(error) });
            }
          }}
        />
      )}

      {search.state === 'error' && (
        <p className="notice warn" role="alert">
          {search.error}
        </p>
      )}
      {search.state === 'done' && (
        <>
          <p className="muted small">
            {search.total === 0
              ? 'No modules found.'
              : `${search.total} module${search.total === 1 ? '' : 's'} found${search.total > search.results.length ? `; showing the ${search.results.length} most starred` : ''}.`}
          </p>
          <ul className="finder-results" aria-label="Module search results">
            {search.results.map((r) => {
              const inCatalog = findModule(r.repo);
              return (
                <li key={`${r.owner}/${r.repo}`} className="finder-result">
                  <div className="grow">
                    <a className="mono" href={httpsUrl(r.url)} target="_blank" rel="noreferrer">
                      {r.owner}/{r.repo}
                    </a>{' '}
                    <span className="muted small">
                      ★ {r.stars} · updated {r.pushedAt.slice(0, 10)}
                    </span>
                    {r.archived && <span className="badge">archived</span>}
                    {r.description && <p className="small">{r.description}</p>}
                  </div>
                  {installed.has(r.repo) ? (
                    <span className="badge">Installed</span>
                  ) : inCatalog ? (
                    <span className="badge">In the catalog above</span>
                  ) : (
                    <button type="button" className="button" onClick={() => void open(r.owner, r.repo)}>
                      Details
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

interface ModuleDetailsProps {
  inspect: Inspect;
  installed: boolean;
  onClose: () => void;
  onAdd: (inspection: ModuleInspection, includes: string[]) => void;
}

function ModuleDetails({ inspect, installed, onClose, onAdd }: ModuleDetailsProps) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const close = (
    <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>
      ✕
    </button>
  );
  if (inspect.state === 'loading') {
    return (
      <div className="module-card finder-details" role="status">
        <div className="row">
          <span className="grow">Checking {inspect.name}…</span>
          {close}
        </div>
      </div>
    );
  }
  if (inspect.state === 'error') {
    return (
      <div className="notice warn finder-details" role="alert">
        <div className="row">
          <span className="grow">
            {inspect.name}: {inspect.error}
          </span>
          {close}
        </div>
      </div>
    );
  }
  const m = inspect.inspection;
  const includes = m.includes.filter((i) => !skipped.has(i));
  return (
    <article className="module-card finder-details" aria-label={`${m.owner}/${m.repo}`}>
      <header className="module-head">
        <div>
          <h3>{m.repo}</h3>
          <a className="mono small" href={httpsUrl(m.url)} target="_blank" rel="noreferrer">
            {m.owner}/{m.repo}
          </a>
        </div>
        {close}
      </header>
      {m.description && <p className="small">{m.description}</p>}
      {!m.isModule && (
        <p className="notice warn small">This repository has no zephyr/module.yml, so it doesn’t look like a ZMK module.</p>
      )}
      <p className={m.untagged ? 'notice warn small' : 'muted small'}>{m.revisionNote}</p>
      {m.includes.length > 0 && (
        <div className="module-settings">
          <span className="field-label">Add these headers to the keymap</span>
          {m.includes.map((path) => (
            <label key={path} className="check">
              <input
                type="checkbox"
                checked={!skipped.has(path)}
                onChange={(e) => {
                  const next = new Set(skipped);
                  if (e.target.checked) next.delete(path);
                  else next.add(path);
                  setSkipped(next);
                }}
              />
              <code>#include &lt;{path}&gt;</code>
            </label>
          ))}
        </div>
      )}
      {m.compatibles.length > 0 && (
        <p className="muted small">
          Behaviors it implements: {m.compatibles.join(', ')}. If its README defines them in the keymap, add them on the
          Behaviors tab.
        </p>
      )}
      {m.shields.length > 0 && (
        <p className="muted small">
          Shields it provides: {m.shields.join(', ')}. Add the one you need to your builds in build.yaml.
        </p>
      )}
      <div className="row wrap">
        <button type="button" className="button primary" disabled={installed} onClick={() => onAdd(m, includes)}>
          {installed ? 'Already in west.yml' : 'Add to west.yml'}
        </button>
        <a className="button" href={httpsUrl(m.url)} target="_blank" rel="noreferrer">
          Read its README
        </a>
      </div>
    </article>
  );
}
