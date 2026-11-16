'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { BankBalanceCards } from '@/components/bank-balance-cards';
import { BankSummaryDashboard, type BankCurrencyFilter } from '@/components/bank-summary-dashboard';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Pagination, usePagination } from '@/components/pagination';

interface BankBalance {
  bankAccountId: string; bankCode: string; bankNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string; outflow: string; actual: string;
  net: string | null; variance: string | null;
}
interface Row {
  id: string; type: string; currency: string; amount: string;
  refType: string | null;
  note: string | null; createdAt: string; bankAccount: { nameLo: string };
  /** ຜູ້ລົງລາຍການ — ມາຈາກ API. */
  createdBy: string;
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'ຝາກ',
  WITHDRAW: 'ຖອນ',
  INCOME: 'ລາຍຮັບ',
  EXPENSE: 'ລາຍຈ່າຍ',
};

const CURRENCY_TABS: Array<{ value: BankCurrencyFilter; label: string }> = [
  { value: 'ALL', label: 'ທັງໝົດ' },
  { value: 'LAK', label: 'LAK' },
  { value: 'THB', label: 'THB' },
  { value: 'USD', label: 'USD' },
];

/**
 * TOR §3.7 — Module Bank (To Day).
 *
 * ຍອດເງິນຂາດດຸນ = ຍອດຕົວຈິງ − ຍອດສຸດທິ. A non-zero variance is the shop's
 * signal that the ledger and the bank statement have diverged, so it is
 * surfaced rather than reconciled away.
 */
export default function FcBankPage() {
  const [currencyFilter, setCurrencyFilter] = useState<BankCurrencyFilter>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const balances = balancesQuery.data ?? [];

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Row>(['cash', 'bank', 'history'], '/cash/bank/history', {
    refetchInterval: 30_000,
  });

  const filteredRows = useMemo(() => {
    return history.rows.filter((row) => {
      if (currencyFilter !== 'ALL' && row.currency !== currencyFilter) return false;
      if (selectedBank && row.bankAccount?.nameLo !== selectedBank) return false;
      return true;
    });
  }, [history.rows, currencyFilter, selectedBank]);

  const pager = usePagination(filteredRows);

  const hasFilters = currencyFilter !== 'ALL' || selectedBank !== null;

  const handleSelectCurrency = (next: BankCurrencyFilter) => {
    setCurrencyFilter(next);
    pager.reset();
  };

  const handleSelectBank = (bankNameLo: string | null) => {
    setSelectedBank(bankNameLo);
    pager.reset();
  };

  const handleClearFilters = () => {
    setCurrencyFilter('ALL');
    setSelectedBank(null);
    pager.reset();
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Module Bank"
        subtitle="ຍອດ Bank ຕົວຈິງ ແຍກຕາມທະນາຄານ ແລະ ສະກຸນເງິນ · ຍອດເງິນຂາດດຸນ (TOR §3.7)"
      />

      {!balancesQuery.isError && (
        <BankSummaryDashboard
          rows={balances}
          isLoading={balancesQuery.isLoading}
          activeCurrency={currencyFilter}
          onSelectCurrency={handleSelectCurrency}
        />
      )}

      <div data-fade className="card">
        <div className="card-header flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="card-title">ຍອດ Bank (To Day)</h2>
            {selectedBank && (
              <span className="badge bg-gold-tint text-gold">
                {selectedBank}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="seg" role="tablist" aria-label="ກັ່ນຕອງຕາມສະກຸນເງິນ">
              {CURRENCY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={currencyFilter === tab.value}
                  onClick={() => handleSelectCurrency(tab.value)}
                  className="seg-btn cursor-pointer"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="seg" role="tablist" aria-label="ຮູບແບບການສະແດງຜົນ">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'cards'}
                aria-label="ສະແດງແບບກາດ"
                onClick={() => setViewMode('cards')}
                className="seg-btn cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </svg>
                <span className="hidden sm:inline">ກາດ</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                aria-label="ສະແດງແບບຕາຕະລາງ"
                onClick={() => setViewMode('table')}
                className="seg-btn cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M3 10h18M3 14h18M9 4v16M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"
                  />
                </svg>
                <span className="hidden sm:inline">ຕາຕະລາງ</span>
              </button>
            </div>
          </div>
        </div>

        {balancesQuery.isError ? (
          <QueryErrorNotice error={balancesQuery.error} onRetry={() => void balancesQuery.refetch()} />
        ) : (
          <BankBalanceCards
            rows={balances}
            currencyFilter={currencyFilter}
            viewMode={viewMode}
            selectedBank={selectedBank}
            onSelectBank={handleSelectBank}
            renderNet={(row) => formatByCurrency(row.net, row.currency)}
          />
        )}
      </div>

      <div data-fade className="card">
        <div className="card-header flex-wrap gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="card-title">ປະຫວັດ Bank</h2>
            {selectedBank && (
              <span className="badge bg-gold-tint text-gold">{selectedBank}</span>
            )}
            {currencyFilter !== 'ALL' && (
              <span className="badge bg-gold-tint text-gold">{currencyFilter}</span>
            )}
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="filter-clear cursor-pointer"
            >
              ລ້າງຕົວກັ່ນຕອງ
            </button>
          )}
        </div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Bank">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ທະນາຄານ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ອ້າງອີງ</th>
                <th>ໝາຍເຫດ</th>
                <th>ຜູ້ບັນທຶກ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={8}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={filteredRows.length === 0}
                emptyText={hasFilters ? 'ບໍ່ພົບລາຍການຕາມເງື່ອນໄຂທີ່ກັ່ນຕອງ' : 'ຍັງບໍ່ມີລາຍການ'}
                onRetry={() => history.refetch()}
              />
              {pager.pageItems.map((row) => {
                const isInflow = row.type === 'DEPOSIT' || row.type === 'INCOME';
                return (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{row.bankAccount?.nameLo ?? '—'}</td>
                    <td className="text-muted">{TYPE_LABEL[row.type] ?? row.type}</td>
                    <td>{row.currency}</td>
                    <td className={`num text-right font-medium ${isInflow ? 'text-success' : 'text-danger'}`}>
                      {isInflow ? '(+) ' : '(−) '}{formatByCurrency(row.amount, row.currency)}
                    </td>
                    <td className="text-muted">{row.refType ?? '—'}</td>
                    <td className="text-muted">{row.note ?? '—'}</td>
                    <td className="text-muted">{row.createdBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
