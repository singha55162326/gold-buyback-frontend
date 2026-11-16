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

test.describe('Stock (NEW) — Tasks 1-5', () => {
  test('dashboard stats, Ready to Gold search, SKU combobox, Stock IN labor validation, and history time filter', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page);

    const historyRequests: string[] = [];

    // Override stock/new balances & history to exercise all 5 features deterministically.
    await page.route('**/api/stock/new/balances**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'nb1',
            goldSkuId: 'sk1',
            openingQty: 5,
            inQty: 3,
            outQty: 2,
            balanceQty: 6,
            totalWeightG: '22.50',
            goldSku: { id: 'sk1', fullSkuName: 'ແຫວນ 1 ສະລຶງ', weightG: '3.75' },
          },
          {
            id: 'nb2',
            goldSkuId: 'sk2',
            openingQty: 2,
            inQty: 1,
            outQty: 0,
            balanceQty: 3,
            totalWeightG: '45.00',
            goldSku: { id: 'sk2', fullSkuName: 'ສາຍຄໍ 1 ບາດ', weightG: '15.00' },
          },
        ]),
      });
    });

    await page.route('**/api/stock/new/history**', async (route) => {
      const url = new URL(route.request().url());
      historyRequests.push(url.search);
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            {
              id: 'nl1',
              movementId: 'm1',
              businessDate: '2026-11-16',
              createdAt: '2026-11-16T09:15:00+07:00',
              partnerLabel: 'ໂຮງງານ ສົມພອນ',
              typeLabel: 'IN — IN-001',
              goldInG: '15.00',
              goldOutG: '0',
              weightG: '15.00',
              priceIn: '36000000',
              priceOut: '0',
              cost: '36000000',
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
    await page.goto('/stock/new');
    await page.waitForLoadState('networkidle');
    await waitForAnimations(page);

    // Task 1: Dashboard cards: GOLD (g) NEW, ຕົ້ນທຶນຄຳ NEW, ລາຄາ/g = 780,000,000 / 320.5 = 2,433,697, ລາຄາ/ບາດ = 36,505,460
    const statGrid = page.locator('.stat-grid');
    await expect(statGrid.locator('.card')).toHaveCount(4);
    await expect(statGrid.getByText('ຈຳນວນ SKU')).toHaveCount(0);
    await expect(statGrid.getByText('GOLD (g) NEW')).toBeVisible();
    await expect(statGrid.getByText('320.5')).toBeVisible();
    await expect(statGrid.getByText('ລາຄາ/g', { exact: true })).toBeVisible();
    await expect(statGrid.getByText('2,433,697')).toBeVisible();
    await expect(statGrid.getByText('ລາຄາ/ບາດ', { exact: true })).toBeVisible();
    await expect(statGrid.getByText('36,505,460')).toBeVisible();

    // Task 2: Ready to Gold search filter by fullSkuName and weight(g)
    const readyRegion = page.getByRole('region', { name: 'Ready to Gold' });
    await expect(readyRegion.locator('tbody tr')).toHaveCount(2);

    const readySearch = page.getByLabel('ຄົ້ນຫາ ຊື່ SKU ເຕັມ, ນ້ຳໜັກ(g)');
    await readySearch.fill('ສາຍຄໍ');
    await expect(readyRegion.locator('tbody tr')).toHaveCount(1);
    await expect(readyRegion.getByText('ສາຍຄໍ 1 ບາດ')).toBeVisible();

    await readySearch.fill('3.75');
    await expect(readyRegion.locator('tbody tr')).toHaveCount(1);
    await expect(readyRegion.getByText('ແຫວນ 1 ສະລຶງ')).toBeVisible();

    await readySearch.fill('');
    await expect(readyRegion.locator('tbody tr')).toHaveCount(2);

    // Task 3 & 4: Stock IN modal — SkuCombobox dropdown & required ຄ່າແຮງ (THB)
    await page.getByRole('button', { name: 'IN', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Select partner
    await dialog.locator('#partner').selectOption('p2');

    // Open SkuCombobox and select SKU
    const skuInput = dialog.getByRole('combobox', { name: 'full_sku_name' });
    await skuInput.click();
    const listbox = page.getByRole('listbox', { name: 'full_sku_name' });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole('option', { name: /ແຫວນ 1 ສະລຶງ/ })).toBeVisible();

    // Pressing Esc closes only the dropdown, keeping the dialog open
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(dialog).toBeVisible();

    // Re-open and pick SKU
    await skuInput.click();
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: /ແຫວນ 1 ສະລຶງ/ }).click();
    await expect(skuInput).toHaveValue('ແຫວນ 1 ສະລຶງ');

    // Fill totalCost, leave laborFeeThb blank -> submit must stay disabled (Task 4)
    await dialog.locator('#cost').fill('10000000');
    const submitBtn = dialog.getByRole('button', { name: 'ບັນທຶກ' });
    await expect(submitBtn).toBeDisabled();

    // Enter laborFeeThb -> submit becomes enabled
    await dialog.locator('#labor').fill('500');
    await expect(submitBtn).toBeEnabled();

    // Run Axe accessibility check on open dialog
    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([]);

    await dialog.getByRole('button', { name: 'ຍົກເລີກ' }).click();
    await expect(dialog).toBeHidden();

    // Task 3 also works in Stock OUT & Transfer (NEW) -> (OLD) showing available stock
    await page.getByRole('button', { name: 'OUT', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'full_sku_name' }).click();
    const outListbox = page.getByRole('listbox', { name: 'full_sku_name' });
    await expect(outListbox.getByRole('option', { name: /ສາຍຄໍ 1 ບາດ.*45 g/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'ຍົກເລີກ' }).click();

    await page.getByRole('button', { name: 'Transfer (NEW) ເປັນ (OLD)' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'full_sku_name' }).click();
    const trListbox = page.getByRole('listbox', { name: 'full_sku_name' });
    await expect(trListbox.getByRole('option', { name: /ແຫວນ 1 ສະລຶງ.*22\.5 g/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'ຍົກເລີກ' }).click();

    // Task 5: Time filter in ປະຫວັດ Stock sends start_time & end_time API params
    await page.getByRole('button', { name: /ທຸກເວລາ/ }).click();
    await page.getByRole('button', { name: 'ເຊົ້າ 08:00–12:00' }).click();
    await expect
      .poll(() => historyRequests.some((q) => q.includes('start_time=08%3A00') && q.includes('end_time=12%3A00')))
      .toBe(true);
  });
});
