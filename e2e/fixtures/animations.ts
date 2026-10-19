import type { Page } from '@playwright/test';

/**
 * Wait for running/pending Web Animations (the data-fade load animation) to end.
 * On timeout, finish only the finite ones (infinite animations throw on finish())
 * and never throw, so a test cannot hang or fail here and captures are not mid-fade.
 */
export async function waitForAnimations(page: Page, timeout = 5000): Promise<void> {
  const settled = () =>
    document.getAnimations().every((a) => a.playState !== 'running' && !a.pending);
  try {
    await page.waitForFunction(settled, undefined, { timeout });
  } catch {
    try {
      await page.evaluate(() =>
        document.getAnimations().forEach((a) => {
          try {
            if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
          } catch {
            /* ignore */
          }
        }),
      );
    } catch {
      /* page closed or navigating */
    }
  }
}
