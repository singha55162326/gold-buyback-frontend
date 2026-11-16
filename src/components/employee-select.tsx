'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface EmployeeOption {
  id: string;
  code: string;
  fullName: string;
  position?: string | null;
  phone?: string | null;
  branch?: { id: string; code: string; nameLo: string } | null;
}

interface EmployeeSelectProps {
  id?: string;
  value: string;
  onChange: (fullName: string) => void;
  employees: EmployeeOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  allowClear?: boolean;
}

/**
 * Searchable combobox dropdown for selecting a receiving employee (`ພະນັກງານຮັບ`).
 * Matches against employee name, code, branch name/code, position, and phone, and handles
 * Escape on `window` capture phase so closing the dropdown inside a `Dialog` does not
 * dismiss the modal itself.
 */
export function EmployeeSelect({
  id,
  value,
  onChange,
  employees,
  placeholder = '— ເລືອກພະນັກງານຮັບ —',
  searchPlaceholder = 'ຄົ້ນຫາຊື່, ສາຂາ, ຕຳແໜ່ງ...',
  className = '',
  disabled = false,
  loading = false,
  allowClear = true,
}: EmployeeSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listboxId = `${controlId}-listbox`;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.fullName === value) ?? null,
    [employees, value],
  );

  // Preserve historical staff names stored on older orders that no longer exist in active employees.
  const hasLegacyValue = Boolean(value.trim()) && !selectedEmployee;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((emp) => {
      const haystack = [
        emp.fullName,
        emp.code,
        emp.branch?.nameLo ?? '',
        emp.branch?.code ?? '',
        emp.position ?? '',
        emp.phone ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, query]);

  const latestStateRef = useRef({ employees, value });
  latestStateRef.current = { employees, value };

  // Reset search & focus input only when the dropdown transitions to open.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const { employees: currentEmployees, value: currentValue } = latestStateRef.current;
    const currentIdx = currentEmployees.findIndex((e) => e.fullName === currentValue);
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Keep activeIndex in bounds when filtered list shrinks.
  useEffect(() => {
    if (filtered.length === 0) {
      setActiveIndex(-1);
    } else if (activeIndex < 0 || activeIndex >= filtered.length) {
      setActiveIndex(0);
    }
  }, [filtered.length, activeIndex]);

  // Scroll highlighted option into view during keyboard navigation.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  // Close on outside click and capture Escape before Dialog's document listener.
  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const selectEmployee = (fullName: string) => {
    onChange(fullName);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[activeIndex] ?? (filtered.length === 1 ? filtered[0] : undefined);
      if (target) selectEmployee(target.fullName);
    }
  };

  const showClearButton = allowClear && !disabled && Boolean(value);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`input flex items-center justify-between gap-2 text-left ${
          showClearButton ? 'pr-14' : 'pr-9'
        } ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selectedEmployee ? (
            <span className="flex items-baseline gap-1.5 truncate">
              <span className="truncate font-medium text-fg">{selectedEmployee.fullName}</span>
              {(selectedEmployee.branch || selectedEmployee.position) && (
                <span className="truncate text-xs text-muted">
                  {[selectedEmployee.branch?.nameLo, selectedEmployee.position].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          ) : hasLegacyValue ? (
            <span className="truncate text-fg">{value}</span>
          ) : (
            <span className="text-muted">
              {loading && employees.length === 0 ? 'ກຳລັງໂຫຼດ...' : placeholder}
            </span>
          )}
        </span>
      </button>

      {/* Clear selection button sits beside chevron (sibling, not nested inside trigger button) */}
      {showClearButton && (
        <button
          type="button"
          aria-label="ລ້າງການເລືອກພະນັກງານ"
          title="ລ້າງ"
          onClick={() => {
            onChange('');
            triggerRef.current?.focus();
          }}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-fg"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Chevron indicator matching select.input */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gold transition-transform ${
          open ? 'rotate-180' : ''
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>

      {open && (
        <div
          className="menu-panel absolute left-0 right-0 top-full z-40 mt-1.5 p-2 shadow-xl"
        >
          {/* Search box */}
          <div className="relative mb-1.5">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="input h-9 w-full pl-9 pr-8 text-sm"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              aria-label="ຄົ້ນຫາຊື່ພະນັກງານ"
            />
            {query && (
              <button
                type="button"
                aria-label="ລ້າງຄຳຄົ້ນຫາ"
                onClick={() => {
                  setQuery('');
                  setActiveIndex(0);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Search summary when filtering */}
          {query.trim() && employees.length > 0 && (
            <div className="px-2 pb-1 text-[11px] text-muted">
              ພົບ {filtered.length} / {employees.length} ຄົນ
            </div>
          )}

          {/* Options list */}
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="ລາຍຊື່ພະນັກງານຮັບ"
            className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5"
          >
            {hasLegacyValue && (!query.trim() || value.toLowerCase().includes(query.trim().toLowerCase())) && (
              <button
                type="button"
                role="option"
                aria-selected={true}
                onClick={() => selectEmployee(value)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-gold-tint px-2.5 py-2 text-left text-sm"
              >
                <span className="min-w-0 truncate font-medium text-fg">
                  {value} <span className="text-xs text-muted">(ຂໍ້ມູນເກົ່າ)</span>
                </span>
                <svg className="h-4 w-4 shrink-0 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="m5 12 5 5L20 7" />
                </svg>
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted">
                {employees.length === 0 ? (
                  'ຍັງບໍ່ມີຂໍ້ມູນພະນັກງານ'
                ) : (
                  <div className="space-y-1.5">
                    <div>ບໍ່ພົບພະນັກງານທີ່ຕົງກັບ &ldquo;{query.trim()}&rdquo;</div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="text-gold underline-offset-2 hover:underline"
                    >
                      ສະແດງທັງໝົດ
                    </button>
                  </div>
                )}
              </div>
            ) : (
              filtered.map((emp, idx) => {
                const isSelected = emp.fullName === value;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-option-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectEmployee(emp.fullName)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-gold-tint text-fg'
                        : isActive
                          ? 'bg-[var(--row-hover)] text-fg'
                          : 'text-fg hover:bg-[var(--row-hover)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{emp.fullName}</div>
                      {(emp.branch || emp.position) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          {emp.branch && <span>ສາຂາ: {emp.branch.nameLo}</span>}
                          {emp.position && <span>· {emp.position}</span>}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <svg className="h-4 w-4 shrink-0 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
