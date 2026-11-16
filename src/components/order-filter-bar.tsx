'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { canPickDates, type HistoryRangeState } from './date-range';
import { ORDER_SEARCH_PLACEHOLDER } from './time-search-filter';

/**
 * ຈັດການຄຳຄົ້ນຫາ (ພ້ອມ debounce 250ms) ສຳລັບໜ້າ ລາຍການ Order ແລະ ປະຫວັດ Module Advance.
 */
export function useOrderSearchFilter(initialSearch = '') {
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

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    setSearchImmediate,
    clearSearch,
    hasActiveFilter: Boolean(searchTerm.trim()),
  };
}

export type OrderSearchFilterState = ReturnType<typeof useOrderSearchFilter>;

interface OrderFilterBarProps<T> {
  history: HistoryRangeState<T>;
  search: OrderSearchFilterState;
  statusSlot?: ReactNode;
  searchPlaceholder?: string;
}

/**
 * ແຖບກອງຂໍ້ມູນແບບລວມສູນ (ວັນທີ · ສະຖານະ · ຄົ້ນຫາ) ໂດຍບໍ່ມີຕົວກອງເວລາ.
 * ຈັດກຸ່ມຊັດເຈນ ເພື່ອໃຫ້ອ່ານງ່າຍ ແລະ ໃຊ້ງານສະດວກທັງ Desktop ແລະ Mobile.
 */
export function OrderFilterBar<T>({
  history,
  search,
  statusSlot,
  searchPlaceholder = ORDER_SEARCH_PLACEHOLDER,
}: OrderFilterBarProps<T>) {
  const allowDates = canPickDates();
  const dirty = history.draftFrom !== history.from || history.draftTo !== history.to;

  return (
    <div className="border-b border-line bg-recessed px-4 py-3.5 sm:px-5 space-y-2.5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* ກຸ່ມຕົວກອງດ້ານຊ້າຍ: ວັນທີ + ສະຖານະ (ຖ້າມີ) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {allowDates ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="filter-select-label inline-flex items-center gap-1.5">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[var(--gold-icon)] shrink-0"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>ວັນທີ</span>
              </span>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  className="filter-date"
                  type="date"
                  value={history.draftFrom}
                  max={history.draftTo || undefined}
                  onChange={(e) => history.setDraftFrom(e.target.value)}
                  aria-label="ຈາກວັນທີ"
                />
                <span className="filter-sep text-xs" aria-hidden="true">–</span>
                <input
                  className="filter-date"
                  type="date"
                  value={history.draftTo}
                  min={history.draftFrom || undefined}
                  onChange={(e) => history.setDraftTo(e.target.value)}
                  aria-label="ຫາວັນທີ"
                />
              </div>

              <button
                type="button"
                className="btn-secondary h-[38px] px-3.5 py-0 text-xs font-semibold cursor-pointer"
                onClick={history.apply}
                disabled={!dirty || !history.canApply || history.isFetching}
              >
                ຄົ້ນຫາ
              </button>

              {!history.isToday && (
                <button
                  type="button"
                  className="filter-clear cursor-pointer text-xs"
                  onClick={history.reset}
                >
                  ລ້າງວັນທີ
                </button>
              )}
            </div>
          ) : (
            <span className="filter-select-label">ສະແດງສະເພາະລາຍການພາຍໃນມື້ນີ້</span>
          )}

          {statusSlot && (
            <>
              <span className="hidden sm:inline-block h-6 w-px bg-line" aria-hidden="true" />
              {statusSlot}
            </>
          )}
        </div>

        {/* ກຸ່ມຄົ້ນຫາດ້ານຂວາ */}
        <div className="flex w-full items-center gap-2 xl:w-auto xl:min-w-[340px] xl:max-w-[400px]">
          <div className="relative flex-1">
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
              className="filter-date w-full pl-9 pr-3"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={search.searchTerm}
              onChange={(e) => search.setSearchTerm(e.target.value)}
            />
          </div>
          {search.searchTerm && (
            <button
              type="button"
              className="filter-clear cursor-pointer text-xs shrink-0"
              onClick={search.clearSearch}
            >
              ລ້າງ
            </button>
          )}
        </div>
      </div>

      {/* ແຖວແຈ້ງເຕືອນສະຖານະການໂຫຼດ ຫຼື ຂອບເຂດວັນທີ */}
      {(history.problem || history.truncated || history.isFetching) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {history.problem && (
              <span className="font-medium text-warning">{history.problem}</span>
            )}
            {history.truncated && (
              <span className="font-medium text-warning">
                ເກີນ {history.maxRows.toLocaleString('en-US')} ແຖວ — ແຄບຊ່ວງວັນທີລົງ
              </span>
            )}
          </div>
          {history.isFetching && (
            <span className="text-muted">ກຳລັງໂຫຼດ...</span>
          )}
        </div>
      )}
    </div>
  );
}
