'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface GoldItemComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

interface MenuCoords {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

const MIN_MENU_WIDTH = 240;
const MAX_MENU_HEIGHT = 256;
const VIEWPORT_PADDING = 10;
const MENU_OFFSET = 6;

/**
 * Searchable themed combobox for selecting or entering a gold item name (`ລາຍການສິນຄ້າ`).
 * Renders the dropdown panel via a portal onto `document.body` so table/modal
 * overflow containers never clip it, and captures Escape before `Dialog` closes.
 */
export function GoldItemCombobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'ເລືອກ ຫຼື ພິມລາຍການສິນຄ້າ...',
  ariaLabel = 'ລາຍການສິນຄ້າ',
  className = '',
  disabled = false,
  loading = false,
}: GoldItemComboboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listboxId = `${controlId}-listbox`;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  const trimmedQuery = value.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!isFiltering || !normalizedQuery) return options;
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const opt of options) {
      const lower = opt.toLowerCase();
      if (lower.startsWith(normalizedQuery)) {
        startsWith.push(opt);
      } else if (lower.includes(normalizedQuery)) {
        contains.push(opt);
      }
    }
    return [...startsWith, ...contains];
  }, [options, isFiltering, normalizedQuery]);

  const hasExactMatch = useMemo(
    () => Boolean(trimmedQuery) && options.some((opt) => opt.toLowerCase() === normalizedQuery),
    [options, trimmedQuery, normalizedQuery],
  );

  // Show a quick "use custom text" row when the user types an item not yet in the list.
  const showCustomOption = isFiltering && Boolean(trimmedQuery) && !hasExactMatch;
  const totalNavigableCount = filteredOptions.length + (showCustomOption ? 1 : 0);

  const updatePosition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const desiredWidth = Math.min(Math.max(rect.width, MIN_MENU_WIDTH), vw - VIEWPORT_PADDING * 2);
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rect.left, vw - desiredWidth - VIEWPORT_PADDING),
    );

    const spaceBelow = vh - rect.bottom - VIEWPORT_PADDING - MENU_OFFSET;
    const spaceAbove = rect.top - VIEWPORT_PADDING - MENU_OFFSET;
    const openAbove = spaceBelow < 210 && spaceAbove > spaceBelow;

    const availableSpace = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(140, Math.min(MAX_MENU_HEIGHT, availableSpace - 44));

    if (openAbove) {
      setCoords({
        left,
        bottom: vh - rect.top + MENU_OFFSET,
        width: desiredWidth,
        maxHeight,
        placement: 'top',
      });
    } else {
      setCoords({
        left,
        top: rect.bottom + MENU_OFFSET,
        width: desiredWidth,
        maxHeight,
        placement: 'bottom',
      });
    }
  }, []);

  // Recompute portal coordinates while open (including scrolling inside Dialog).
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePosition]);

  // Keep activeIndex in bounds when the filtered list changes.
  useEffect(() => {
    if (totalNavigableCount === 0) {
      setActiveIndex(-1);
    } else if (activeIndex < 0 || activeIndex >= totalNavigableCount) {
      setActiveIndex(0);
    }
  }, [totalNavigableCount, activeIndex]);

  // Scroll the highlighted option into view during arrow-key navigation.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  // Close on outside click & intercept Escape on capture phase before Dialog sees it.
  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setIsFiltering(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setOpen(false);
        setIsFiltering(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const openMenu = (filtering: boolean) => {
    if (disabled) return;
    setIsFiltering(filtering);
    const currentIdx = options.findIndex((opt) => opt.toLowerCase() === normalizedQuery);
    setActiveIndex(!filtering && currentIdx >= 0 ? currentIdx : 0);
    setOpen(true);
  };

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setIsFiltering(false);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        openMenu(false);
        return;
      }
      if (totalNavigableCount > 0) {
        setActiveIndex((prev) => (prev + 1) % totalNavigableCount);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openMenu(false);
        return;
      }
      if (totalNavigableCount > 0) {
        setActiveIndex((prev) => (prev <= 0 ? totalNavigableCount - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        selectOption(filteredOptions[activeIndex]);
      } else if (showCustomOption && activeIndex === filteredOptions.length) {
        selectOption(trimmedQuery);
      } else if (trimmedQuery) {
        setOpen(false);
        setIsFiltering(false);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
      setIsFiltering(false);
    }
  };

  const renderHighlightedLabel = (label: string) => {
    if (!isFiltering || !normalizedQuery) return label;
    const matchIdx = label.toLowerCase().indexOf(normalizedQuery);
    if (matchIdx === -1) return label;
    const before = label.slice(0, matchIdx);
    const match = label.slice(matchIdx, matchIdx + trimmedQuery.length);
    const after = label.slice(matchIdx + trimmedQuery.length);
    return (
      <>
        {before}
        <mark className="bg-transparent font-semibold text-gold underline decoration-gold/50 underline-offset-2">
          {match}
        </mark>
        {after}
      </>
    );
  };

  const showClear = !disabled && Boolean(value);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Leading gold jewelry/tag icon */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--gold-icon)]"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3h12l4 6-10 13L2 9z" />
          <path d="M2 9h20" />
          <path d="M12 22 9 9l3-6 3 6z" />
        </svg>
      </span>

      <input
        ref={inputRef}
        id={controlId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onFocus={() => {
          if (!open) openMenu(false);
        }}
        onClick={() => {
          if (!open) openMenu(false);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setIsFiltering(true);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleInputKeyDown}
        className={`input w-full pl-8 ${showClear ? 'pr-14' : 'pr-8'} ${
          open ? 'border-[var(--border-active)]' : ''
        } ${className}`}
      />

      {/* Quick clear button */}
      {showClear && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="ລ້າງຊື່ລາຍການສິນຄ້າ"
          title="ລ້າງ"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            openMenu(false);
            inputRef.current?.focus();
          }}
          className="absolute right-7 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-muted transition-colors duration-150 hover:bg-[var(--row-hover)] hover:text-fg"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Gold chevron toggle */}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={open ? 'ປິດລາຍການສິນຄ້າ' : 'ເປີດລາຍການສິນຄ້າ'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            setOpen(false);
            setIsFiltering(false);
          } else {
            openMenu(false);
            inputRef.current?.focus();
          }
        }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-[var(--gold-icon)] transition-transform duration-150 hover:bg-[var(--row-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className={`h-4 w-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Portal dropdown menu so table/dialog overflow never clips it */}
      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              ...(coords.placement === 'top'
                ? { bottom: `${coords.bottom}px` }
                : { top: `${coords.top}px` }),
            }}
            className="menu-panel z-[70] overflow-hidden rounded-2xl shadow-2xl"
          >
            {/* Compact header strip */}
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5 font-medium text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
                {isFiltering && trimmedQuery
                  ? `ພົບ ${filteredOptions.length} ລາຍການ`
                  : `ລາຍການສິນຄ້າ (${options.length})`}
              </span>
              <span className="hidden sm:inline text-[10px] text-muted">↑↓ ເລືອກ · Enter</span>
            </div>

            {/* Scrollable options */}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              style={{ maxHeight: `${coords.maxHeight}px` }}
              className="nav-scroll overflow-y-auto p-1.5 space-y-0.5"
            >
              {loading && options.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted">
                  ກຳລັງໂຫຼດລາຍການສິນຄ້າ...
                </div>
              ) : filteredOptions.length === 0 && !showCustomOption ? (
                <div className="px-3 py-4 text-center text-xs text-muted">
                  ບໍ່ມີລາຍການສິນຄ້າ
                </div>
              ) : (
                <>
                  {filteredOptions.map((opt, idx) => {
                    const isSelected = opt.toLowerCase() === normalizedQuery;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={opt}
                        id={`${listboxId}-opt-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-option-index={idx}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectOption(opt);
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                          isSelected
                            ? 'bg-gold-tint font-semibold text-gold'
                            : isActive
                              ? 'bg-[var(--row-hover)] text-fg'
                              : 'text-fg hover:bg-[var(--row-hover)]'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                              isSelected
                                ? 'bg-gold'
                                : isActive
                                  ? 'bg-[var(--gold-icon)]'
                                  : 'bg-line'
                            }`}
                          />
                          <span className="truncate">{renderHighlightedLabel(opt)}</span>
                        </span>
                        {isSelected && (
                          <svg
                            className="h-4 w-4 shrink-0 text-gold"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m5 12 5 5L20 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}

                  {showCustomOption && (
                    <button
                      id={`${listboxId}-opt-${filteredOptions.length}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      data-option-index={filteredOptions.length}
                      onMouseEnter={() => setActiveIndex(filteredOptions.length)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectOption(trimmedQuery);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-line px-2.5 py-2 text-left text-xs transition-colors duration-150 ${
                        activeIndex === filteredOptions.length
                          ? 'bg-gold-tint text-fg'
                          : 'text-muted hover:bg-[var(--row-hover)] hover:text-fg'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-gold"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        <span className="truncate">
                          ໃຊ້ຊື່: <strong className="font-semibold text-fg">&ldquo;{trimmedQuery}&rdquo;</strong>
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-gold-tint px-2 py-0.5 text-[10px] font-medium text-gold">
                        ກຳນົດເອງ
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
