'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PageHead } from '@/components/page-head';
import { api } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
import { formatWeight, formatByCurrency } from '@/lib/format';
import { canPickDates, today } from '@/components/date-range';

interface BankItem {
  bankAccountId: string;
  bankCode: string;
  bankNameLo: string;
  amount: string;
}

interface BankAccountInfo {
  id: string;
  code: string;
  nameLo: string;
}

interface Coh {
  cash: Array<{
    currency: 'LAK' | 'THB' | 'USD';
    cash: string;
    bcel: string;
    ldb: string;
    otherBank: string;
    bankTotal?: string;
    banks?: BankItem[];
    ap: string;
    ar: string;
    advance: string;
    coh: string;
  }>;
  gold: { newG: string; oldG: string; apG: string; arG: string; cohG: string; cohBaht: string };
  bankAccounts?: BankAccountInfo[];
}

/** TOR §3.7 — COH Cash ແລະ COH Gold. */
export default function CohPage() {
  /*
   * COH ເປັນຍອດ "ຢູ່ເວລາໜຶ່ງ" ບໍ່ແມ່ນປະຫວັດ, ສະນັ້ນ filter ຈຶ່ງເປັນວັນທີດຽວ
   * (ຢູ່ວັນທີ...) ບໍ່ແມ່ນ ຈາກ–ຫາ: ຊ່ວງວັນທີຂອງຍອດຄົງເຫຼືອ ບໍ່ມີຄວາມໝາຍ.
   */
  const [draft, setDraft] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const isToday = asOf === today();

  /** รูปแบบที่ 2: View Mode Toggle ระหว่าง "ภาพรวม (Summary)" กับ "แยกธนาคาร (Detailed)" */
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['ledger', 'coh', asOf],
    queryFn: () => api.get<Coh>(isToday ? '/ledger/coh' : `/ledger/coh?as_of=${asOf}`),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (draft && draft !== asOf && !isFetching) {
      setAsOf(draft);
    }
  };

  const cashRows = data?.cash ?? [];

  // รายการบัญชีธนาคารทั้งหมด (Dynamic จาก API หากมี หรือ Fallback เป็น 3 ธนาคารมาตรฐาน)
  const bankAccounts: BankAccountInfo[] =
    data?.bankAccounts && data.bankAccounts.length > 0
      ? data.bankAccounts
      : [
          { id: 'bcel', code: 'BCEL', nameLo: 'BCEL' },
          { id: 'ldb', code: 'LDB', nameLo: 'LDB' },
          { id: 'other', code: 'OTHER_BANK', nameLo: 'ທະນາຄານອື່ນ' },
        ];

  const cashColSpan = viewMode === 'summary' ? 7 : 6 + bankAccounts.length;

  return (
    <div className="space-y-6">
      <PageHead
        title="COH — Cash & Gold On Hand"
        subtitle="ຍອດເງິນ ແລະ ຄຳທີ່ຖືຢູ່ຈິງ ຫຼັງຫັກ AP ແລະ ບວກ AR (TOR §3.7)"
      />

      {canPickDates() && (
        <form onSubmit={handleSearch} className="filter-bar">
          <div className="filter-dates">
            <span className="filter-select-label">ຢູ່ວັນທີ</span>
            <input
              className="filter-date"
              type="date"
              aria-label="ຢູ່ວັນທີ"
              value={draft}
              max={today()}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              className="btn-secondary h-9 py-0"
              disabled={!draft || draft === asOf || isFetching}
            >
              ຄົ້ນຫາ
            </button>
            {!isToday && (
              <button
                type="button"
                className="filter-clear"
                onClick={() => {
                  setDraft(today());
                  setAsOf(today());
                }}
              >
                ລ້າງ
              </button>
            )}
          </div>
          <div className="filter-tail">
            <span className="filter-note">
              {isFetching ? 'ກຳລັງໂຫຼດ...' : isToday ? 'ຍອດມື້ນີ້' : `ຍອດ ຢູ່ ${asOf}`}
            </span>
          </div>
        </form>
      )}

      {/* COH Cash Card */}
      <div data-fade className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 className="card-title">COH Cash</h2>

          {/* View Mode Toggle: Summary vs Detailed */}
          <div className="seg" role="tablist" aria-label="ມຸມມອງ COH Cash">
            <button
              type="button"
              role="tab"
              className="seg-btn"
              aria-selected={viewMode === 'summary'}
              onClick={() => setViewMode('summary')}
            >
              ພາບລວມ (Summary)
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn"
              aria-selected={viewMode === 'detailed'}
              onClick={() => setViewMode('detailed')}
            >
              ແຍກທະນາຄານ (Detailed)
              {bankAccounts.length > 0 && <span className="seg-count">{bankAccounts.length}</span>}
            </button>
          </div>
        </div>

        <div className="table-wrap" tabIndex={0} role="region" aria-label="COH Cash">
          <table className="table">
            <thead>
              {viewMode === 'summary' ? (
                /* โหมดสรุป: รวมยอดธนาคารเป็นคอลัมน์เดียว */
                <tr>
                  <th>ສະກຸນເງິນ</th>
                  <th className="text-right">ເງິນສົດ</th>
                  <th className="text-right">ລວມທະນາຄານ</th>
                  <th className="text-right">AP (−)</th>
                  <th className="text-right">AR (+)</th>
                  <th className="text-right">Advance (−)</th>
                  <th className="text-right">COH Cash</th>
                </tr>
              ) : (
                /* โหมดย่อย: แจกแจงทุกธนาคารที่มีในระบบแบบ Dynamic (พร้อม Sticky Columns ป้องกันเลื่อนหลุดจอ) */
                <tr>
                  <th className="sticky left-0 z-20 bg-[var(--surface-solid)] shadow-[1px_0_0_var(--line)]">
                    ສະກຸນເງິນ
                  </th>
                  <th className="text-right">ເງິນສົດ</th>
                  {bankAccounts.map((b) => (
                    <th key={b.id} className="text-right max-w-[140px] truncate" title={b.nameLo || b.code}>
                      {b.nameLo || b.code}
                    </th>
                  ))}
                  <th className="text-right">AP (−)</th>
                  <th className="text-right">AR (+)</th>
                  <th className="text-right">Advance (−)</th>
                  <th className="sticky right-0 z-20 bg-[var(--surface-solid)] text-right shadow-[-1px_0_0_var(--line)]">
                    COH Cash
                  </th>
                </tr>
              )}
            </thead>
            <tbody>
              <TableStateRow
                colSpan={cashColSpan}
                isLoading={isLoading}
                isError={isError}
                error={error}
                isEmpty={!isLoading && cashRows.length === 0}
                emptyText="ບໍ່ມີຂໍ້ມູນຍອດເງິນສົດ"
                onRetry={() => void refetch()}
              />
              {cashRows.map((row) => {
                const bankTotal =
                  row.bankTotal ??
                  String(Number(row.bcel || 0) + Number(row.ldb || 0) + Number(row.otherBank || 0));

                return (
                  <tr key={row.currency}>
                    <td
                      className={`font-medium ${
                        viewMode === 'detailed'
                          ? 'sticky left-0 z-10 bg-[var(--surface-solid)] shadow-[1px_0_0_var(--row-line)]'
                          : ''
                      }`}
                    >
                      {row.currency}
                    </td>
                    <td className="num text-right">{formatByCurrency(row.cash, row.currency)}</td>

                    {viewMode === 'summary' ? (
                      /* แสดงยอดรวมธนาคาร */
                      <td className="num text-right font-medium text-gold">
                        {formatByCurrency(bankTotal, row.currency)}
                      </td>
                    ) : (
                      /* แสดงยอดแยกแต่ละธนาคาร */
                      bankAccounts.map((b) => {
                        const bankAmt =
                          row.banks?.find((x) => x.bankAccountId === b.id)?.amount ??
                          (b.code === 'BCEL'
                            ? row.bcel
                            : b.code === 'LDB'
                              ? row.ldb
                              : row.otherBank);
                        return (
                          <td key={b.id} className="num text-right">
                            {formatByCurrency(bankAmt, row.currency)}
                          </td>
                        );
                      })
                    )}

                    <td className="num text-right text-danger">{formatByCurrency(row.ap, row.currency)}</td>
                    <td className="num text-right text-success">{formatByCurrency(row.ar, row.currency)}</td>
                    <td className="num text-right text-danger">{formatByCurrency(row.advance, row.currency)}</td>
                    <td
                      className={`num text-right font-semibold ${
                        viewMode === 'detailed'
                          ? 'sticky right-0 z-10 bg-[var(--surface-solid)] shadow-[-1px_0_0_var(--row-line)]'
                          : ''
                      } ${Number(row.coh) < 0 ? 'text-danger' : ''}`}
                    >
                      {formatByCurrency(row.coh, row.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          {viewMode === 'summary'
            ? 'COH Cash = Cash + Bank Total − AP + AR − Advance · ຍອດເງິນສົດ ແລະ ທະນາຄານ ເປັນຍອດສະສົມ (ຍົກມາຈາກມື້ກ່ອນ + ການເຄື່ອນໄຫວຂອງມື້ນີ້)'
            : 'COH Cash = Cash + (ທຸກທະນາຄານ) − AP + AR − Advance · ຍອດເງິນສົດ ແລະ ທະນາຄານ ເປັນຍອດສະສົມ (ຍົກມາຈາກມື້ກ່ອນ + ການເຄື່ອນໄຫວຂອງມື້ນີ້)'}
        </p>
      </div>

      {/* COH Gold Card */}
      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">COH Gold</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="COH Gold">
          <table className="table">
            <thead>
              <tr>
                <th className="text-right">ຄຳໃໝ່ (g)</th>
                <th className="text-right">ຄຳເກົ່າ (g)</th>
                <th className="text-right">AP (g)</th>
                <th className="text-right">AR (g)</th>
                <th className="text-right">COH Gold (g)</th>
                <th className="text-right">ບາດຄຳ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={6}
                isLoading={isLoading}
                isError={isError}
                error={error}
                isEmpty={!isLoading && !data?.gold}
                emptyText="ບໍ່ມີຂໍ້ມູນຍອດຄຳ"
                onRetry={() => void refetch()}
              />
              {data && (
                <tr>
                  <td className="num text-right">{formatWeight(data.gold.newG)}</td>
                  <td className="num text-right">{formatWeight(data.gold.oldG)}</td>
                  <td className="num text-right text-danger">{formatWeight(data.gold.apG)}</td>
                  <td className="num text-right text-success">{formatWeight(data.gold.arG)}</td>
                  <td className={`num text-right font-semibold ${Number(data.gold.cohG) < 0 ? 'text-danger' : ''}`}>
                    {formatWeight(data.gold.cohG)}
                  </td>
                  <td className={`num text-right ${Number(data.gold.cohBaht) < 0 ? 'text-danger' : ''}`}>
                    {formatWeight(data.gold.cohBaht)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          COH Gold = Gold NEW(g) + Gold OLD(g) − AP + AR
        </p>
      </div>
    </div>
  );
}
