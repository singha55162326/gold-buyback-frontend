'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { TimeRangePicker } from './time-range-picker';

export const ORDER_SEARCH_PLACEHOLDER =
  'ຄົ້ນຫາ ເບີໂທລູກຄ້າ / ເລກບິນ / ຊື່ພະນັກງານຮັບ...';

export function useTimeSearchFilter(initialSearch = '') {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setDebouncedSearch('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const setSearchImmediate = useCallback((value: string) => {
    setSearchTerm(value);
    setDebouncedSearch(value.trim());
  }, []);

  const setTimeRange = useCallback((start: string, end: string) => {
    setStartTime(start);
    setEndTime(end);
  }, []);

  const clearTime = useCallback(() => {
    setStartTime('');
    setEndTime('');
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
  }, []);

  return {
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    setTimeRange,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    setSearchImmediate,
    clearTime,
    clearSearch,
    hasActiveFilter: Boolean(startTime || endTime || searchTerm.trim()),
  };
}

export type TimeSearchFilterState = ReturnType<typeof useTimeSearchFilter>;

/**
 * ກວດວ່າຊ່ວງເວລາ start - end ສອດຄ່ອງກັບວັນທີທີ່ເລືອກຢູ່ (ຄືນຄຳເຕືອນຖ້າ start > end ພາຍໃນມື້ດຽວ).
 */
export function getTimeRangeProblem(
  fromDate: string | undefined,
  toDate: string | undefined,
  startTime: string,
  endTime: string,
): string | null {
  if (!startTime || !endTime) return null;
  if (fromDate && toDate && `${fromDate}T${startTime}` > `${toDate}T${endTime}`) {
    return 'ເວລາເລີ່ມຕົ້ນ ຕ້ອງບໍ່ຫຼັງ ເວລາສິ້ນສຸດ';
  }
  return null;
}

/** ກອງ client-side ທັນທີລະຫວ່າງ debounce ໃຫ້ກົງກັບ backend search filter. */
export function matchesOrderSearch(
  target: {
    code?: string | null;
    billNo?: string | null;
    staffName?: string | null;
    phone?: string | null;
    supplierNameLo?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (target.phone ?? '').toLowerCase().includes(q) ||
    (target.billNo ?? '').toLowerCase().includes(q) ||
    (target.staffName ?? '').toLowerCase().includes(q) ||
    (target.code ?? '').toLowerCase().includes(q) ||
    (target.supplierNameLo ?? '').toLowerCase().includes(q)
  );
}

interface TimeSearchFilterBarProps {
  filter: TimeSearchFilterState;
  fromDate?: string;
  toDate?: string;
  leftSlot?: ReactNode;
  searchPlaceholder?: string;
}

/**
 * ແຖບກອງ Start time - End time ແລະ ຊ່ອງຄົ້ນຫາ (ເບີໂທລູກຄ້າ / ເລກບິນ / ຊື່ພະນັກງານຮັບ)
 * ສຳລັບໜ້າ ລາຍການ Order ແລະ ປະຫວັດ Module Advance.
 */
export function TimeSearchFilterBar({
  filter,
  fromDate,
  toDate,
  leftSlot,
  searchPlaceholder = ORDER_SEARCH_PLACEHOLDER,
}: TimeSearchFilterBarProps) {
  const timeProblem = getTimeRangeProblem(
    fromDate,
    toDate,
    filter.startTime,
    filter.endTime,
  );

  return (
    <div className="filter-bar">
      <div className="filter-dates gap-x-4 gap-y-2">
        {leftSlot}
        <div className="flex flex-wrap items-center gap-2">
          <span className="filter-select-label">ເວລາ</span>
          <TimeRangePicker
            startTime={filter.startTime}
            endTime={filter.endTime}
            fromDate={fromDate}
            toDate={toDate}
            onApply={filter.setTimeRange}
          />
          {timeProblem && (
            <span className="text-xs font-medium text-warning">{timeProblem}</span>
          )}
        </div>
      </div>

      <div className="filter-tail w-full lg:w-auto">
        <div className="relative flex-1 sm:w-80">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gold-icon)]"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="filter-date w-full pl-9"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={filter.searchTerm}
            onChange={(e) => filter.setSearchTerm(e.target.value)}
          />
        </div>
        {filter.searchTerm && (
          <button type="button" className="filter-clear" onClick={filter.clearSearch}>
            ລ້າງ
          </button>
        )}
      </div>
    </div>
  );
}

