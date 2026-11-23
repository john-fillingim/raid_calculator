import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const axe = async (page: import('@playwright/test').Page) => {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
};

test('level page has a pre-filled calculator and SEO tags', async ({ page }) => {
  await page.goto('/raid/raid-6');
  await expect(page.getByRole('heading', { level: 1, name: 'RAID 6' })).toBeVisible();
  await expect(page).toHaveTitle(/RAID 6 calculator/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /RAID 6/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og\/raid-6\.png$/,
  );
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  const calc = page.getByTestId('calculator');
  await calc.scrollIntoViewIfNeeded();
  await page.waitForSelector('html[data-calc-ready="true"]');
  await expect(calc).toContainText('24');
  await expect(page.getByRole('link', { name: 'Open in calculator' })).toHaveAttribute(
    'href',
    /level=raid6&n=8&size=4TB/,
  );
});

test('every level page and its OG image exist', async ({ request }) => {
  for (const slug of [
    'raid-0',
    'raid-1',
    'raid-1e',
    'raid-5',
    'raid-5e',
    'raid-5ee',
    'raid-6',
    'raid-10',
    'raid-50',
    'raid-60',
    'raid-z1',
    'raid-z2',
    'raid-z3',
    'jbod',
  ]) {
    expect((await request.get(`/raid/${slug}`)).status(), slug).toBe(200);
    const og = await request.get(`/og/${slug}.png`);
    expect(og.status(), slug).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
  }
});

test('robots.txt and sitemap are served', async ({ request }) => {
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
  expect((await request.get('/sitemap-index.xml')).status()).toBe(200);
});

test('compare shows selected levels side by side and syncs the URL', async ({ page }) => {
  await page.goto('/compare?levels=raid5,raid6&n=8&size=4TB');
  await page.waitForSelector('html[data-calc-ready="true"]');
  const table = page.getByTestId('compare-table');
  await expect(table.getByRole('columnheader', { name: /RAID 5/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /RAID 6/ })).toBeVisible();
  await expect(table).toContainText('28 TB');
  await expect(table).toContainText('24 TB');
  await page.getByRole('button', { name: 'RAID 10', exact: true }).click();
  await expect(page).toHaveURL(/levels=raid5,raid6,raid10/);
  await expect(table.getByRole('columnheader', { name: /RAID 10/ })).toBeVisible();
});

test('compare explains levels that are invalid for the drive count', async ({ page }) => {
  await page.goto('/compare?levels=raid6,raid10&n=7&size=4TB');
  await page.waitForSelector('html[data-calc-ready="true"]');
  await expect(page.getByTestId('compare-table')).toContainText(
    'RAID 10 needs an even number of drives.',
  );
});

for (const theme of ['light', 'dark'] as const) {
  for (const path of ['/raid/raid-10', '/raid', '/compare']) {
    test(`no axe violations on ${path} (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await axe(page)).toEqual([]);
    });
  }
}
