'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatWeight } from '@/lib/format';

export interface SkuComboboxOption {
  id: string;
  fullSkuName: string;
  weightG: string;
  availableWeightG?: string | null;
  availableQty?: number | null;
}

interface SkuComboboxProps {
  id?: string;
  value: string;
  onSelect: (sku: SkuComboboxOption | null) => void;
  options: SkuComboboxOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  showAvailability?: boolean;
}

interface MenuCoords {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
}

const MIN_MENU_WIDTH = 340;
const MAX_MENU_HEIGHT = 276;
const VIEWPORT_PADDING = 10;
const MENU_OFFSET = 6;

/**
 * Searchable themed combobox for selecting a Gold SKU (`full_sku_name`).
 * Renders via a portal onto `document.body` so modal overflow never clips it,
 * shows piece weight and available warehouse stock, and captures Escape before `Dialog`.
 */
export function SkuCombobox({
  id,
  value,
  onSelect,
  options,
  placeholder = 'ຄົ້ນຫາ ຊື່ SKU ເຕັມ ຫຼື ນ້ຳໜັກ (g)...',
  ariaLabel = 'full_sku_name',
  className = '',
  disabled = false,
  loading = false,
  showAvailability = false,
}: SkuComboboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listboxId = `${controlId}-listbox`;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSku = useMemo(
    () => options.find((opt) => opt.id === value) ?? null,
    [options, value],
  );

  const [query, setQuery] = useState(selectedSku?.fullSkuName ?? '');
  const [open, setOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  // Keep displayed text synced when external `value` changes (e.g. row removed or selected).
  useEffect(() => {
    if (selectedSku) {
      setQuery(selectedSku.fullSkuName);
    } else if (!value && !isFiltering && !open) {
      setQuery('');
    }
  }, [selectedSku, value, isFiltering, open]);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const sortedOptions = useMemo(() => {
    if (!showAvailability) return options;
    return [...options].sort((a, b) => {
      const aInStock = Number(a.availableWeightG ?? 0) > 0 ? 0 : 1;
      const bInStock = Number(b.availableWeightG ?? 0) > 0 ? 0 : 1;
      if (aInStock !== bInStock) return aInStock - bInStock;
      return a.fullSkuName.localeCompare(b.fullSkuName);
    });
  }, [options, showAvailability]);

  const filteredOptions = useMemo(() => {
    if (!isFiltering || !normalizedQuery) return sortedOptions;
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const startsWith: SkuComboboxOption[] = [];
    const contains: SkuComboboxOption[] = [];

    for (const opt of sortedOptions) {
      const lowerName = opt.fullSkuName.toLowerCase();
      const fmtW = formatWeight(opt.weightG).toLowerCase();
      const rawW = opt.weightG.toLowerCase();
      const numW = Number(opt.weightG);

      const matchesAll = tokens.every((tok) => {
        if (lowerName.includes(tok) || fmtW.includes(tok) || rawW.includes(tok)) return true;
        if (/^\d+(\.\d+)?$/.test(tok) && Number.isFinite(numW)) {
          return numW === Number(tok);
        }
        return false;
      });

      if (!matchesAll) continue;
      if (lowerName.startsWith(normalizedQuery)) {
        startsWith.push(opt);
      } else {
        contains.push(opt);
      }
    }
    return [...startsWith, ...contains];
  }, [sortedOptions, isFiltering, normalizedQuery]);

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
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    const availableSpace = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(150, Math.min(MAX_MENU_HEIGHT, availableSpace - 44));

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

  useEffect(() => {
    if (filteredOptions.length === 0) {
      setActiveIndex(-1);
    } else if (activeIndex < 0 || activeIndex >= filteredOptions.length) {
      setActiveIndex(0);
    }
  }, [filteredOptions.length, activeIndex]);

  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const closeMenuAndReconcile = useCallback(() => {
    setOpen(false);
    setIsFiltering(false);
    if (selectedSku) {
      setQuery(selectedSku.fullSkuName);
    } else if (trimmedQuery) {
      const exact = options.find((opt) => opt.fullSkuName.toLowerCase() === normalizedQuery);
      if (exact) {
        onSelect(exact);
        setQuery(exact.fullSkuName);
      }
    }
  }, [selectedSku, trimmedQuery, options, normalizedQuery, onSelect]);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      closeMenuAndReconcile();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeMenuAndReconcile();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, closeMenuAndReconcile]);

  const openMenu = (filtering: boolean) => {
    if (disabled) return;
    setIsFiltering(filtering);
    const currentIdx = selectedSku
      ? sortedOptions.findIndex((opt) => opt.id === selectedSku.id)
      : -1;
    setActiveIndex(!filtering && currentIdx >= 0 ? currentIdx : 0);
    setOpen(true);
  };

  const selectOption = (sku: SkuComboboxOption) => {
    setQuery(sku.fullSkuName);
    onSelect(sku);
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
      if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openMenu(false);
        return;
      }
      if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? filteredOptions.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        selectOption(filteredOptions[activeIndex]);
      }
    } else if (e.key === 'Tab') {
      closeMenuAndReconcile();
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

  const showClear = !disabled && Boolean(query || value);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Leading SKU / cube icon */}
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
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
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
        value={query}
        title={selectedSku ? `${selectedSku.fullSkuName} (${formatWeight(selectedSku.weightG)} g)` : undefined}
        onFocus={() => {
          if (!open) openMenu(false);
        }}
        onClick={() => {
          if (!open) openMenu(false);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          if (value && next !== selectedSku?.fullSkuName) {
            onSelect(null);
          }
          setIsFiltering(true);
          setActiveIndex(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleInputKeyDown}
        className={`input w-full pl-8 ${showClear ? 'pr-14' : 'pr-8'} ${
          open ? 'border-[var(--border-active)]' : ''
        } ${className}`}
      />

      {/* Clear selection button */}
      {showClear && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="ລ້າງການເລືອກ SKU"
          title="ລ້າງ"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('');
            onSelect(null);
            setIsFiltering(false);
            setActiveIndex(0);
            setOpen(true);
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
        aria-label={open ? 'ປິດລາຍການ SKU' : 'ເປີດລາຍການ SKU'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            closeMenuAndReconcile();
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

      {/* Portal dropdown menu so modal overflow never clips it */}
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
            <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5 font-medium text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
                {isFiltering && trimmedQuery
                  ? `ພົບ ${filteredOptions.length} ລາຍການ`
                  : `ລາຍການ SKU (${options.length})`}
              </span>
              <span className="hidden sm:inline text-[10px] text-muted">
                ↑↓ ເລືອກ · Enter · Esc
              </span>
            </div>

            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              style={{ maxHeight: `${coords.maxHeight}px` }}
              className="nav-scroll overflow-y-auto p-1.5 space-y-0.5"
            >
              {loading && options.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-muted">
                  ກຳລັງໂຫຼດລາຍການ SKU...
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-muted">
                  ບໍ່ພົບ SKU ທີ່ກົງກັບ &ldquo;{trimmedQuery}&rdquo;
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.id === value;
                  const isActive = idx === activeIndex;
                  const availNum = Number(opt.availableWeightG ?? 0);
                  const hasStock = availNum > 0;
                  return (
                    <button
                      key={opt.id}
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
                      className={`flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ${
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
                              : showAvailability
                                ? hasStock
                                  ? 'bg-[var(--success-dot)]'
                                  : 'bg-line'
                                : isActive
                                  ? 'bg-[var(--gold-icon)]'
                                  : 'bg-line'
                          }`}
                        />
                        <span className="truncate">{renderHighlightedLabel(opt.fullSkuName)}</span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="num rounded-md border border-line bg-recessed px-1.5 py-0.5 text-[11px] font-medium text-muted">
                          {formatWeight(opt.weightG)} g
                        </span>
                        {showAvailability && (
                          <span
                            className={`num rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                              hasStock
                                ? 'bg-[var(--success-bg)] text-success border border-[var(--success-border)]'
                                : 'bg-recessed text-muted border border-line'
                            }`}
                          >
                            {hasStock
                              ? `${opt.availableQty != null ? `${opt.availableQty} ຊິ້ນ · ` : ''}${formatWeight(opt.availableWeightG)} g`
                              : 'ໝົດສາງ'}
                          </span>
                        )}
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
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
