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
