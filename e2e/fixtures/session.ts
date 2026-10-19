import type { Page } from '@playwright/test';

export type Theme = 'dark' | 'light';

export const E2E_USER = {
  id: 'u1',
  username: 'admin',
  fullName: 'ທົດສອບ ລະບົບ',
  role: 'ADMIN',
} as const;

/**
 * Seeds the browser session before any page script runs.
 * `authed: false` leaves localStorage without a token (for /login) but still sets the theme.
 */
export async function seedSession(page: Page, theme: Theme, authed = true): Promise<void> {
  await page.addInitScript(
    ({ theme, authed, user }) => {
      try {
        if (authed) {
          localStorage.setItem('kpv.accessToken', 'e2e-token');
          localStorage.setItem('kpv.user', JSON.stringify(user));
        }
        localStorage.setItem('kpv.theme', theme);
      } catch {
        /* storage unavailable */
      }
      // Harmless before the theme system exists (Task 1); avoids a flash after.
      const apply = () => {
        if (document.documentElement) document.documentElement.dataset.theme = theme;
      };
      apply();
      document.addEventListener('readystatechange', apply);
    },
    { theme, authed, user: E2E_USER },
  );
}
