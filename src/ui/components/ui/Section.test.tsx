// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './Badge.tsx';
import { Section } from './Section.tsx';

afterEach(cleanup);

describe('Section', () => {
  it('is a region named by its title, with a heading, description and actions', () => {
    render(
      <Section title="Build" icon="rocket" description="Runs on GitHub." actions={<button type="button">Start</button>}>
        <p>Body</p>
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Build' });
    expect(within(region).getByRole('heading', { name: 'Build' })).toBeTruthy();
    expect(within(region).getByText('Runs on GitHub.')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(within(region).getByText('Body')).toBeTruthy();
  });

  it('keeps a separate region name when given one', () => {
    render(<Section title="This config" label="Current keyboard" />);
    expect(screen.getByRole('region', { name: 'Current keyboard' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'This config' })).toBeTruthy();
  });
});

describe('Badge', () => {
  it('tints by tone', () => {
    render(
      <>
        <Badge>3</Badge>
        <Badge tone="success">Done</Badge>
      </>,
    );
    expect(screen.getByText('3').className).toBe('badge');
    expect(screen.getByText('Done').className).toBe('badge tone-success');
  });
});
