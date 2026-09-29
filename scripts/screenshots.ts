// Captures the README screenshots from a production build of the app.
//
//   npm run screenshots
//
// First time only: `npx playwright install chromium` downloads the headless browser.
// Each shot starts from a fresh browser (the Lily58 demo, dark theme) and is saved
// to docs/images/.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';

const OUT = join(import.meta.dirname, '..', 'docs', 'images');
const VIEWPORT = { width: 1400, height: 860 };

const shots: { name: string; setup: (page: Page) => Promise<void> }[] = [
  {
    name: 'keymap',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Key 25: A' }).click();
    },
  },
  {
    name: 'multi-select',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Key 52: NAV (mo)' }).click();
      for (const key of ['Key 53: MOUS (mo)', 'Key 54: Space', 'Key 55: PROG (mo)']) {
        await page.getByRole('button', { name: key }).click({ modifiers: ['Control'] });
      }
      await page.getByRole('region', { name: 'Key palette' }).getByRole('button', { name: 'Behaviors' }).click();
    },
  },
  {
    name: 'behaviors',
    setup: async (page) => {
      await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: /^Behaviors/ }).click();
      // The demo has only encoder behaviors; a new hold-tap has more to show.
      await page.getByRole('button', { name: 'New behavior' }).click();
      await page.getByRole('button', { name: '+ Hold-tap' }).click();
    },
  },
  {
    name: 'designer',
    setup: async (page) => {
      await page.getByRole('button', { name: /▾$/ }).click();
      await page.getByRole('button', { name: 'Open layout designer' }).click();
    },
  },
  {
    name: 'help',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Open help' }).click();
    },
  },
];

const server = await preview({ logLevel: 'warn', preview: { port: 4174, strictPort: true } });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('The preview server has no local URL');
const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });

try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'dark', locale: 'en-US' });
    await page.goto(url);
    await page.getByRole('group', { name: 'Keyboard layout' }).waitFor();
    await shot.setup(page);
    // Let transitions settle and the pointer leave nothing hovered.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const path = join(OUT, `${shot.name}.png`);
    await page.screenshot({ path });
    console.log(`Saved ${path}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
