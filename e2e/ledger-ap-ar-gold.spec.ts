import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedSession } from './fixtures/session';
import { waitForAnimations } from './fixtures/animations';
import { mockApi } from './fixtures/api-mock';
import { findLowContrast } from './fixtures/contrast';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

test.describe('AP/AR (GOLD) — Supplier Dashboard & History Time Filter', () => {
  for (const side of ['AP', 'AR'] as const) {
    const routePath = side === 'AP' ? '/ledger/ap-gold' : '/ledger/ar-gold';

    test(`${side}: renders supplier current(g) dashboard, filters by supplier card & sends time filter params`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mockApi(page);

      const historyRequests: string[] = [];

      await page.route('**/api/ledger/ap-ar/gold/partners**', async (route) => {
        await route.fulfill({
          status: 200,
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              partnerId: 'p-easy',
              partnerCode: 'EASY',
              partnerNameLo: 'EASY',
              side,
              broughtForwardG: '10.00',
              increasesG: '25.00',
              decreasesG: '5.00',
              currentG: '30.00',
            },
            {
              partnerId: 'p-fac',
              partnerCode: 'FACTORY',
              partnerNameLo: 'FACTORY',
              side,
              broughtForwardG: '5.00',
              increasesG: '15.00',
              decreasesG: '5.00',
              currentG: '15.00',
            },
          ]),
        });
      });

      await page.route('**/api/ledger/ap-ar/gold/history**', async (route) => {
        const url = new URL(route.request().url());
        historyRequests.push(url.search);
        await route.fulfill({
          status: 200,
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify({
            rows: [
              {
                id: 'g1',
                businessDate: '2026-10-18',
                createdAt: '2026-10-18T09:30:00.000Z',
                side,
                typeLabel: 'ຮັບເຂົ້າຈາກ EASY',
                goldInG: '15.00',
                goldOutG: '0.00',
                weightG: '30.00',
                priceIn: '37500000',
                priceOut: '0',
                cost: '37500000',
                note: null,
                partner: { nameLo: 'EASY' },
                createdBy: 'admin',
              },
            ],
            page: 1,
            pageSize: 5000,
            total: 1,
            pageCount: 1,
            fromDate: '2026-10-18',
            toDate: '2026-10-18',
          }),
        });
      });

      await seedSession(page, 'dark', true);
      await page.goto(routePath);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await waitForAnimations(page);

      // Task 1: Dashboard summarizing ຍອດປັດຈຸບັນ(g) of Supplier sources
      const dashboard = page.getByRole('region', {
        name: 'ສະຫຼຸບຍອດປັດຈຸບັນ (g) ຕາມແຫຼ່ງ Supplier',
      });
      await expect(dashboard).toBeVisible();
      await expect(dashboard.getByText('2 ແຫຼ່ງ')).toBeVisible();
      await expect(dashboard.getByText('ລວມ 45 g · 3 ບາດ')).toBeVisible();

      const easyCard = dashboard.getByRole('button', { name: /EASY/ });
      await expect(easyCard).toBeVisible();
      await expect(easyCard.getByText('30 g')).toBeVisible();

      // Clicking a supplier card filters history by partnerId
      await easyCard.click();
      await expect(easyCard).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() => historyRequests.some((q) => q.includes('partnerId=p-easy')))
        .toBe(true);

      // Task 2: Time filter in Table History sends start_time & end_time params
      await page.getByRole('button', { name: /ທຸກເວລາ/ }).click();
      await page.getByRole('button', { name: 'ເຊົ້າ 08:00–12:00' }).click();
      await expect
        .poll(() =>
          historyRequests.some(
            (q) => q.includes('start_time=08%3A00') && q.includes('end_time=12%3A00'),
          ),
        )
        .toBe(true);

      // Contrast + Axe check
      const low = await findLowContrast(page, ['main']);
      expect(low).toEqual([]);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(
        axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    });
  }
});
