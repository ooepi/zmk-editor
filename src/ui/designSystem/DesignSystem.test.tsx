// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import DesignSystemPage from './DesignSystemPage.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('design system page', () => {
  it('shows the token swatches and every base control', () => {
    render(<DesignSystemPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Design system' })).toBeTruthy();
    for (const section of ['Colours', 'Type', 'Radius and spacing', 'Buttons', 'Fields', 'Chips and segments', 'Lists', 'Notices', 'Keycaps']) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeTruthy();
    }
    expect(screen.getByText('--accent')).toBeTruthy();
  });

  it('opens from the #design address instead of the editor', async () => {
    window.location.hash = '#design';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Design system' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull();
  });
});
