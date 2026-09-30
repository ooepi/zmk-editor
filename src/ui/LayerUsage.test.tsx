// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importKeymap } from '../core/keymap/importer.ts';
import { App } from './App.tsx';
import { LayerUsagePanel } from './components/LayerUsagePanel.tsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const usage = () => within(screen.getByRole('region', { name: 'Layer usage' }));

function keymap(layers: string[], extra = '') {
  const body = layers.map((bindings, i) => `l${i} { bindings = <${bindings}>; };`).join('\n');
  return importKeymap(`/ {\n${extra}\nkeymap { compatible = "zmk,keymap";\n${body}\n};\n};`).model;
}

describe('layer usage', () => {
  it('lists what turns each layer on, and goes to the key', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = within(usage().getByRole('listitem', { name: 'NAV' }));
    await user.click(nav.getByRole('button', { name: 'BASE key 52: while held (&mo)' }));
    const rail = within(screen.getByRole('navigation', { name: 'Layers' }));
    expect(rail.getByRole('tab', { selected: true }).textContent).toBe('0BASE');
    expect(screen.getByRole('region', { name: /^Key 52/ })).toBeTruthy();
  });

  it('says the demo keymap has no layer problems', () => {
    render(<App />);
    expect(usage().queryByRole('list', { name: 'Layer problems' })).toBeNull();
    expect(usage().getByText('No layer problems found.')).toBeTruthy();
    expect(within(usage().getByRole('listitem', { name: 'BASE' })).getByText('Always on')).toBeTruthy();
  });

  it('shows the problems, with buttons to the keys involved', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const model = keymap(['&trans &to 1 &mo 4', '&kp B &kp C &kp D', '&kp E &kp F &kp G']);
    render(<LayerUsagePanel keymap={model} dispatch={dispatch} onOpenCombo={vi.fn()} />);
    const problems = within(screen.getByRole('list', { name: 'Layer problems' }));
    const text = problems.getAllByRole('listitem').map((li) => li.textContent);
    expect(text).toEqual([
      "l0 key 2 uses layer 4, which doesn't exist.",
      'l2: nothing turns it on.',
      'l1: no way back. Once l0 key 1 turns it on, nothing on it turns it off or leads to another layer.',
      'Key 0 on l0 is transparent, with no layer below: it does nothing.',
    ]);
    await user.click(problems.getByRole('button', { name: 'Go to l0 key 1' }));
    expect(dispatch.mock.calls).toEqual([[{ type: 'selectLayer', index: 0 }], [{ type: 'selectKey', index: 1 }]]);
    expect(within(screen.getByRole('listitem', { name: 'l2' })).getByText('Nothing turns it on')).toBeTruthy();
  });

  it("does not list a layer's own off switch as a way in", () => {
    render(<App />);
    const qwer = within(usage().getByRole('listitem', { name: 'QWER' }));
    expect(qwer.getByRole('button', { name: 'PROG key 42: toggle (&tog)' })).toBeTruthy();
    expect(qwer.queryByRole('button', { name: /^QWER key/ })).toBeNull();
  });

  it('names a few transparent base keys, then counts the rest', () => {
    render(<LayerUsagePanel keymap={keymap([Array(9).fill('&trans').join(' ')])} dispatch={vi.fn()} onOpenCombo={vi.fn()} />);
    const problem = within(screen.getByRole('list', { name: 'Layer problems' })).getByRole('listitem');
    expect(within(problem).getAllByRole('button')).toHaveLength(6);
    expect(problem.textContent).toContain('and 3 more on l0 are transparent');
  });

  it('says when layer names come from outside the keymap', () => {
    const model = importKeymap(`#include "layers.h"
/ { keymap { compatible = "zmk,keymap"; l0 { bindings = <&mo NAV &kp A>; }; l1 { bindings = <&trans &trans>; }; }; };`).model;
    render(<LayerUsagePanel keymap={model} dispatch={vi.fn()} onOpenCombo={vi.fn()} />);
    expect(screen.getByRole('list', { name: 'Layer problems' }).textContent).toBe(
      "NAV is a layer name defined outside this keymap, so which layers you can reach isn't checked.",
    );
  });

  it('opens a combo that turns a layer on', async () => {
    const user = userEvent.setup();
    const onOpenCombo = vi.fn();
    const combos = `combos { compatible = "zmk,combos"; nav_combo { key-positions = <0 1>; bindings = <&tog 1>; }; };`;
    render(
      <LayerUsagePanel keymap={keymap(['&kp A &kp B', '&trans &trans'], combos)} dispatch={vi.fn()} onOpenCombo={onOpenCombo} />,
    );
    await user.click(screen.getByRole('button', { name: 'Combo nav_combo: toggle (&tog)' }));
    expect(onOpenCombo).toHaveBeenCalledWith('nav_combo');
  });
});
