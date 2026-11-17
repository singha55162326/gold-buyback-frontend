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

  test(`[state] buyback create modal open ${theme}`, async ({ page }) => {
    await open(page, theme, DESKTOP, '/valuer/buyback');
    await page.getByRole('button', { name: '+ ສ້າງລາຍການ Buyback' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check(page, 'buyback create modal');
  });

  test(`[state] buyback create modal multi-line scroll ${theme}`, async ({ page }) => {
    await open(page, theme, DESKTOP, '/valuer/buyback');
    await page.getByRole('button', { name: '+ ສ້າງລາຍການ Buyback' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const addBtn = dialog.getByRole('button', { name: 'ເພີ່ມແຖວຄຳ' });
    await addBtn.click();
    await addBtn.click();

    await expect(dialog.getByText('3 ລາຍການ · ເລື່ອນເບິ່ງໄດ້')).toBeVisible();
    await expect(dialog.locator('#buyback-step-1')).toBeInViewport();
    await expect(dialog.locator('#buyback-step-2')).toBeInViewport();

    const list = dialog.getByTestId('buyback-lines-list');
    await expect(list).toBeVisible();
    const dims = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(dims.scrollHeight).toBeGreaterThan(dims.clientHeight);
    await check(page, 'buyback create modal multi-line');
  });

  test(`[state] buyback payment lak cap and foreign change ${theme}`, async ({ page }) => {
    await open(page, theme, DESKTOP, '/valuer/buyback');
    await page.route('http://api.mock/api/buyback/preview', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          snapshotId: 'pb1',
          goldTypeCode: 'GOOD',
          kind: 'GOOD',
          shopBuybackPrice: '36200000',
          deduction: '0',
          payableAmount: '36200000',
          branch: 'ຄຳດີ — ຫານ 15 ລົງໂຕ',
          totalWeightG: '15',
          totalQuantity: 1,
          lines: [
            {
              goldTypeId: 'gt1',
              goldTypeNameLo: 'ຄຳດີ',
              goldItemId: null,
              weightG: '15',
              quantity: 1,
              goldPercent: null,
              shopBuybackPrice: '36200000',
              deduction: '0',
              payableAmount: '36200000',
              branch: 'ຄຳດີ — ຫານ 15 ລົງໂຕ',
            },
          ],
        }),
      });
    });

    await page.getByRole('button', { name: '+ ສ້າງລາຍການ Buyback' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('#line-type-0').selectOption({ index: 1 });
    await dialog.locator('#line-weight-0').fill('15');
    await expect(dialog.getByText('36,200,000 LAK').first()).toBeVisible();

    // LAK is capped at payableAmount (36,200,000)
    const payAmt = dialog.locator('#pay-amt-0');
    await expect(payAmt).toHaveAttribute('placeholder', '36,200,000');
    await payAmt.fill('40000000');
    await expect(payAmt).toHaveValue('36,200,000');

    // Switch to USD (buyback rate 22,300 in mock) -> guideline shows 1,623.32 USD (shortfall = 0)
    await payAmt.fill('');
    await dialog.locator('#pay-cur-0').selectOption('USD');
    await expect(payAmt).toHaveAttribute('placeholder', '1,623.32');
    await expect(dialog.getByText('ໃຫ້ຍອດຂາດເປັນ 0')).toBeVisible();
    await expect(dialog.getByText('≈ 1,623.32 USD')).toBeVisible();

    // THB (buyback rate 640 in mock) -> guideline shows 56,562.50 THB, allows overpay & calculates CHANGE (LAK ONLY)
    await dialog.locator('#pay-cur-0').selectOption('THB');
    await expect(payAmt).toHaveAttribute('placeholder', '56,562.50');
    await expect(dialog.getByText('≈ 56,562.50 THB')).toBeVisible();
    await payAmt.fill('60000');
    await expect(payAmt).toHaveValue('60,000');
    await expect(dialog.getByText('CHANGE (LAK ONLY)')).toBeVisible();
    await expect(dialog.getByText('ເງິນທອນ 2,200,000 LAK')).toBeVisible();
    await check(page, 'buyback payment foreign change');
  });

  test(`[state] buyback history table and filter dropdowns ${theme}`, async ({ page }) => {
    const D = '2026-11-17T09:30:00.000Z';
    const PREV_DAY = '2026-11-15T09:30:00.000Z';
    const sampleRows = [
      {
        id: 'bb1',
        code: 'BB-001',
        source: 'KPV',
        goldPercent: null,
        paidAmount: '36200000',
        outstandingAmount: '0',
        createdBy: 'ຜູ້ປະເມີນ A',
        updatedBy: 'ຜູ້ປະເມີນ A',
        payments: [
          {
            id: 'pay1',
            method: 'CASH',
            currency: 'LAK',
            amount: '36200000',
            amountLak: '36200000',
            changeLak: '0',
          },
        ],
        goldItem: { nameLo: 'ສາຍຄໍ' },
        goldType: { nameLo: 'ຄຳດີ (ສູດ A)' },
        lines: [
          {
            id: 'l1',
            weightG: '15.00',
            quantity: 1,
            goldPercent: null,
            shopBuybackPrice: '36200000',
            deduction: '0',
            payableAmount: '36200000',
            branch: '2.1 >=15g',
            goldType: { nameLo: 'ຄຳດີ (ສູດ A)' },
            goldItem: { nameLo: 'ສາຍຄໍ' },
          },
          {
            id: 'l2',
            weightG: '7.50',
            quantity: 1,
            goldPercent: null,
            shopBuybackPrice: '18100000',
            deduction: '0',
            payableAmount: '18100000',
            branch: '2.1 <15g',
            goldType: { nameLo: 'ຄຳດີ (ສູດ A)' },
            goldItem: { nameLo: 'ແຫວນ' },
          },
        ],
        status: 'PENDING',
        weightG: '22.50',
        quantity: 2,
        payableAmount: '54300000',
        createdAt: PREV_DAY,
        customer: { phone: '02055512345' },
      },
      {
        id: 'bb2',
        code: 'BB-002',
        source: 'OTHER_SHOP',
        goldPercent: '90',
        paidAmount: '20000000',
        outstandingAmount: '10000000',
        createdBy: 'ຜູ້ປະເມີນ B',
        updatedBy: 'Payment C',
        payments: [
          {
            id: 'pay2',
            method: 'BANK',
            bankAccountId: 'b1',
            bankAccount: { nameLo: 'BCEL' },
            currency: 'THB',
            amount: '31250',
            amountLak: '20000000',
            changeLak: '0',
          },
        ],
        goldItem: { nameLo: 'ແຫວນ' },
        goldType: { nameLo: 'ຄຳຕົ້ມ (ຮ້ານອື່ນ)' },
        lines: [],
        status: 'COMPLETED',
        weightG: '15.00',
        quantity: 1,
        payableAmount: '30000000',
        createdAt: D,
        customer: { phone: '02099998888' },
      },
      {
        id: 'bb3',
        code: 'BB-003',
        source: 'KPV',
        goldPercent: null,
        paidAmount: '36200000',
        outstandingAmount: '0',
        createdBy: 'ຜູ້ປະເມີນ A',
        updatedBy: 'ຜູ້ປະເມີນ A',
        payments: [
          {
            id: 'pay3',
            method: 'CASH',
            currency: 'LAK',
            amount: '36200000',
            amountLak: '36200000',
            changeLak: '0',
          },
        ],
        goldItem: { nameLo: 'ກ້ອນທອງ' },
        goldType: { nameLo: 'ຄຳແທ່ງ' },
        lines: [],
        status: 'COMPLETED',
        weightG: '15.00',
        quantity: 1,
        payableAmount: '36200000',
        createdAt: D,
        customer: { phone: '02077776666' },
      },
    ];

    const listRequests: string[] = [];
    await open(page, theme, DESKTOP, '/valuer/buyback');
    await page.route(/^http:\/\/api\.mock\/api\/buyback(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      listRequests.push(route.request().url());
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          rows: sampleRows,
          page: 1,
          pageSize: 5000,
          total: sampleRows.length,
          pageCount: 1,
          fromDate: '2026-11-17',
          toDate: '2026-11-17',
        }),
      });
    });
    await page.route('http://api.mock/api/buyback/bb1', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          ...sampleRows[0],
          audits: [
            {
              id: 'aud1',
              action: 'CREATE',
              summary: 'ສ້າງລາຍການ Buyback BB-001 — 54300000 LAK',
              createdAt: D,
              actor: { fullName: 'ຜູ້ປະເມີນ A' },
            },
            {
              id: 'aud2',
              action: 'UPDATE',
              summary: 'ແກ້ໄຂ Buyback BB-001 — 54300000 LAK',
              createdAt: '2026-11-17T09:35:00.000Z',
              actor: { fullName: 'ຜູ້ປະເມີນ A' },
            },
          ],
        }),
      });
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForAnimations(page);

    // Time filter is removed; unified OrderFilterBar is used instead
    await expect(page.locator('.filter-select-label', { hasText: 'ເວລາ' })).toHaveCount(0);
    await expect(page.getByText('BB-001')).toBeVisible();
    await expect(page.getByText('BB-002')).toBeVisible();
    await expect(page.getByText('BB-003')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ວຽກຄ້າງຂ້າມມື້ 1 ບິນ' })).toBeVisible();
    await expect(page.getByText('ຄ້າງຂ້າມມື້', { exact: true })).toBeVisible();
    await check(page, 'buyback history table rendered');

    // Quick pending filter works without sending synthetic PENDING_ACTION param to backend
    await page.getByRole('button', { name: 'ວຽກຄ້າງຂ້າມມື້ 1 ບິນ' }).click();
    await expect(page.getByText('BB-001')).toBeVisible();
    await expect(page.getByText('BB-002')).toBeVisible();
    await expect(page.getByText('BB-003')).toHaveCount(0);
    expect(listRequests.some((u) => u.includes('PENDING_ACTION'))).toBe(false);

    // Status & Source custom dropdowns work and pass a11y + contrast
    const statusTrigger = page.locator('#buyback-status-filter');
    await expect(statusTrigger).toBeVisible();
    await statusTrigger.click();
    await expect(page.getByRole('menuitemradio', { name: 'ລໍຖ້າອະນຸມັດ' })).toBeVisible();
    await check(page, 'buyback status dropdown open', { modalMenu: true });
    await page.getByRole('menuitemradio', { name: 'ລໍຖ້າອະນຸມັດ' }).click();
    await expect(page.getByText('BB-001')).toBeVisible();
    await expect(page.getByText('BB-002')).toHaveCount(0);

    const sourceTrigger = page.locator('#buyback-source-filter');
    await sourceTrigger.click();
    await expect(page.getByRole('menuitemradio', { name: 'ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ)' })).toBeVisible();
    await page.getByRole('menuitemradio', { name: 'ຄຳຮ້ານ KPV' }).click();
    await expect(page.getByText('BB-001')).toBeVisible();

    await page.getByRole('button', { name: 'ລ້າງຕົວກອງ' }).click();
    await expect(page.getByText('BB-002')).toBeVisible();

    // Open View Detail modal
    await page.getByRole('button', { name: 'View BB-001' }).click();
    const detailDialog = page.getByRole('dialog', { name: /ລາຍລະອຽດ Buyback — BB-001/ });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText('ລາຍການຄຳໃນບິນ')).toBeVisible();
    await expect(detailDialog.getByText('ປະຫວັດການດຳເນີນການ (Timeline)')).toBeVisible();
    await expect(detailDialog.getByText('1. ສ້າງລາຍການ (Pending)')).toBeVisible();
    await expect(detailDialog.getByText('2. Payment ອະນຸມັດ (Approve)')).toBeVisible();
    await expect(detailDialog.getByText('2 ເຫດການ')).toBeVisible();
    await check(page, 'buyback detail modal');
    await detailDialog.getByRole('button', { name: 'ປິດ', exact: true }).last().click();
    await expect(detailDialog).toHaveCount(0);
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
