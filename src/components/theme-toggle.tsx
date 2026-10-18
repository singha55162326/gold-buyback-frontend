'use client';

import { getTheme, setTheme, type Theme } from '@/lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  // No state: the pre-paint script sets <html data-theme> before hydration, so both
  // icons are rendered and CSS (`.theme-icon-*` in globals.css) shows the right one.
  // That keeps the icon correct on the very first paint.
  const toggle = () => {
    const next: Theme = getTheme() === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  return (
    <button
      type="button"
      aria-label="ສະຫຼັບຮູບແບບສີ"
      onClick={toggle}
      className={`recessed inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px]
                  text-gold transition-colors hover:border-[var(--border-hover)] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Moon while light is active, sun while dark is active (the icon shows the current theme). */}
        <path className="theme-icon-light" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        <g className="theme-icon-dark">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </g>
      </svg>
    </button>
  );
}
