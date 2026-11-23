/**
 * Capture the calculator in each designed state (healthy, degraded, failed, invalid, extreme)
 * in both themes. Usage, with `pnpm preview` running:
 *   pnpm exec tsx scripts/states.ts [outDir]
 */
import { chromium, type Page } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots';
const base = process.env.BASE_URL ?? 'http://localhost:4321';

type Shot = {
  name: string;
  path: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  act?: (page: Page) => Promise<void>;
};

const fail =
  (...drives: number[]) =>
  async (page: Page) => {
    for (const d of drives) await page.getByTestId(`drive-${d}`).click();
  };

const shots: Shot[] = [
  { name: 'fold-1280x800', path: '/?level=raid6&n=8&size=4TB', width: 1280, height: 800 },
  { name: 'raid10-degraded', path: '/?level=raid10&n=6&size=2TB', act: fail(0, 2) },
  { name: 'raid10-failed', path: '/?level=raid10&n=6&size=2TB', act: fail(0, 1) },
  { name: 'invalid', path: '/?level=raid50&n=7&size=4TB&g=2' },
  { name: 'extreme-200', path: '/?level=raid60&n=200&size=30TB&g=10' },
  { name: 'raid50-spares', path: '/?level=raid50&n=12&size=8TB&g=3&hs=2', act: fail(1) },
  { name: 'raid5e', path: '/?level=raid5e&n=6&size=4TB' },
  {
    name: 'mobile-failed',
    path: '/?level=raid5&n=4&size=8TB',
    width: 375,
    height: 800,
    act: fail(0, 1),
    fullPage: true,
  },
];

const browser = await chromium.launch();
for (const theme of ['light', 'dark'] as const) {
  for (const s of shots) {
    const context = await browser.newContext({
      viewport: { width: s.width ?? 1280, height: s.height ?? 800 },
      colorScheme: theme,
    });
    const page = await context.newPage();
    await page.goto(base + s.path);
    await page.waitForSelector('html[data-calc-ready="true"]');
    if (s.act) await s.act(page);
    await page.waitForTimeout(350);
    if (s.name !== 'fold-1280x800' && !s.fullPage) {
      await page.getByTestId('results').scrollIntoViewIfNeeded();
    }
    await page.screenshot({
      path: `${out}/${s.name}-${theme}.png`,
      fullPage: s.fullPage ?? s.name !== 'fold-1280x800',
    });
    await context.close();
  }
}
await browser.close();
