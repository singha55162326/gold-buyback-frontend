'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  /** Something worked. Auto-dismisses. */
  success: (title: string, body?: string) => void;
  /** Something failed. Stays longer — a failed save must not vanish unread. */
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * ການແຈ້ງເຕືອນແບບ toast.
 *
 * Replaces the per-page success/error banners: those pushed the table down as
 * they appeared, and an Admin who scrolled away never saw them. Toasts sit
 * above the canvas, stack, and clear themselves.
 *
 * Errors linger at 8s against 4s for a success — a staff member needs time to
 * read why a save was refused, but not to be told it worked.
 */
const DURATION: Record<ToastTone, number> = {
  success: 4_000,
  info: 5_000,
  error: 8_000,
};

const TONE_STYLE: Record<ToastTone, { ring: string; icon: string; label: string; path: string }> = {
  success: {
    ring: 'border-[var(--success-border)]',
    icon: 'text-success',
    label: 'ສຳເລັດ',
    path: 'M5 10.5l3.2 3.2L15 6.8',
  },
  error: {
    ring: 'border-[var(--danger-border)]',
    icon: 'text-danger',
    label: 'ຜິດພາດ',
    path: 'M10 6v5M10 14h.01',
  },
  info: {
    ring: 'border-[var(--border)]',
    icon: 'text-gold',
    label: 'ແຈ້ງເຕືອນ',
    path: 'M10 9v5M10 6h.01',
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, title: string, body?: string) => {
    const id = nextId.current++;
    setItems((prev) => {
      // Cap the stack: a loop that fails repeatedly should not bury the screen.
      const next = [...prev, { id, tone, title, body }];
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push('success', title, body),
      error: (title, body) => push('error', title, body),
      info: (title, body) => push('info', title, body),
    }),
    [push],
  );

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        {items.map((t) => {
          const tone = TONE_STYLE[t.tone];
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={DURATION[t.tone]}
              onOpenChange={(open) => {
                if (!open) dismiss(t.id);
              }}
              className={`toast ${tone.ring}`}
            >
              <svg
                viewBox="0 0 20 20"
                className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${tone.icon}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="7.5" />
                <path d={tone.path} />
              </svg>
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-semibold text-fg-strong">
                  {t.title}
                </ToastPrimitive.Title>
                {t.body && (
                  <ToastPrimitive.Description className="mt-0.5 break-words text-xs text-fg">
                    {t.body}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="ປິດ"
                className="-my-2 -mr-2 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-fg"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                  <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport className="toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Toast api. Safe to call from anywhere under `ToastProvider`; outside one it
 * degrades to a no-op rather than throwing, so a component rendered in
 * isolation (a test, a story) still works.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return (
    ctx ?? {
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    }
  );
}
