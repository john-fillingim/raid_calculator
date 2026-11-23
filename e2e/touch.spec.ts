import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });

test('tapping an info button shows its explanation', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('html[data-calc-ready="true"]');
  await page.getByRole('button', { name: 'What is write penalty?' }).tap();
  await expect(page.getByRole('tooltip')).toContainText('Physical disk operations');
});

test('interactive controls are at least 44px on mobile', async ({ page }) => {
  await page.goto('/?level=raid50&n=7&size=4TB&g=2');
  await page.waitForSelector('html[data-calc-ready="true"]');
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const els = document.querySelectorAll<HTMLElement>(
      'main button, main [role="radio"], main [role="combobox"], main input',
    );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Hit area may be extended by a ::after overlay (data-hit marks those).
      const hit = el.dataset.hit ? Number(el.dataset.hit) : 0;
      if (Math.max(r.height, hit) < 44 || Math.max(r.width, hit) < 44) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      }
    }
    return out;
  });
  expect(small).toEqual([]);
});
