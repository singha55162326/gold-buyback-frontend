'use client';

import * as React from 'react';
import {
  caretAfterFormat,
  formatNumericDisplay,
  sanitizeNumeric,
} from '@/lib/number-input';

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Raw decimal string without separators, e.g. "1500000.5". */
  value: string;
  onValueChange: (raw: string) => void;
  /** Max fraction digits. 0 = integer only. */
  decimals?: number;
  allowNegative?: boolean;
  /** Optional trailing unit label inside the field ("LAK", "g"). */
  unit?: string;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { value, onValueChange, decimals = 0, allowNegative, unit, className, onPaste, ...rest },
    ref,
  ) {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const pendingCaret = React.useRef<number | null>(null);
    const display = formatNumericDisplay(value);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref],
    );

    React.useLayoutEffect(() => {
      const el = innerRef.current;
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
    });

    function apply(el: HTMLInputElement, text: string, caret: number) {
      const raw = sanitizeNumeric(text, { decimals, allowNegative });
      const nextDisplay = formatNumericDisplay(raw);
      const pos = caretAfterFormat(text, caret, nextDisplay);
      if (raw === value) {
        // Rejected keystroke: no re-render will follow, so restore by hand.
        el.value = nextDisplay;
        el.setSelectionRange(pos, pos);
        return;
      }
      pendingCaret.current = pos;
      onValueChange(raw);
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const el = e.currentTarget;
      apply(el, el.value, el.selectionStart ?? el.value.length);
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
      onPaste?.(e);
      if (e.defaultPrevented) return;
      const el = e.currentTarget;
      const pasted = e.clipboardData.getData('text');
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      e.preventDefault();
      const text = el.value.slice(0, start) + pasted + el.value.slice(end);
      apply(el, text, start + pasted.length);
    }

    const input = (
      <input
        {...rest}
        ref={setRefs}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onPaste={handlePaste}
        className={`tabular-nums${unit ? ' pr-14' : ''}${className ? ` ${className}` : ''}`}
      />
    );

    if (!unit) return input;
    return (
      <div className="relative">
        {input}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
        >
          {unit}
        </span>
      </div>
    );
  },
);
