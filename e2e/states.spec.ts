import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedSession, type Theme } from './fixtures/session';
import { waitForAnimations } from './fixtures/animations';
import { findLowContrast } from './fixtures/contrast';
import { mockApi } from './fixtures/api-mock';

/**
 * Interactive/transient states that the per-route sweep never opens: each one is put on screen,
 * then checked with axe (wcag2a/aa) and the contrast guard (4.5:1 estimate, see fixtures/contrast.ts).
 */
const THEMES: Theme[] = ['dark', 'light'];
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

/**
 * `modalMenu`: Radix's modal DropdownMenu marks the rest of the app aria-hidden while it is open
 * but leaves its focusable elements tabbable, which axe reports as `aria-hidden-focus`. Focus is
 * trapped in the menu (and Esc closes it), so that rule is a known false positive for this state only.
 */
async function check(page: Page, what: string, { modalMenu = false } = {}) {
  await waitForAnimations(page);
  // Let Radix/CSS enter transitions settle (they are CSS transitions, not Web Animations).
  await page.waitForTimeout(350);
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  if (modalMenu) builder.disableRules(['aria-hidden-focus']);
  const axe = await builder.analyze();
  const summary = axe.violations
    .map((v) => `${v.id} x${v.nodes.length} [${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}]`)
    .join('\n');
  expect.soft(axe.violations.length, `${what}: axe violations\n${summary}`).toBe(0);
  const low = await findLowContrast(page, ['body']);
  expect.soft(low.length, `${what}: low-contrast text (${low.length}): ${low.slice(0, 6).join(' | ')}`).toBe(0);
}

async function open(page: Page, theme: Theme, viewport: { width: number; height: number }, path: string) {
  await page.setViewportSize(viewport);
  await mockApi(page);
  await seedSession(page, theme, true);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await waitForAnimations(page);
}

for (const theme of THEMES) {
  test(`[state] mobile drawer open ${theme}`, async ({ page }) => {
    await open(page, theme, MOBILE, '/dashboard');
    await page.getByRole('button', { name: 'ເປີດເມນູ', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ປິດເມນູ' })).toBeVisible();
    await expect(page.locator('nav').first()).toBeVisible();
    await check(page, 'drawer');
  });

  for (const [name, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
    test(`[state] user menu open ${theme} ${name}`, async ({ page }) => {
      await open(page, theme, vp, '/dashboard');
      await page.getByRole('button', { name: 'ເມນູຜູ້ໃຊ້' }).click();
      await expect(page.getByRole('menuitem', { name: 'ອອກຈາກລະບົບ' })).toBeVisible();
      await check(page, 'user menu', { modalMenu: true });
    });

    test(`[state] notification bell open ${theme} ${name}`, async ({ page }) => {
      await open(page, theme, vp, '/dashboard');
      await page.getByRole('button', { name: 'ການແຈ້ງເຕືອນ' }).click();
      await expect(page.getByText('ມີລາຍການລໍຖ້າອະນຸມັດ')).toBeVisible();
      await check(page, 'bell panel');
    });
  }

  test(`[state] stock movement dialog open ${theme}`, async ({ page }) => {
    await open(page, theme, DESKTOP, '/stock/new');
    await page.getByRole('button', { name: 'IN', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check(page, 'stock movement dialog');
  });

  test(`[state] transaction error notice ${theme}`, async ({ page }) => {
    await open(page, theme, DESKTOP, '/payment/wallet');
    // Registered after mockApi, so it wins for this one POST; everything else falls through.
    await page.route('http://api.mock/api/cash/requests', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 400,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ message: 'ຍອດເງິນບໍ່ພຽງພໍ ສຳລັບການເບີກ' }),
      });
    });
    await page.locator('#lak').fill('1000');
    await page.getByRole('button', { name: /ສົ່ງຄຳຮ້ອງ/ }).click();
    const notice = page.locator('#wallet-error');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText('ຍອດເງິນບໍ່ພຽງພໍ ສຳລັບການເບີກ');
    await expect(notice).toHaveClass(/notice/);
    await check(page, 'wallet error notice');
  });

  test(`[state] login error ${theme}`, async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mockApi(page);
    await seedSession(page, theme, false);
    // 400 (not 401): a 401 on /login would be rewritten by the api client to its own message.
    await page.route('http://api.mock/api/auth/login', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 400,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ message: 'ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ' }),
      });
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('wrong');
    await page.locator('form button[type="submit"]').click();
    const err = page.locator('#login-error');
    await expect(err).toBeVisible();
    await expect(err).toHaveClass(/notice/);
    await expect(err).toHaveClass(/status-danger/);
    await expect(err).toHaveText('ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
    await check(page, 'login error');
  });
}

test('[state] checkbox label targets are at least 42px tall', async ({ page }) => {
  await open(page, 'dark', DESKTOP, '/admin/users');
  const heights = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[type="checkbox"]')).map(
      (c) => (c.closest('label') ?? c).getBoundingClientRect().height,
    ),
  );
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(42);
});

test.describe('[theme] persistence', () => {
  test.use({ colorScheme: 'light', viewport: DESKTOP });

  test('first visit follows prefers-color-scheme; toggle persists across reload', async ({ page }) => {
    await mockApi(page);
    // Session only: no `kpv.theme`, so the pre-paint script must fall back to the OS preference.
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('kpv.accessToken')) {
          localStorage.setItem('kpv.accessToken', 'e2e-token');
          localStorage.setItem(
            'kpv.user',
            JSON.stringify({ id: 'u1', username: 'admin', fullName: 'ທົດສອບ ລະບົບ', role: 'ADMIN' }),
          );
        }
      } catch {
        /* storage unavailable */
      }
    });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => localStorage.getItem('kpv.theme'))).toBeNull();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'ສະຫຼັບຮູບແບບສີ' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('kpv.theme'))).toBe('dark');

    await page.reload();
    await page.waitForLoadState('networkidle');
    // The OS still says light; the stored choice wins.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Icon is correct from CSS alone: dark theme shows the sun group, hides the moon path.
    const icons = await page.evaluate(() => ({
      sun: getComputedStyle(document.querySelector('.theme-icon-dark')!).display,
      moon: getComputedStyle(document.querySelector('.theme-icon-light')!).display,
    }));
    expect(icons.sun).not.toBe('none');
    expect(icons.moon).toBe('none');
  });
});
