import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSession } from './fixtures/session';
import { mockApi } from './fixtures/api-mock';

declare global {
  interface Window {
    __faded: Element[];
  }
}

/** Records every element that receives a Web Animation, so late mounts can be asserted. */
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    window.__faded = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      window.__faded.push(this);
      return orig.apply(this, args);
    };
  });
}

/** True once the element matched by `selector` (first match) has received an animation. */
const wasAnimated = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && window.__faded.includes(el);
  }, selector);

test.use({ viewport: { width: 1440, height: 900 } });

test('[fade] late-mounting readiness panel fades in on a hard load', async ({ page }) => {
  await recordAnimations(page);
  await mockApi(page);
  await seedSession(page, 'dark', true);
  await page.goto('/dashboard');
  const panel = page.locator('main section.card[data-fade]', { hasText: 'ຄວາມພ້ອມຂອງລະບົບ' });
  await expect(panel).toBeVisible();
  await expect.poll(() => wasAnimated(page, 'main section.card[data-fade]')).toBe(true);
  // The panel mounts after its query resolves, so the first animated batch cannot include it.
  const animatedCount = await page.evaluate(() => window.__faded.length);
  expect(animatedCount).toBeGreaterThan(1);
  // Chrome fades once and is not re-animated.
  const headerRuns = await page.evaluate(
    () => window.__faded.filter((e) => e.matches('header.shell-header')).length,
  );
  expect(headerRuns).toBe(1);
});

test('[fade] soft navigation animates the new page', async ({ page }) => {
  await recordAnimations(page);
  await mockApi(page);
  await seedSession(page, 'dark', true);
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    window.__faded.length = 0;
  });

  await page.locator('a[href="/admin/products"]').first().click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.locator('main h1')).toBeVisible();
  await expect.poll(() => wasAnimated(page, 'main [data-fade]')).toBe(true);
  const cards = await page.evaluate(
    () => Array.from(document.querySelectorAll('main [data-fade]')).filter((e) => window.__faded.includes(e)).length,
  );
  expect(cards, 'every data-fade block in main animated').toBe(
    await page.locator('main [data-fade]').count(),
  );
  const chrome = await page.evaluate(() => window.__faded.filter((e) => !e.closest('main')).length);
  expect(chrome, 'sidebar/header do not re-fade on navigation').toBe(0);
});

test('[fade] reduced motion: soft navigation creates no animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(page);
  await mockApi(page);
  await seedSession(page, 'dark', true);
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.locator('a[href="/admin/products"]').first().click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.locator('main h1')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__faded.length)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
