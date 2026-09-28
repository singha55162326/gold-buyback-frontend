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

const TONE_STYLE: Record<ToastTone, { ring: string; dot: string; label: string }> = {
  success: { ring: 'border-emerald-200', dot: 'bg-emerald-500', label: 'ສຳເລັດ' },
  error: { ring: 'border-red-200', dot: 'bg-red-500', label: 'ຜິດພາດ' },
  info: { ring: 'border-slate-200', dot: 'bg-slate-400', label: 'ແຈ້ງເຕືອນ' },
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
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-semibold text-slate-900">
                  {t.title}
                </ToastPrimitive.Title>
                {t.body && (
                  <ToastPrimitive.Description className="mt-0.5 break-words text-xs text-slate-600">
                    {t.body}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="ປິດ"
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
