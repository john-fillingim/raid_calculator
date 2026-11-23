/**
 * Capture the calculator at 375 / 768 / 1440 px in both themes.
 * Usage: pnpm build && pnpm preview & npx tsx scripts/screenshots.ts [outDir] [path]
 */
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screenshots';
const path = process.argv[3] ?? '/';
const base = process.env.BASE_URL ?? 'http://localhost:4321';
const widths = [375, 768, 1440];
const themes = ['light', 'dark'] as const;

const browser = await chromium.launch();
for (const theme of themes) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 900 : 800 },
      colorScheme: theme,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(base + path);
    await page.waitForSelector('html[data-calc-ready="true"]', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const name = `${out}/${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${theme}-${width}`;
    await page.screenshot({ path: `${name}.png`, fullPage: true });
    await page.screenshot({ path: `${name}-fold.png` });
    await context.close();
  }
}
await browser.close();
