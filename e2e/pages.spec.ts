import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ROUTES } from './routes';
import { seedSession, type Theme } from './fixtures/session';
import { waitForAnimations } from './fixtures/animations';
import { findLowContrast } from './fixtures/contrast';
import { mockApi, isIgnorableConsoleError } from './fixtures/api-mock';

const THEMES: Theme[] = ['dark', 'light'];
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const LABEL = process.env.SHOT_LABEL ?? 'current';

for (const route of ROUTES) {
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      test(`[${route.group}] ${route.path} ${theme} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const errors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          if (isIgnorableConsoleError(msg.text(), msg.location().url)) return;
          errors.push(`console: ${msg.text()}`);
        });
        page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

        await mockApi(page);
        await seedSession(page, theme, route.authed);
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await waitForAnimations(page);

        const file = path.join('e2e', '__screenshots__', LABEL, theme, vp.name, `${route.slug}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // Capture to a buffer and write with a retry: on Windows a scanner/indexer or an overlapping
        // run can briefly lock the target PNG, which made page.screenshot({ path }) fail with UNKNOWN.
        const png = await page.screenshot({ fullPage: true });
        for (let attempt = 0; ; attempt++) {
          try {
            fs.writeFileSync(file, png);
            break;
          } catch (err) {
            if (attempt >= 4) throw err;
            await page.waitForTimeout(150 * (attempt + 1));
          }
        }

        // Soft assertions so one run reports overflow, console errors and axe together.
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect
          .soft(overflow.scrollWidth, `horizontal scroll (${overflow.scrollWidth} > ${overflow.innerWidth})`)
          .toBeLessThanOrEqual(overflow.innerWidth + 1);

        expect.soft(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([]);

        if (route.authed) {
          // Every app page fades in: at least one data-fade block must live in <main>.
          const fadeCount = await page.locator('main [data-fade]').count();
          expect.soft(fadeCount, 'page has no data-fade blocks').toBeGreaterThanOrEqual(1);

          const low = await findLowContrast(page, ['main']);
          const detail = low.slice(0, 6).join(' | ');
          expect.soft(low.length, `low-contrast text (${low.length}): ${detail}`).toBe(0);
        }

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        const summary = results.violations
          .map((v) => `${v.id} x${v.nodes.length} [${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}]`)
          .join('\n');
        expect.soft(results.violations.length, `axe violations:\n${summary}`).toBe(0);

        // axe cannot decide some contrast checks (gradients, translucency); surface how many.
        // Not a failure: the contrast guard above is the estimate for those nodes.
        const incomplete = results.incomplete.find((i) => i.id === 'color-contrast')?.nodes.length ?? 0;
        test.info().annotations.push({ type: 'axe-contrast-incomplete', description: String(incomplete) });
      });
    }
  }
}

test('[motion] reduced-motion skips fade', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page);
  await seedSession(page, 'dark', true);
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const count = await page.evaluate(() => document.getAnimations().length);
  expect(count, 'no Web Animations should be created under prefers-reduced-motion').toBe(0);
});
