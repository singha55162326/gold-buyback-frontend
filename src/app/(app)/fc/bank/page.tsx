'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { Dialog } from '@/components/dialog';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { BankBalanceCards } from '@/components/bank-balance-cards';
import { NumberInput } from '@/components/number-input';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Pagination, usePagination } from '@/components/pagination';
import { clean, isPositive } from '@/lib/validate';

interface BankBalance {
  bankAccountId: string; bankCode: string; bankNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string; outflow: string; actual: string;
  net: string | null; variance: string | null;
}
interface Bank { id: string; nameLo: string }
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

/**
 * TOR §3.7 — Module Bank (To Day).
 *
 * ຍອດເງິນຂາດດຸນ = ຍອດຕົວຈິງ − ຍອດສຸດທິ. A non-zero variance is the shop's
 * signal that the ledger and the bank statement have diverged, so it is
 * surfaced rather than reconciled away. Only Admin/Manager may set ຍອດສຸດທິ.
 */
export default function FcBankPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const user = getStoredUser();
  const canSetNet = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [bankAccountId, setBankAccountId] = useState('');
  // INCOME / EXPENSE are posted by ຈັດການລາຍຮັບລາຍຈ່າຍ, which files them
  // against a category; entering them here produced bank rows no report
  // could account for.
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  // ບັນທຶກທຸລະກຳຜ່ານ Modal ຕາມທີ່ລູກຄ້າຂໍ — ໜ້າຈໍຫຼັກຈຶ່ງເຫຼືອແຕ່ຍອດ ແລະ ປະຫວັດ.
  const [showForm, setShowForm] = useState(false);
  const [editingNet, setEditingNet] = useState<string | null>(null);
  const [netAmount, setNetAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [netError, setNetError] = useState<string | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const balances = balancesQuery.data ?? [];

  const banksQuery = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const banks = banksQuery.data ?? [];

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Row>(['cash', 'bank', 'history'], '/cash/bank/history', {
    refetchInterval: 30_000,
  });
  const rows = history.rows;
  const pager = usePagination(rows);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
  };

  const handleOpenForm = () => {
    setFormError(null);
    setAmount('');
    setNote('');
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setFormError(null);
    setAmount('');
    setNote('');
    setShowForm(false);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/cash/bank/transactions', {
        bankAccountId, type, currency,
        amount: amount.replace(/,/g, '').trim(), note: note || undefined,
      }),
    onSuccess: () => {
      setAmount('');
      setNote('');
      setFormError(null);
      setShowForm(false);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setFormError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const selectedBalance = balances.find(
    (b) => b.bankAccountId === bankAccountId && b.currency === currency,
  );
  const currentActual = Number(clean(selectedBalance?.actual ?? '0'));
  const requestedAmount = Number(clean(amount || '0'));
  const isInsufficient =
    type === 'WITHDRAW' && Boolean(bankAccountId) && isPositive(amount) && requestedAmount > currentActual;

  const isNetValid = netAmount.trim() !== '' && !Number.isNaN(Number(netAmount.replace(/,/g, '')));

  const setNet = useMutation({
    // Only the key matters here, so the parameter asks for the key rather
    // than a whole balance row — which lets the cards pass theirs straight in.
    mutationFn: (row: Pick<BankBalance, 'bankAccountId' | 'currency'>) =>
      api.post('/cash/bank/net-balance', {
        bankAccountId: row.bankAccountId,
        currency: row.currency,
        netAmount: netAmount.replace(/,/g, '').trim(),
      }),
    onSuccess: () => {
      setEditingNet(null);
      setNetAmount('');
      setNetError(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setNetError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="Module Bank"
        subtitle="ຍອດ Bank ຕົວຈິງ ແຍກຕາມທະນາຄານ ແລະ ສະກຸນເງິນ · ຍອດເງິນຂາດດຸນ (TOR §3.7)"
        actions={
          <button className="btn-primary" onClick={handleOpenForm}>
            + ບັນທຶກທຸລະກຳ Bank
          </button>
        }
      />

      {banksQuery.isError && (
        <QueryErrorNotice error={banksQuery.error} onRetry={() => void banksQuery.refetch()} />
      )}

      {netError && (
        <div id="bank-net-error" role="alert" className="notice status-danger">{netError}</div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຍອດ Bank (To Day)</h2>
          {!canSetNet && (
            <span className="text-xs text-muted">ເງິນ Bank ສຸດທິ ແກ້ໄຂໄດ້ສະເພາະ Admin & Manager</span>
          )}
        </div>
        {balancesQuery.isError ? (
          <QueryErrorNotice error={balancesQuery.error} onRetry={() => void balancesQuery.refetch()} />
        ) : (
          <BankBalanceCards
            rows={balances}
            renderNet={(row) => {
              const key = `${row.bankAccountId}-${row.currency}`;
              if (editingNet === key) {
                return (
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <NumberInput
                      className="input num w-28 text-right"
                      decimals={row.currency === 'LAK' ? 0 : 2}
                      aria-label={`ເງິນ Bank ສຸດທິ ${row.bankNameLo} ${row.currency}`}
                      aria-describedby={netError ? 'bank-net-error' : undefined}
                      value={netAmount}
                      onValueChange={setNetAmount}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && isNetValid && !setNet.isPending) {
                          setNet.mutate(row);
                        } else if (e.key === 'Escape') {
                          setEditingNet(null);
                          setNetError(null);
                        }
                      }}
                      autoFocus
                    />
                    <button
                      className="btn-primary"
                      onClick={() => setNet.mutate(row)}
                      disabled={!isNetValid || setNet.isPending}
                    >
                      ບັນທຶກ
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setEditingNet(null);
                        setNetError(null);
                      }}
                    >
                      ຍົກເລີກ
                    </button>
                  </span>
                );
              }
              if (!canSetNet) return formatByCurrency(row.net, row.currency);
              return (
                <button
                  className="btn-ghost"
                  aria-label={`${row.net === null ? 'ຕັ້ງຄ່າ' : formatByCurrency(row.net, row.currency)} ${row.bankNameLo} ${row.currency}`}
                  onClick={() => {
                    setEditingNet(key);
                    setNetAmount(row.net ?? '');
                    setNetError(null);
                  }}
                >
                  {row.net === null ? 'ຕັ້ງຄ່າ' : formatByCurrency(row.net, row.currency)}
                </button>
              );
            }}
          />
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={handleCloseForm}
        title="ບັນທຶກທຸລະກຳ Bank"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={handleCloseForm} disabled={create.isPending}>
              ຍົກເລີກ
            </button>
            <button
              className="btn-primary"
              disabled={!bankAccountId || !isPositive(amount) || isInsufficient || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="bank">ທະນາຄານ</label>
            <select
              id="bank"
              className="input"
              value={bankAccountId}
              disabled={create.isPending}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">— ເລືອກ —</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="type">ປະເພດ</label>
            <select
              id="type"
              className="input"
              value={type}
              disabled={create.isPending}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="DEPOSIT">ຝາກ (Deposit)</option>
              <option value="WITHDRAW">ຖອນ (Withdraw)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cur">ສະກຸນເງິນ</label>
            <select
              id="cur"
              className="input"
              value={currency}
              disabled={create.isPending}
              onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}
            >
              <option value="LAK">LAK</option>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="amt">ຈຳນວນເງິນ</label>
              {bankAccountId && (
                <span className="text-xs text-muted">
                  ຍອດຄົງເຫຼືອ:{' '}
                  <strong className="num text-fg-strong">
                    {formatByCurrency(selectedBalance?.actual ?? '0', currency)}
                  </strong>
                </span>
              )}
            </div>
            <NumberInput
              id="amt"
              className="input num"
              decimals={currency === 'LAK' ? 0 : 2}
              aria-describedby={formError || isInsufficient ? 'bank-form-error' : undefined}
              value={amount}
              disabled={create.isPending}
              onValueChange={setAmount}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="note">Note</label>
            <input
              id="note"
              className="input"
              value={note}
              disabled={create.isPending}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {isInsufficient && (
          <div role="alert" className="notice status-danger mt-3">
            ຍອດເງິນໃນບັນຊີບໍ່ພໍສຳລັບການຖອນ (ມີເຫຼືອ {formatByCurrency(selectedBalance?.actual ?? '0', currency)}, ຕ້ອງການຖອນ {formatByCurrency(clean(amount), currency)})
          </div>
        )}

        {formError && (
          <div id="bank-form-error" role="alert" className="notice status-danger mt-3">
            {formError}
          </div>
        )}
      </Dialog>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Bank</h2></div>
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
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
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
