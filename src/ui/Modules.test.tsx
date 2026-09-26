// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('module catalog', () => {
  it('filters the catalog by category and text', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    await user.click(screen.getByRole('button', { name: 'LEDs' }));
    expect(screen.getByRole('article', { name: 'RGB LED battery & connection widget' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Leader key' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter modules' }), 'swapper');
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Tri-state (swapper)']);
  });

  it('swaps the nice!view shield when adding nice!view Gem', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    const card = screen.getByRole('article', { name: 'nice!view Gem' });
    await user.click(within(card).getByRole('button', { name: 'Add' }));
    const targets = within(screen.getByRole('article', { name: 'nice!view Gem' })).getAllByRole('checkbox');
    expect(targets.map((t) => (t as HTMLInputElement).checked)).toEqual([true, true]);
    await user.click(targets[1] as HTMLElement);
    expect(within(screen.getByRole('article', { name: 'nice!view Gem' })).getAllByRole('checkbox').map((t) => (t as HTMLInputElement).checked)).toEqual([
      true,
      false,
    ]);
  });

  it('adds a leader key from the example and edits its sequences', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    await user.click(within(screen.getByRole('article', { name: 'Leader key' })).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: '+ Leader key' }));
    expect(screen.getByRole('status').textContent).toMatch(/Added &leader/);

    await user.click(screen.getByRole('button', { name: 'Behaviors (3)' }));
    await user.click(screen.getByRole('button', { name: /&leader/ }));
    const sequences = screen.getAllByRole('textbox', { name: 'Type after the leader key' });
    expect(sequences.map((s) => (s as HTMLInputElement).value)).toEqual(['U S B', 'B L E', 'B O O T', 'R E S E T']);
    await user.clear(sequences[2] as HTMLElement);
    await user.type(sequences[2] as HTMLElement, 'F W{Enter}');
    expect((screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement).value).toContain('sequence = <F W>;');

    const source = screen.getByRole('textbox', { name: 'Source' });
    await user.clear(source);
    await user.type(source, 'oops');
    await user.click(screen.getByRole('button', { name: 'Apply source' }));
    expect(screen.getByRole('alert').textContent).toMatch(/one node|behavior/);
  });
});

describe('finding modules on GitHub', () => {
  it('searches, inspects and adds a module to west.yml', async () => {
    const routes: Record<string, unknown> = {
      '/search/repositories': {
        total_count: 1,
        items: [
          {
            name: 'zmk-behavior-insomnia',
            owner: { login: 'badjeff' },
            description: 'Keeps the board awake',
            stargazers_count: 12,
            html_url: 'https://github.com/badjeff/zmk-behavior-insomnia',
            pushed_at: '2026-03-08T00:00:00Z',
            archived: false,
          },
        ],
      },
      '/repos/badjeff/zmk-behavior-insomnia': {
        name: 'zmk-behavior-insomnia',
        owner: { login: 'badjeff' },
        default_branch: 'main',
        html_url: 'https://github.com/badjeff/zmk-behavior-insomnia',
        description: 'Keeps the board awake',
      },
      '/repos/badjeff/zmk-behavior-insomnia/tags': [],
      '/repos/badjeff/zmk-behavior-insomnia/git/trees/main': {
        tree: [
          { path: 'zephyr/module.yml', type: 'blob' },
          { path: 'dts/behaviors/insomnia.dtsi', type: 'blob' },
        ],
      },
    };
    vi.stubGlobal('fetch', (input: string) => {
      const body = routes[new URL(input).pathname];
      return Promise.resolve(new Response(JSON.stringify(body ?? { message: 'Not Found' }), { status: body ? 200 : 404 }));
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search GitHub for modules' }), 'insomnia');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const results = await screen.findByRole('list', { name: 'Module search results' });
    await user.click(within(results).getByRole('button', { name: 'Details' }));

    const details = await screen.findByRole('article', { name: 'badjeff/zmk-behavior-insomnia' });
    expect(within(details).getByText(/No release tag for ZMK v0\.3/)).toBeTruthy();
    expect((within(details).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    await user.click(within(details).getByRole('button', { name: 'Add to west.yml' }));

    expect(screen.getByRole('status').textContent).toMatch(/Added zmk-behavior-insomnia/);
    expect(screen.getByRole('link', { name: 'zmk-behavior-insomnia' })).toBeTruthy();
    expect(screen.getByText(/at main/)).toBeTruthy();
  });
});
