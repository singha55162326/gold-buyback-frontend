'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { BankBalanceCards } from '@/components/bank-balance-cards';
import type { PagedResult } from '@/components/date-range';

interface BankBalance {
  bankAccountId: string; bankCode: string; bankNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string; outflow: string; actual: string;
}
interface Row {
  id: string; type: string; currency: string; amount: string;
  refType: string | null; note: string | null; createdAt: string;
  bankAccount: { nameLo: string };
  /** ຜູ້ບັນທຶກທຸລະກຳນີ້. */
  createdBy: string;
}

/**
 * TOR §4.1 — Module Bank for the cashier.
 *
 * Read-only by design: the cashier needs to see what is actually in the bank
 * to reconcile the counter, but posting bank entries and setting ເງິນ Bank
 * ສຸດທິ belong to the Financial Controller and Admin respectively.
 */
export default function PaymentBankPage() {
  const { data: balances = [], isError: balancesFailed, error: balancesError, refetch: refetchBalances } = useQuery({
    queryKey: ['cash', 'bank', 'balances', 'counter'],
    // ໜ້ານີ້ນັບສະເພາະເງິນໜ້າຮ້ານ: Buyback / ປ່ຽນເປັນເງິນ / ສິນເຊື່ອ.
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances?sources=counter'),
  });
  const { data: rows = [], isError: rowsFailed, error: rowsError, refetch: refetchRows } = useQuery({
    queryKey: ['cash', 'bank', 'history', 'counter'],
    queryFn: () => api.get<PagedResult<Row>>('/cash/bank/history?sources=counter').then((r) => r.rows),
  });

  const banks = [...new Set(balances.map((b) => b.bankNameLo))];

  return (
    <div className="space-y-6">
      <PageHead
        title="Bank (To Day)"
        subtitle="ຍອດເງິນຕົວຈິງໃນ Bank ແຍກຕາມທະນາຄານ ແລະ ສະກຸນເງິນ (TOR §4.1)"
      />

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຍອດ Bank ຕົວຈິງ</h2>
          <span className="text-xs text-muted">ອ່ານຢ່າງດຽວ</span>
        </div>
        {balancesFailed ? (
          <QueryErrorNotice error={balancesError} onRetry={() => void refetchBalances()} />
        ) : (
          /* The same cards as Module Bank. Read-only, and without the
             variance — that is the Financial Controller's reconciliation,
             not something the cashier acts on. */
          <BankBalanceCards rows={balances} showVariance={false} />
        )}
        {banks.length > 0 && (
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            {banks.join(' · ')} — ເງິນ Bank ສຸດທິ ແລະ ຍອດຂາດດຸນ ເບິ່ງໄດ້ທີ່ Module Bank (Admin)
          </p>
        )}
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History ທຸລະກຳ Bank ໃນມື້</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ທຸລະກຳ Bank ໃນມື້">
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
              <TableStateRow colSpan={8} isError={rowsFailed} error={rowsError} isEmpty={rows.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchRows()} />
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.bankAccount.nameLo}</td>
                  <td className="text-muted">{row.type}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatByCurrency(row.amount, row.currency)}</td>
                  <td className="text-muted">{row.refType ?? '—'}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                  <td className="text-muted">{row.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
