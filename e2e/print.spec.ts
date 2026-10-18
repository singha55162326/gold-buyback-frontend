import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { seedSession } from './fixtures/session';
import { waitForAnimations } from './fixtures/animations';
import { mockApi } from './fixtures/api-mock';

// A4 portrait (794 CSS px) and landscape (1123 CSS px) print widths.
const WIDTHS = [794, 1123];
const PAGES = ['/ledger/ap-gold', '/reports', '/payment/old-gold'];

for (const width of WIDTHS) {
  for (const route of PAGES) {
    test(`[print] ${route} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockApi(page);
      await seedSession(page, 'dark', true);
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await waitForAnimations(page);
      await page.emulateMedia({ media: 'print' });

      const m = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const r = main.getBoundingClientRect();
        const backdrop = Array.from(document.querySelectorAll('body > div')).find(
          (d) => d.getAttribute('aria-hidden') === 'true',
        ) as HTMLElement | undefined;
        const tables = Array.from(document.querySelectorAll('main table')).map((t) => {
          const tr = (t as HTMLElement).getBoundingClientRect();
          return { right: tr.right, cols: t.querySelectorAll('thead th').length };
        });
        return {
          mainWidth: r.width,
          docWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          backdropDisplay: backdrop ? getComputedStyle(backdrop).display : 'none',
          tables,
        };
      });
      expect(m.mainWidth / m.docWidth, 'main fills the page').toBeGreaterThanOrEqual(0.9);
      expect(m.backdropDisplay, 'backdrop hidden').toBe('none');
      expect(m.scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(m.docWidth + 1);
      for (const t of m.tables) {
        expect(t.right, 'table inside the sheet').toBeLessThanOrEqual(m.docWidth + 1);
        expect(t.cols).toBeGreaterThan(0);
      }

      const slug = route.replace(/^\//, '').replace(/\//g, '-');
      const file = path.join('e2e', '__screenshots__', `print-${width}-${slug}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, await page.screenshot({ fullPage: true }));
    });
  }
}
