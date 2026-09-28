import { SHORTCUTS } from '../../shortcuts.ts';
import { See, Ui, type HelpSection } from './common.tsx';

export const REFERENCE: HelpSection[] = [
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    body: (
      <>
        <p>Shortcuts don't fire while you're typing in a field. On a Mac, use Cmd instead of Ctrl.</p>
        <table className="help-table">
          <thead>
            <tr>
              <th scope="col">Shortcut</th>
              <th scope="col">Does</th>
              <th scope="col">Where</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{s.action}</td>
                <td>{s.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    body: (
      <dl className="help-faq">
        <dt>I made a mistake.</dt>
        <dd>
          Press Ctrl+Z, or <Ui>Undo</Ui> in the top bar. Every change can be undone, including adding modules and
          changing the ZMK version, until you reload the page.
        </dd>
        <dt>Pasting did nothing.</dt>
        <dd>
          Several copied keys paste into the same positions, so pasting them on the layer they came from changes nothing:
          switch layer first. One copied key needs keys selected to paste onto. See <See to="clipboard">Copy and paste</See>.
        </dd>
        <dt>Dropping a key on a hold-tap didn't turn it into a plain key.</dt>
        <dd>
          On purpose: a key dropped on a hold-tap only changes its tap. Change the behavior to <strong>Key press</strong>{' '}
          in the side panel first. See <See to="palette">The key palette</See>.
        </dd>
        <dt>A layer is stuck on.</dt>
        <dd>
          Keys that toggle or move to a layer (<code>&amp;tog</code>, <code>&amp;to</code>) need a way back: put a key on
          that layer that turns it off or goes to layer 0. Transparent keys on it fall through to the layers below.
        </dd>
        <dt>The build failed.</dt>
        <dd>
          Open the build on GitHub (the link on the Build &amp; flash tab) and look for the first error. Common causes: a module
          pinned to a different ZMK version (the Modules tab warns about it), settings for hardware the keyboard doesn't
          have (the Settings tab warns about it), or a hand-edited file with a typo.
        </dd>
        <dt>The build didn't start.</dt>
        <dd>
          Check that the repository has <code>.github/workflows/build.yml</code> and that Actions are enabled in its
          settings. <Ui>Download config (.zip)</Ui> contains a working workflow.
        </dd>
        <dt>My keymap looks different after the first commit.</dt>
        <dd>
          The editor writes the keymap in its own tidy format, and comments inside it aren't kept. Parts it can't edit are
          kept as written; they're listed under <strong>Import notes</strong> on the Keymap tab.
        </dd>
        <dt>Where did my work go?</dt>
        <dd>
          It's saved in this browser only, until you commit it. Another browser or a cleared browser won't have it. See{' '}
          <See to="saving">What is saved where</See>.
        </dd>
      </dl>
    ),
  },
];
