'use client';

import { useEffect, useRef } from 'react';

const KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' },
  { opacity: 1, transform: 'none', filter: 'blur(0)' },
];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Load fade for `[data-fade]` blocks, in DOM order (design.md Motion).
 *
 * - The first run animates everything present (chrome included, "on mount").
 * - Later runs (key changes, e.g. the pathname) animate `main [data-fade]`.
 * - A MutationObserver animates every `[data-fade]` that mounts later (a
 *   readiness panel after its data arrives, the shift banner, a page that
 *   replaces `loading.tsx` on soft navigation). Each node animates once
 *   (WeakSet), staggered relative to its own batch of additions.
 * - Skipped entirely for reduced motion; the observer is disconnected on unmount.
 */
export function useFadeIn(key?: unknown): void {
  const first = useRef(true);
  const done = useRef<WeakSet<Element>>(new WeakSet());

  /** Animate not-yet-animated elements; stagger index = position in this batch. */
  const play = (els: Iterable<Element>) => {
    const batch = Array.from(els).filter((el) => el.isConnected && !done.current.has(el));
    batch.forEach((el) => done.current.add(el));
    if (batch.length === 0 || reducedMotion()) return;
    batch
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .forEach((el, i) =>
        el.animate(KEYFRAMES, {
          duration: 700,
          delay: 80 + i * 60,
          easing: 'cubic-bezier(.2,.7,.2,1)',
          fill: 'backwards',
        }),
      );
  };

  useEffect(() => {
    const observer = new MutationObserver((records) => {
      const found = new Set<Element>();
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches('[data-fade]')) found.add(n);
          n.querySelectorAll('[data-fade]').forEach((d) => found.add(d));
        });
      }
      if (found.size > 0) play(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
    // `play` only touches refs; the observer must live for the whole mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const isFirst = first.current;
    const els = document.querySelectorAll(isFirst ? '[data-fade]' : 'main [data-fade]');
    // The shell renders nothing until the session loads; keep "first" until
    // there is something to animate.
    if (isFirst && els.length > 0) first.current = false;
    play(els);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
