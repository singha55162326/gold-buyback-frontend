import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedSession } from './fixtures/session';
import { waitForAnimations } from './fixtures/animations';
import { mockApi } from './fixtures/api-mock';

test('[dialog] stock movement dialog: focus, trap, Esc, restore', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await seedSession(page, 'dark', true);
  await page.goto('/stock/new');
  await page.waitForLoadState('networkidle');

  const opener = page.getByRole('button', { name: 'IN', exact: true });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await waitForAnimations(page);

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    'axe violations inside the open dialog',
  ).toEqual([]);

  const focusInside = () =>
    page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('[role="dialog"]'));
  expect(await focusInside(), 'focus moves into dialog').toBe(true);

  // Tab cycles within the dialog, in both directions.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInside(), `Tab #${i + 1} stays inside`).toBe(true);
  }
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await focusInside(), `Shift+Tab #${i + 1} stays inside`).toBe(true);
  }

  // Body scroll is locked while open.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  // A stray click on the scrim must not discard a half-filled form.
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('[dialog] add AP/AR cash dialog: open modal, focus trap, Esc, close', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await seedSession(page, 'dark', true);

  // Test AP Cash dialog
  await page.goto('/ledger/ap-cash');
  await page.waitForLoadState('networkidle');

  const apOpener = page.getByRole('button', { name: '+ Add AP Cash' });
  await apOpener.focus();
  await apOpener.click();

  const apDialog = page.getByRole('dialog');
  await expect(apDialog).toBeVisible();
  await expect(apDialog).toHaveAttribute('aria-modal', 'true');
  await expect(apDialog.getByText('ເພີ່ມລາຍການ AP (Cash) — ໜີ້ຕ້ອງສົ່ງ')).toBeVisible();

  // Scrim click does not discard
  await page.mouse.click(5, 5);
  await expect(apDialog).toBeVisible();

  // Esc closes
  await page.keyboard.press('Escape');
  await expect(apDialog).toBeHidden();
  await expect(apOpener).toBeFocused();

  // Test AR Cash dialog
  await page.goto('/ledger/ar-cash');
  await page.waitForLoadState('networkidle');

  const arOpener = page.getByRole('button', { name: '+ Add AR Cash' });
  await arOpener.focus();
  await arOpener.click();

  const arDialog = page.getByRole('dialog');
  await expect(arDialog).toBeVisible();
  await expect(arDialog).toHaveAttribute('aria-modal', 'true');
  await expect(arDialog.getByText('ເພີ່ມລາຍການ AR (Cash) — ໜີ້ຕ້ອງຮັບ')).toBeVisible();

  // Cancel button closes
  await arDialog.getByRole('button', { name: 'ຍົກເລີກ' }).click();
  await expect(arDialog).toBeHidden();
});

test('[dialog] AP/AR cash history view detail modal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await seedSession(page, 'dark', true);

  await page.goto('/ledger/ap-cash');
  await page.waitForLoadState('networkidle');

  const viewButton = page.locator('table').last().getByRole('button', { name: /^View/ }).first();
  await viewButton.click();

  const detailDialog = page.getByRole('dialog');
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog).toHaveAttribute('aria-modal', 'true');
  await expect(detailDialog.getByText('ລາຍລະອຽດ AP (Cash)')).toBeVisible();

  // Close via button
  await detailDialog.getByRole('button', { name: 'ປິດ (Close)' }).click();
  await expect(detailDialog).toBeHidden();
});

test('[dialog] AP/AR cash settle modal: open, full-fill, Esc, close', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await seedSession(page, 'dark', true);

  await page.goto('/ledger/ap-cash');
  await page.waitForLoadState('networkidle');

  const payOpener = page.getByRole('button', { name: 'Payment', exact: true }).first();
  await payOpener.focus();
  await payOpener.click();

  const settleDialog = page.getByRole('dialog');
  await expect(settleDialog).toBeVisible();
  await expect(settleDialog).toHaveAttribute('aria-modal', 'true');
  await expect(settleDialog.getByText('ຊຳຣະໜີ້ AP (Cash) — Payment')).toBeVisible();

  await settleDialog.getByRole('button', { name: /ເຕັມຈຳນວນ/ }).click();
  await expect(settleDialog.locator('#settle-amount')).toHaveValue('3,500,000');

  await page.keyboard.press('Escape');
  await expect(settleDialog).toBeHidden();
  await expect(payOpener).toBeFocused();
});

test('[dialog] payment approvals: Approve opens confirmation modal before submitting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await seedSession(page, 'dark', true);

  const reviewCalls: Array<{ url: string; body: unknown }> = [];
  await page.route(/^http:\/\/api\.mock\/api\/buyback/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname === '/api/buyback') {
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            {
              id: 'bb1',
              code: 'BB-001',
              weightG: '15.20',
              quantity: 1,
              payableAmount: '35000000',
              createdAt: '2026-10-18T09:30:00.000Z',
              customer: { phone: '020 5551 2345' },
              goldType: { nameLo: 'ຄຳ 96.5%' },
            },
          ],
          page: 1,
          pageSize: 50,
          total: 1,
          pageCount: 1,
        }),
      });
    }
    if (req.method() === 'POST' && url.pathname === '/api/buyback/bb1/review') {
      reviewCalls.push({ url: url.pathname, body: req.postDataJSON() });
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fallback();
  });

  await page.goto('/payment/approvals');
  await page.waitForLoadState('networkidle');

  const approveBtn = page.getByRole('button', { name: 'Approve', exact: true }).first();
  await approveBtn.click();

  // Clicking Approve opens the confirmation modal without submitting yet.
  expect(reviewCalls).toHaveLength(0);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('ຢືນຢັນ Approve BB-001')).toBeVisible();

  // Cancelling closes the modal without submitting.
  await dialog.getByRole('button', { name: 'ຍົກເລີກ' }).click();
  await expect(dialog).toBeHidden();
  expect(reviewCalls).toHaveLength(0);

  // Re-opening and clicking Confirm submits the approval.
  await approveBtn.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(reviewCalls).toEqual([{ url: '/api/buyback/bb1/review', body: { decision: 'APPROVED' } }]);
});

test('[dialog] payment approvals: blocks Approve and shows reason when wallet balance is insufficient', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await seedSession(page, 'dark', true);

  await page.route(/^http:\/\/api\.mock\/api\/buyback/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname === '/api/buyback') {
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [
            {
              id: 'bb-short',
              code: 'BB-999',
              weightG: '15.00',
              quantity: 1,
              payableAmount: '10000000',
              createdAt: '2026-10-18T09:30:00.000Z',
              customer: { phone: '020 5551 2345' },
              goldType: { nameLo: 'ຄຳ 96.5%' },
              payments: [
                {
                  id: 'p1',
                  method: 'CASH',
                  bankAccountId: null,
                  bankAccount: null,
                  currency: 'LAK',
                  amount: '10000000',
                  amountLak: '10000000',
                  changeLak: '0',
                },
              ],
            },
          ],
          page: 1,
          pageSize: 50,
          total: 1,
          pageCount: 1,
        }),
      });
    }
    return route.fallback();
  });

  await page.goto('/payment/approvals');
  await page.waitForLoadState('networkidle');

  const approveBtn = page.getByRole('button', { name: 'Approve', exact: true }).first();
  await expect(approveBtn).toBeDisabled();
  await expect(page.getByText('ຍອດເງິນບໍ່ພໍ Approve')).toBeVisible();
  await expect(page.getByText(/ຍອດເງິນສົດ LAK ໃນກະເປົ໋າເງິນສົດ \(To Day\) ບໍ່ພໍ/)).toBeVisible();
});
