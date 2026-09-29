import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { Menu } from '../components/ui/Menu.tsx';
import { useTheme } from '../useTheme.ts';

// The living reference for the design system: every token and shared control,
// rendered with the production classes. Open it at /#design.
// When you add a token or a control, add it here too (see docs/design-system.md).

const COLOUR_GROUPS: { title: string; tokens: string[] }[] = [
  { title: 'Surfaces', tokens: ['--bg', '--surface', '--surface-2', '--surface-3', '--border', '--border-strong'] },
  { title: 'Text', tokens: ['--text', '--text-muted', '--accent-text'] },
  { title: 'Accent and status', tokens: ['--accent', '--accent-line', '--accent-soft', '--focus-ring', '--danger', '--success', '--warning', '--info'] },
  { title: 'Key kinds', tokens: ['--key-layer', '--key-hold', '--key-macro', '--key-dim'] },
  { title: 'Behavior kinds', tokens: ['--kind-holdtap', '--kind-modmorph', '--kind-tapdance', '--kind-encoder', '--kind-macro', '--kind-module'] },
];

const FONT_SIZES = ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl'];
const RADII = ['--r-sm', '--r-md', '--r-lg', '--r-pill'];
const SPACING = ['--s-1', '--s-2', '--s-3', '--s-4', '--s-5', '--s-6', '--s-8'];

function Swatch({ token }: { token: string }) {
  return (
    <div className="ds-swatch">
      <span className="ds-swatch-colour" style={{ background: `var(${token})` }} />
      <code>{token}</code>
    </div>
  );
}

export default function DesignSystemPage() {
  const [theme, toggleTheme] = useTheme();
  return (
    <article className="design-system" aria-labelledby="ds-title">
      <header className="ds-header">
        <div>
          <h1 id="ds-title">Design system</h1>
          <p className="muted">
            Tokens live in <code>src/ui/styles/tokens.css</code>, shared controls in <code>controls.css</code>. How to extend
            them: <code>docs/design-system.md</code>.
          </p>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <section className="ds-section" aria-labelledby="ds-colours">
        <h2 id="ds-colours">Colours</h2>
        {COLOUR_GROUPS.map((group) => (
          <div key={group.title} className="ds-group">
            <h3 className="panel-title">{group.title}</h3>
            <div className="ds-swatches">
              {group.tokens.map((token) => (
                <Swatch key={token} token={token} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="ds-section" aria-labelledby="ds-type">
        <h2 id="ds-type">Type</h2>
        {FONT_SIZES.map((size) => (
          <p key={size} className="ds-type-sample" style={{ fontSize: `var(${size})` }}>
            <code>{size}</code> Plus Jakarta Sans: tap for one thing, hold for another
          </p>
        ))}
        <p className="ds-type-sample mono">
          <code>--font-mono</code> &amp;mt LSHIFT A · LC(LS(TAB))
        </p>
      </section>

      <section className="ds-section" aria-labelledby="ds-shape">
        <h2 id="ds-shape">Radius and spacing</h2>
        <div className="ds-row">
          {RADII.map((radius) => (
            <div key={radius} className="ds-radius" style={{ borderRadius: `var(${radius})` }}>
              <code>{radius}</code>
            </div>
          ))}
        </div>
        <div className="ds-spacing">
          {SPACING.map((space) => (
            <div key={space} className="ds-space">
              <span className="ds-space-bar" style={{ width: `var(${space})` }} />
              <code>{space}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section" aria-labelledby="ds-buttons">
        <h2 id="ds-buttons">Buttons</h2>
        <div className="ds-row">
          <button type="button" className="button primary">
            Primary
          </button>
          <button type="button" className="button">
            Secondary
          </button>
          <button type="button" className="button active">
            Active
          </button>
          <button type="button" className="button danger">
            Danger
          </button>
          <button type="button" className="button" disabled>
            Disabled
          </button>
          <button type="button" className="icon-button" aria-label="Icon button">
            ✕
          </button>
          <button type="button" className="link-button">
            Link button
          </button>
        </div>
      </section>

      <section className="ds-section" aria-labelledby="ds-icon-buttons">
        <h2 id="ds-icon-buttons">Icon buttons</h2>
        <p className="muted small">
          <code>IconButton</code>: round, named by its label. With <code>expand</code> the label slides out on hover or focus.
        </p>
        <div className="ds-row">
          <IconButton icon="undo" label="Undo" />
          <IconButton icon="print" label="Print keymap" expand />
          <IconButton icon="trash" label="Delete" tone="danger" />
          <IconButton icon="redo" label="Redo (disabled)" disabled />
          <IconButton icon="more" label="More actions" />
        </div>
      </section>

      <section className="ds-section" aria-labelledby="ds-menus">
        <h2 id="ds-menus">Menus</h2>
        <p className="muted small">
          <code>Menu</code>: actions behind an icon button. Arrow keys, Home and End move; Enter runs; Esc or a click outside
          closes.
        </p>
        <div className="ds-row">
          <Menu
            label="Sample menu"
            align="start"
            items={[
              { label: 'Open files', icon: 'open', onSelect: () => undefined },
              { label: 'Download .keymap', icon: 'download', onSelect: () => undefined },
              { label: 'Disabled item', icon: 'archive', onSelect: () => undefined, disabled: true },
              'separator',
              { label: 'Reset to demo', icon: 'reset', tone: 'danger', onSelect: () => undefined },
            ]}
          />
        </div>
      </section>

      <section className="ds-section" aria-labelledby="ds-fields">
        <h2 id="ds-fields">Fields</h2>
        <div className="ds-grid">
          <label className="field">
            <span className="field-label">Text input</span>
            <input className="input" placeholder="Placeholder text" />
            <span className="field-help">Help text explains what the field does.</span>
          </label>
          <label className="field">
            <span className="field-label">Select</span>
            <select className="input" defaultValue="balanced">
              <option value="balanced">balanced</option>
              <option value="tap-preferred">tap-preferred</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Invalid input</span>
            <input className="input invalid" defaultValue="bad value" />
            <span className="field-error">Use letters, digits and _.</span>
          </label>
          <div className="field checkbox">
            <input id="ds-checkbox" type="checkbox" defaultChecked />
            <span>
              <label htmlFor="ds-checkbox">Checkbox</label>
              <span className="field-help">With help text underneath.</span>
            </span>
          </div>
        </div>
        <fieldset className="fieldset">
          <legend>Fieldset</legend>
          <span className="muted">Groups related fields.</span>
        </fieldset>
      </section>

      <section className="ds-section" aria-labelledby="ds-chips">
        <h2 id="ds-chips">Chips and segments</h2>
        <div className="chips">
          <button type="button" className="chip active">
            Active chip
          </button>
          <button type="button" className="chip">
            Chip
          </button>
          <button type="button" className="chip" disabled>
            Disabled
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Segmented control">
          <button type="button" className="segment active">
            Keys
          </button>
          <button type="button" className="segment">
            Behaviors
          </button>
        </div>
      </section>

      <section className="ds-section" aria-labelledby="ds-lists">
        <h2 id="ds-lists">Lists</h2>
        <ul className="item-list ds-narrow">
          <li>
            <button type="button" className="item active">
              <span className="mono">&amp;hm</span>
              <span className="badge">Hold-tap</span>
            </button>
          </li>
          <li>
            <button type="button" className="item">
              <span className="mono">&amp;scroll_up_down</span>
              <span className="badge">Encoder</span>
            </button>
          </li>
        </ul>
      </section>

      <section className="ds-section" aria-labelledby="ds-notices">
        <h2 id="ds-notices">Notices</h2>
        <div className="notice">A notice tells you something worth knowing.</div>
        <div className="notice warn">A warning needs your attention.</div>
      </section>

      <section className="ds-section" aria-labelledby="ds-keycaps">
        <h2 id="ds-keycaps">Keycaps</h2>
        <div className="palette-tiles ds-narrow">
          {[
            ['A', 'A', 'key'],
            ['NAV', 'mo', 'layer'],
            ['A', 'Shift', 'hold-tap'],
            ['Copy', 'macro', 'macro'],
            ['▽', '', 'trans'],
          ].map(([main, sub, kind]) => (
            <span key={kind} className={`palette-tile kind-${kind}`}>
              <span className="palette-tile-main">{main}</span>
              {sub && <span className="palette-tile-sub">{sub}</span>}
            </span>
          ))}
        </div>
      </section>
    </article>
  );
}
