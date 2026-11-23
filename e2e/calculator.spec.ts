import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function ready(page: Page, path = '/') {
  await page.goto(path);
  await page.waitForSelector('html[data-calc-ready="true"]');
}

const results = (page: Page) => page.getByTestId('results');

test('shared URL restores the exact configuration', async ({ page }) => {
  await ready(page, '/?level=raid60&n=12&size=8TB&g=2');
  await expect(page.getByRole('combobox', { name: /RAID level: RAID 60/ })).toBeVisible();
  await expect(page.getByLabel('Drives', { exact: true })).toHaveValue('12');
  await expect(results(page)).toContainText('64');
  await expect(page.locator('.sr-only[aria-live]').first()).toContainText('64 TB usable');
});

test('editing inputs updates results and the URL', async ({ page }) => {
  await ready(page, '/?level=raid6&n=8&size=4TB');
  await expect(page.locator('.sr-only[aria-live]').first()).toContainText(
    '24 TB usable (21.83 TiB)',
  );
  await page.getByRole('button', { name: 'Increase' }).first().click();
  await expect(page).toHaveURL(/n=9/);
  await expect(page.locator('.sr-only[aria-live]').first()).toContainText('28 TB usable');
  const drives = page.getByLabel('Drives', { exact: true });
  await drives.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(drives).toHaveValue('19');
});

test('level picker selects a level', async ({ page }) => {
  await ready(page);
  await page.getByRole('combobox', { name: /RAID level/ }).click();
  await page.getByRole('option', { name: /RAID 10/ }).click();
  await expect(page).toHaveURL(/level=raid10/);
  await expect(page.getByRole('combobox', { name: /RAID level: RAID 10/ })).toBeVisible();
});

test('invalid config shows a message and a one-click fix', async ({ page }) => {
  await ready(page, '/?level=raid10&n=5&size=2TB');
  const notice = page.getByTestId('validation');
  await expect(notice).toContainText('RAID 10 needs an even number of drives.');
  await notice.getByRole('button', { name: 'Make it 6 drives' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page).toHaveURL(/n=6/);
});

test('RAID 10 survival depends on which drive fails', async ({ page }) => {
  await ready(page, '/?level=raid10&n=6&size=2TB');
  const state = page.getByTestId('array-state');
  await expect(state).toHaveAttribute('data-state', 'optimal');
  await page.getByTestId('drive-0').click();
  await expect(state).toHaveAttribute('data-state', 'degraded');
  await page.getByTestId('drive-2').click();
  await expect(state).toHaveAttribute('data-state', 'degraded');
  await page.getByTestId('drive-1').click();
  await expect(state).toHaveAttribute('data-state', 'failed');
  await expect(page.getByTestId('drive-1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(state).toHaveAttribute('data-state', 'optimal');
});

test('failure simulator works from the keyboard', async ({ page }) => {
  await ready(page, '/?level=raid5&n=4&size=4TB');
  await page.getByTestId('drive-1').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('array-state')).toHaveAttribute('data-state', 'degraded');
  await page.getByTestId('drive-2').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('array-state')).toHaveAttribute('data-state', 'failed');
});

test('units toggle persists across reloads', async ({ page }) => {
  await ready(page, '/?level=raid6&n=8&size=4TB');
  await page.getByRole('radio', { name: 'TiB' }).first().click();
  await expect(page.locator('.sr-only[aria-live]').first()).toContainText('21.83 TiB usable');
  await page.reload();
  await page.waitForSelector('html[data-calc-ready="true"]');
  await expect(page.locator('.sr-only[aria-live]').first()).toContainText('21.83 TiB usable');
});

test('tooltip explains jargon', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'What is write penalty?' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Physical disk operations');
});

test('copy link copies the current URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page, '/?level=raid6&n=8&size=4TB');
  await page.getByTestId('copy-link').click();
  await expect(page.getByTestId('copy-link')).toContainText('Copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('level=raid6&n=8&size=4TB');
});

test('extreme config renders: 200 drives, 30 TB, RAID 60', async ({ page }) => {
  await ready(page, '/?level=raid60&n=200&size=30TB&g=10');
  await expect(page.locator('.sr-only[aria-live]').first()).toContainText('5.4 PB usable');
  await expect(page.getByTestId('drive-199')).toBeAttached();
  // The page itself must not scroll horizontally; only the diagram does.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

for (const theme of ['light', 'dark'] as const) {
  test(`no axe violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await ready(page, '/?level=raid10&n=6&size=2TB&hs=1');
    await page.getByTestId('drive-0').click();
    await page.getByTestId('drive-1').click();
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(
      res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
    ).toEqual([]);
  });

  test(`invalid state has no axe violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await ready(page, '/?level=raid50&n=7&size=2TB&g=2');
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(
      res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
    ).toEqual([]);
  });
}

test('mobile: no horizontal page overflow and sticky result bar', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await ready(page, '/?level=raid6&n=24&size=20TB');
  await expect(page.getByTestId('mobile-bar')).toBeVisible();
  await expect(page.getByTestId('mobile-bar')).toContainText('440 TB');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await context.close();
});
