'use client';

import { useEffect, useState } from 'react';

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  text: string;
  /** gold, gold-light, success, danger, muted — in that order. */
  series: string[];
}

const VARS = {
  grid: '--row-line',
  axis: '--muted',
  tooltipBg: '--surface-solid',
  tooltipBorder: '--border',
  text: '--fg',
} as const;
const SERIES_VARS = ['--gold', '--gold-light', '--success', '--danger', '--muted'];

function read(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string) => cs.getPropertyValue(name).trim();
  return {
    grid: get(VARS.grid),
    axis: get(VARS.axis),
    tooltipBg: get(VARS.tooltipBg),
    tooltipBorder: get(VARS.tooltipBorder),
    text: get(VARS.text),
    series: SERIES_VARS.map(get),
  };
}

// Before mount (SSR) the CSS vars are unreadable; fall back to the CSS vars themselves,
// which SVG presentation attributes resolve at paint time.
const FALLBACK: ChartTheme = {
  grid: 'var(--row-line)',
  axis: 'var(--muted)',
  tooltipBg: 'var(--surface-solid)',
  tooltipBorder: 'var(--border)',
  text: 'var(--fg)',
  series: SERIES_VARS.map((v) => `var(${v})`),
};

/** Chart colours resolved from the live theme tokens; re-read when `data-theme` flips. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    setTheme(read());
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
