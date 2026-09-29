// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { HELP_SECTIONS } from './help/sections/index.ts';

const scrolled = vi.fn<(this: Element) => void>();

beforeEach(() => {
  localStorage.clear();
  scrolled.mockClear();
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.call(this);
  };
});
afterEach(cleanup);

const help = () => within(screen.getByRole('article', { name: 'Help' }));
const toc = () => within(screen.getByRole('navigation', { name: 'Help contents' }));
const lastScrolledId = () => (scrolled.mock.contexts.at(-1) as Element | undefined)?.id;

describe('help', () => {
  it('opens from the Help tab with every section in the contents', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open help' }));
    expect(toc().getAllByRole('button').map((b) => b.textContent)).toEqual(HELP_SECTIONS.map((s) => s.title));
    expect(help().getByRole('heading', { level: 2, name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(help().getByRole('cell', { name: 'Ctrl+V' })).toBeTruthy();
  });

  it('describes the layer rail and the More menu as they are', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open help' }));
    const text = help().getByRole('heading', { level: 2, name: 'Layers' }).closest('section')?.textContent ?? '';
    expect(text).toMatch(/Alt\+↑/);
    expect(text).not.toMatch(/tabs above the keyboard|deletes the shown layer/);
    expect(help().getAllByText(/More menu/).length).toBeGreaterThan(0);
    expect(help().getByRole('cell', { name: 'Alt+↑ or Alt+↓ on a layer' })).toBeTruthy();
  });

  it('opens from the ? button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open help' }));
    expect(help().getByRole('heading', { level: 1, name: 'Help' })).toBeTruthy();
  });

  it('filters sections with the search box', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open help' }));
    await user.type(toc().getByRole('searchbox', { name: 'Search help' }), 'home row');
    const titles = toc()
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(titles).toEqual(['Behaviors']);
    expect(help().queryByRole('heading', { level: 2, name: 'Editing keys' })).toBeNull();

    await user.clear(toc().getByRole('searchbox', { name: 'Search help' }));
    await user.type(toc().getByRole('searchbox', { name: 'Search help' }), 'qwxzv');
    expect(help().getByText(/Nothing in the help matches/)).toBeTruthy();
  });

  it('opens at the right section from a Learn more link, and again from links inside Help', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'All shortcuts' }));
    await waitFor(() => expect(lastScrolledId()).toBe('help-shortcuts'));

    await user.click(help().getByRole('button', { name: 'Copy and paste' }));
    await waitFor(() => expect(lastScrolledId()).toBe('help-clipboard'));
  });

  it('links to Help from the other views', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Combos/ }));
    await user.click(screen.getByRole('button', { name: 'Learn more' }));
    await waitFor(() => expect(lastScrolledId()).toBe('help-combos'));

    await user.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Learn more' }));
    await waitFor(() => expect(lastScrolledId()).toBe('help-settings'));
  });
});
