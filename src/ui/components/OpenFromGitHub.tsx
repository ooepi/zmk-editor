import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GitHubClient } from '../../core/github/client.ts';
import { openPublicRepo, parseRepoInput, type PublicRepo } from '../../core/github/publicRepo.ts';
import { IconButton } from './ui/IconButton.tsx';

interface OpenFromGitHubProps {
  disabled?: boolean | undefined;
  title?: string | undefined;
  /** Called with the repo's config files; the caller asks before replacing anything. */
  onOpened: (repo: PublicRepo) => void;
}

/** "Open from GitHub": reads a public zmk-config repo without logging in. */
export function OpenFromGitHub({ disabled, title, onOpened }: OpenFromGitHubProps) {
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };
  const anchor = useRef<HTMLSpanElement>(null);

  // A press anywhere else closes it, so it and the More menu are never open together.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) {
        setOpen(false);
        setError(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRepoInput(repo);
    if (!parsed) {
      setError('Enter a repository like owner/zmk-config, or its GitHub link.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await openPublicRepo(new GitHubClient(''), { ...parsed, ...(branch.trim() ? { branch: branch.trim() } : {}) });
      close();
      onOpened(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span
      className="popover-anchor"
      ref={anchor}
      onBlur={(e) => {
        // Tabbing out (e.g. to the More menu) closes it too, not only a press elsewhere.
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) close();
      }}
    >
      <IconButton
        icon="github"
        label="Open from GitHub"
        expand
        disabled={disabled}
        aria-expanded={open}
        title={title ?? 'Open a public zmk-config repository without logging in'}
        onClick={() => (open ? close() : setOpen(true))}
      />
      {open && (
        <form
          className="popover"
          role="dialog"
          aria-label="Open from GitHub"
          onSubmit={(e) => void submit(e)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <p className="muted small">
            Open a public zmk-config repository, no login needed. To commit changes, connect to your own repository on the
            Build &amp; flash tab.
          </p>
          <label className="field">
            <span className="field-label">Repository</span>
            <input
              className="input mono"
              value={repo}
              placeholder="owner/zmk-config or a GitHub link"
              autoFocus
              spellCheck={false}
              onChange={(e) => setRepo(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Branch</span>
            <input
              className="input mono"
              value={branch}
              placeholder="default branch"
              spellCheck={false}
              onChange={(e) => setBranch(e.target.value)}
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" className="button primary" disabled={busy || !repo.trim()}>
              {busy ? 'Opening…' : 'Open'}
            </button>
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </span>
  );
}
