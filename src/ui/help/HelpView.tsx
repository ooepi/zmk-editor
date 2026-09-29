import { isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HELP_SECTIONS } from './sections/index.ts';

interface HelpViewProps {
  /** A section or subsection id to show, e.g. `palette`. */
  section: string | null;
}

// App remounts the view (keyed by `request`) for every request, which also clears the search.

const HIGHLIGHT = 'help-search';

/** How long a contents jump's smooth scroll may take before the reading marker follows the page again. */
const JUMP_SETTLE_MS = 900;

/** The words a section shows: its text and titles, for searching without rendering it. */
function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (!isValidElement<{ children?: ReactNode; title?: unknown }>(node)) return '';
  const { children, title } = node.props;
  return `${typeof title === 'string' ? title : ''} ${nodeText(children)}`;
}

const SEARCH_TEXT = new Map(HELP_SECTIONS.map((s) => [s.id, `${s.title} ${nodeText(s.body)}`.toLowerCase()]));

/** Every text node under `root` containing `word`, as ranges (case-insensitive). */
function matchRanges(root: Node, words: string[]): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.toLowerCase() ?? '';
    for (const word of words) {
      for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        ranges.push(range);
      }
    }
  }
  return ranges;
}

/** The user guide: contents, search, and every section. */
export function HelpView({ section }: HelpViewProps) {
  const [query, setQuery] = useState('');
  /** The section being read, highlighted in the contents. */
  const [current, setCurrent] = useState<string | null>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  /** Set while a clicked contents link keeps its highlight, as the page scrolls there. */
  const jumping = useRef<number | null>(null);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const wordsKey = words.join(' ');

  // Sections that don't contain every word are hidden.
  const hidden = useMemo(() => {
    const searchWords = wordsKey ? wordsKey.split(' ') : [];
    return new Set(HELP_SECTIONS.filter((s) => !searchWords.every((w) => SEARCH_TEXT.get(s.id)?.includes(w))).map((s) => s.id));
  }, [wordsKey]);

  // Highlight the matches, where the browser supports CSS highlights.
  useLayoutEffect(() => {
    if (!wordsKey || typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') return;
    const searchWords = wordsKey.split(' ');
    const ranges = [...sections.current]
      .filter(([id]) => !hidden.has(id))
      .flatMap(([, element]) => matchRanges(element, searchWords));
    CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
    return () => void CSS.highlights.delete(HIGHLIGHT);
  }, [wordsKey, hidden]);

  // Open at the requested section, or at the top.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = section ? document.getElementById(`help-${section}`) : null;
      if (target) target.scrollIntoView?.({ block: 'start' });
      else document.querySelector('.help')?.scrollIntoView?.({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);

  // Follow the reading position: the first section in the top third of the screen is the current one.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace(/^help-/, '');
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // A jump's smooth scroll passes other sections, and a short last section may never reach the
        // top; the clicked link stays highlighted until the next scroll of the reader's own.
        if (jumping.current !== null) return;
        const first = HELP_SECTIONS.find((s) => visible.has(s.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: '0px 0px -65% 0px' },
    );
    for (const element of sections.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const jump = (id: string) => {
    if (jumping.current !== null) window.clearTimeout(jumping.current);
    jumping.current = window.setTimeout(() => (jumping.current = null), JUMP_SETTLE_MS);
    setCurrent(id);
    document.getElementById(`help-${id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  const shown = HELP_SECTIONS.filter((s) => !hidden.has(s.id));

  return (
    <div className="help">
      <nav className="help-toc" aria-label="Help contents">
        <input
          className="input"
          type="search"
          placeholder="Search help…"
          aria-label="Search help"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ol>
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`help-toc-link${current === s.id ? ' active' : ''}`}
                aria-current={current === s.id ? 'true' : undefined}
                onClick={() => jump(s.id)}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ol>
        <select
          className="input help-toc-select"
          aria-label="Go to section"
          value=""
          onChange={(e) => jump(e.target.value)}
        >
          <option value="" disabled>
            Go to section…
          </option>
          {shown.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </nav>
      <article className="help-content" aria-label="Help">
        <h1 className="help-title">Help</h1>
        {words.length > 0 && shown.length === 0 && <p className="muted">Nothing in the help matches “{query.trim()}”.</p>}
        {HELP_SECTIONS.map((s) => (
          <section
            key={s.id}
            id={`help-${s.id}`}
            aria-labelledby={`help-${s.id}-title`}
            hidden={hidden.has(s.id)}
            ref={(element) => {
              if (element) sections.current.set(s.id, element);
              else sections.current.delete(s.id);
            }}
          >
            <h2 id={`help-${s.id}-title`}>{s.title}</h2>
            {s.body}
          </section>
        ))}
      </article>
    </div>
  );
}
