'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog, hand-rolled (Radix Dialog is not a dependency).
 * Portal to body, Esc closes (scrim click only with `dismissOnScrim`), focus moved in and trapped,
 * focus restored to the opener on close, body scroll locked while open.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissOnScrim = false,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  /** Close on a click outside the panel. Off by default: a stray click must not discard a half-filled form. */
  dismissOnScrim?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Capture the opener during the render that flips `open` to true, i.e. before
  // the commit where children with `autoFocus` steal focus.
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const panel = panelRef.current;

    // Focus the first control in the body (not the close button) when there is one.
    const inBody = Array.from(panel?.querySelectorAll<HTMLElement>(`[data-dialog-body] :is(${FOCUSABLE})`) ?? []).filter(
      (el) => el.offsetParent !== null,
    );
    const alreadyInside = panel?.contains(document.activeElement) && document.activeElement !== panel;
    const first = inBody[0] ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    if (!alreadyInside) (first ?? panel)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      } else if (!panel.contains(active)) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="dialog-scrim"
      onMouseDown={(e) => {
        if (dismissOnScrim && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`dialog-panel menu-panel ${size === 'lg' ? 'max-w-[760px]' : 'max-w-[560px]'}`}
      >
        <div className="dialog-head">
          <h2 id={titleId} className="text-gold-gradient font-serif text-[22px] font-bold leading-[1.5]">
            {title}
          </h2>
          <button type="button" className="chrome-btn shrink-0" aria-label="ປິດ" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div data-dialog-body className="dialog-body">
          {children}
        </div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
