import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedSession } from './fixtures/session';
import { waitForAnimations } from './fixtures/animations';
import { mockApi } from './fixtures/api-mock';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

test.describe('Stock (OLD) — Tasks 1-3', () => {
  test('dashboard 3-decimal GOLD OLD & per-type rates, Stock OUT AP roundup without decimals, and history time filter', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);

    const historyRequests: string[] = [];

    await page.route('**/api/catalog/gold-types**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'gt1', code: 'GOOD', nameLo: 'ຄຳດີ', isStockType: true },
          { id: 'gt2', code: 'BOILED', nameLo: 'ຄຳຕົ້ມ', isStockType: true },
        ]),
      });
    });

    await page.route('**/api/catalog/partners**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'p-fac', code: 'FACTORY', nameLo: 'FACTORY', direction: 'BOTH', type: 'FACTORY', tracksGoldApAr: true },
          { id: 'p-smith', code: 'OUTSOURCE_SMITH', nameLo: 'ຊ່າງນອກ', direction: 'BOTH', type: 'SMITH', tracksGoldApAr: true },
          { id: 'p-other', code: 'OTHER', nameLo: 'ອື່ນໆ', direction: 'BOTH', type: 'INTERNAL', tracksGoldApAr: true },
        ]),
      });
    });

    await page.route('**/api/stock/old/balances**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'ob1',
            goldTypeId: 'gt1',
            openingWeightG: '50.000',
            openingCost: '120000000',
            inG: '70.500',
            outG: '0',
            priceIn: '169200000',
            priceOut: '0',
            closingWeightG: '120.500',
            closingCost: '289200000',
            goldType: { id: 'gt1', nameLo: 'ຄຳດີ' },
          },
          {
            id: 'ob2',
            goldTypeId: 'gt2',
            openingWeightG: '29.750',
            openingCost: '60800000',
            inG: '0',
            outG: '0',
            priceIn: '0',
            priceOut: '0',
            closingWeightG: '29.750',
            closingCost: '60800000',
            goldType: { id: 'gt2', nameLo: 'ຄຳຕົ້ມ' },
          },
        ]),
      });
    });

    await page.route('**/api/stock/old/history**', async (route) => {
      const url = new URL(route.request().url());
      historyRequests.push(url.search);
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            {
              id: 'ol1',
              movementId: 'm1',
              goldTypeId: 'gt1',
              businessDate: '2026-11-16',
              createdAt: '2026-11-16T09:30:00+07:00',
              partnerLabel: 'Cashier',
              typeLabel: 'IN — IN-001',
              goldInG: '70.500',
              goldOutG: '0',
              weightG: '120.500',
              priceIn: '169200000',
              priceOut: '0',
              cost: '289200000',
              goldType: { id: 'gt1', nameLo: 'ຄຳດີ' },
              createdBy: 'admin',
            },
          ],
          page: 1,
          pageSize: 5000,
          total: 1,
          pageCount: 1,
          fromDate: '2026-11-16',
          toDate: '2026-11-16',
        }),
      });
    });

    await seedSession(page, 'dark', true);
    await page.goto('/stock/old');
    await page.waitForLoadState('networkidle');
    await waitForAnimations(page);

    // Task 1: Dashboard removes ປະເພດຄຳ, shows GOLD (g) OLD to 3 decimals (150.250), and shows per-type ລາຄາ/g & ລາຄາ/ບາດ
    await expect(page.getByText('ທີ່ມີຍອດໃນມື້ນີ້')).toHaveCount(0);
    await expect(page.getByText('GOLD (g) OLD')).toBeVisible();
    await expect(page.getByText('150.250', { exact: true })).toBeVisible();
    await expect(page.getByText('ຕົ້ນທຶນຄຳ OLD')).toBeVisible();
    await expect(page.getByText('350,000,000', { exact: true })).toBeVisible();

    // gt1: 289,200,000 / 120.500 = 2,400,000 LAK/g, * 15 = 36,000,000 LAK/ບາດ
    await expect(page.getByText('2,400,000').first()).toBeVisible();
    await expect(page.getByText('36,000,000').first()).toBeVisible();
    // gt2: 60,800,000 / 29.750 = 2,043,697.479... -> 2,043,697 LAK/g, * 15 = 30,655,462 LAK/ບາດ
    await expect(page.getByText('2,043,697').first()).toBeVisible();
    await expect(page.getByText('30,655,462').first()).toBeVisible();

    // TypeBalanceTable also includes ລາຄາ/g & ລາຄາ/ບາດ columns
    const balanceRegion = page.getByRole('region', { name: 'ຍອດແຍກຕາມປະເພດຄຳ' });
    await expect(balanceRegion.getByRole('columnheader', { name: 'ລາຄາ/g' })).toBeVisible();
    await expect(balanceRegion.getByRole('columnheader', { name: 'ລາຄາ/ບາດ' })).toBeVisible();

    // Task 2: Stock OUT — ສາງຄຳເກົ່າ modal: AP(GOLD) weight rounds UP in all cases with no decimals
    await page.getByRole('button', { name: 'OUT', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Both OUTSOURCE_SMITH and OTHER show %ຄຳ
    await dialog.locator('#partner').selectOption('p-other');
    await expect(dialog.locator('#pct')).toBeVisible();

    await dialog.locator('#partner').selectOption('p-smith');
    await expect(dialog.locator('#pct')).toBeVisible();

    await dialog.getByLabel('ປະເພດຄຳ').selectOption('gt1');
    await dialog.getByLabel('weight_g').fill('33');
    await dialog.locator('#pct').fill('96');
    // 33 * 0.96 = 31.68 -> rounded UP to 32 (no decimals)
    await expect(dialog.getByText('32 g', { exact: true })).toBeVisible();

    // Even < .5 fractional part rounds UP: 15 * 96.5% = 14.475 -> 15 g
    await dialog.getByLabel('weight_g').fill('15');
    await dialog.locator('#pct').fill('96.5');
    await expect(dialog.getByText('15 g', { exact: true }).last()).toBeVisible();

    // Axe accessibility check on open Stock OUT modal
    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([]);

    await dialog.getByRole('button', { name: 'ຍົກເລີກ' }).click();
    await expect(dialog).toBeHidden();

    // Task 3: Time filter in ປະຫວັດ Stock (OLD) sends start_time & end_time API params
    await page.getByRole('button', { name: /ທຸກເວລາ/ }).click();
    await page.getByRole('button', { name: 'ເຊົ້າ 08:00–12:00' }).click();
    await expect
      .poll(() =>
        historyRequests.some(
          (q) => q.includes('start_time=08%3A00') && q.includes('end_time=12%3A00'),
        ),
      )
      .toBe(true);
  });
});
