'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
import { formatMoney, formatDate } from '@/lib/format';
import { NumberInput } from './number-input';
import { PageHead } from './page-head';
import { StatCard } from './stat-card';

interface Total { currency: 'LAK' | 'THB' | 'USD'; opening: string; increases: string; decreases: string; net: string }
interface PartnerRow {
  partnerId: string; partnerCode: string; partnerNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  broughtForward: string; increases: string; decreases: string; current: string;
}
interface HistoryRow {
  id: string; businessDate: string; refType: string; currency: string;
  amountIn: string; amountOut: string; balance: string; note: string | null;
  partner: { nameLo: string } | null;
  category: { nameLo: string } | null;
}
interface Partner { id: string; nameLo: string }
interface Category { id: string; nameLo: string }
interface Bank { id: string; nameLo: string }

/**
 * TOR §9.3 / §9.4 — Module AR (Cash) and Module AP (Cash).
 *
 * The updated TOR gives each side its own window, but they are structurally
 * identical: totals, a per-Supplier table with a Payment button, and history.
 * One parameterised component rather than two near-copies.
 */
export function ApArCashModule({
  side,
  titleLo,
  descriptionLo,
}: {
  side: 'AP' | 'AR';
  titleLo: string;
  descriptionLo: string;
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [settling, setSettling] = useState<PartnerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');

  const { data: totals = [] } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'totals'],
    queryFn: () => api.get<Total[]>(`/finance/ap-ar/${side}/totals`),
  });
  const { data: partnerRows = [], isError: partnersFailed, error: partnersError, refetch: refetchPartners } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'partners'],
    queryFn: () => api.get<PartnerRow[]>(`/finance/ap-ar/${side}/partners`),
  });
  const { data: history = [], isError: historyFailed, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'history'],
    queryFn: () => api.get<HistoryRow[]>(`/finance/ap-ar/${side}/history`),
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['finance', 'ap-ar-categories', side],
    queryFn: () => api.get<Category[]>(`/finance/ap-ar/categories?side=${side}`),
  });
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['finance', 'ap-ar', side] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
  };

  const add = useMutation({
    mutationFn: () =>
      api.post(`/finance/ap-ar/${side}/entries`, {
        partnerId, categoryId, currency,
        amount: amount.replace(/,/g, '').trim(),
        note: note || undefined,
      }),
    onSuccess: () => {
      setShowAdd(false); setAmount(''); setNote(''); setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ'),
  });

  const settle = useMutation({
    mutationFn: (row: PartnerRow) =>
      api.post(`/finance/ap-ar/${side}/settle`, {
        partnerId: row.partnerId,
        currency: row.currency,
        method,
        bankAccountId: method === 'BANK' ? bankAccountId : undefined,
        amount: amount.replace(/,/g, '').trim(),
      }),
    onSuccess: () => {
      setSettling(null); setAmount(''); setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ຊຳຣະບໍ່ສຳເລັດ'),
  });

  return (
    <div className="space-y-6">
      <PageHead
        title={titleLo}
        subtitle={descriptionLo}
        actions={
          <button className="btn-primary" aria-expanded={showAdd}
            onClick={() => { setShowAdd((v) => !v); setSettling(null); }}>
            + Add {side} Cash
          </button>
        }
      />

      {error && (
        <div id="apar-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {showAdd && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">ເພີ່ມລາຍການ {side} (Cash)</h2>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="label" htmlFor="partner">Supplier</label>
              <select id="partner" className="input" value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">— ເລືອກ Supplier —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.nameLo}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cat">ປະເພດລາຍການ</label>
              <select id="cat" className="input" value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— ເລືອກປະເພດ —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nameLo}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cur">ສະກຸນເງິນ</label>
              <select id="cur" className="input" value={currency}
                onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}>
                <option value="LAK">LAK</option>
                <option value="THB">THB</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="amt">ຈຳນວນເງິນ</label>
              <NumberInput id="amt" className="input num" decimals={currency === 'LAK' ? 0 : 2} aria-describedby={error ? 'apar-error' : undefined} value={amount}
                onValueChange={setAmount} />
            </div>
            <div>
              <label className="label" htmlFor="note">Note</label>
              <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary"
              disabled={!partnerId || !categoryId || !amount.trim() || add.isPending}
              onClick={() => add.mutate()}>
              {add.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        {totals.map((t) => (
          <StatCard
            key={t.currency}
            label={`ຍອດລວມ ${side} (Cash) — ${t.currency}`}
            value={formatMoney(t.net)}
            sub={`ຍົກມາ ${formatMoney(t.opening)} · (+) ${formatMoney(t.increases)} · (−) ${formatMoney(t.decreases)}`}
          />
        ))}
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ແຍກຕາມ Supplier</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ແຍກຕາມ Supplier">
          <table className="table">
            <thead>
              <tr>
                <th>ແຫຼ່ງ Supplier</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຍອດຍົກມາ</th>
                <th className="text-right">(+)</th>
                <th className="text-right">(−)</th>
                <th className="text-right">ຍອດປັດຈຸບັນ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={7}
                isError={partnersFailed}
                error={partnersError}
                isEmpty={partnerRows.length === 0}
                emptyText="ຍັງບໍ່ມີຍອດຄ້າງ"
                onRetry={() => void refetchPartners()}
              />
              {partnerRows.map((row) => (
                <tr key={`${row.partnerId}-${row.currency}`}>
                  <td className="font-medium">{row.partnerNameLo}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right">{formatMoney(row.broughtForward)}</td>
                  <td className="num text-right text-success">{formatMoney(row.increases)}</td>
                  <td className="num text-right text-danger">{formatMoney(row.decreases)}</td>
                  <td className="num text-right font-semibold">{formatMoney(row.current)}</td>
                  <td className="text-right">
                    {settling?.partnerId === row.partnerId && settling.currency === row.currency ? (
                      <div className="flex items-center justify-end gap-2">
                        <select className="input w-24" aria-label="Payment" value={method}
                          onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')}>
                          <option value="CASH">Cash</option>
                          <option value="BANK">Bank</option>
                        </select>
                        {method === 'BANK' && (
                          <select className="input w-32" aria-label="ທະນາຄານ" value={bankAccountId}
                            onChange={(e) => setBankAccountId(e.target.value)}>
                            <option value="">ທະນາຄານ</option>
                            {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
                          </select>
                        )}
                        <NumberInput className="input num w-32 text-right" decimals={row.currency === 'LAK' ? 0 : 2} aria-label="ຈຳນວນເງິນ" aria-describedby={error ? 'apar-error' : undefined}
                          placeholder={row.current} value={amount}
                          onValueChange={setAmount} autoFocus />
                        <button className="btn-ghost"
                          onClick={() => settle.mutate(row)} disabled={settle.isPending || !amount.trim()}>
                          ຢືນຢັນ
                        </button>
                        <button className="btn-ghost !text-muted"
                          onClick={() => setSettling(null)}>
                          ຍົກເລີກ
                        </button>
                      </div>
                    ) : (
                      <button className="btn-ghost"
                        onClick={() => { setSettling(row); setAmount(''); setShowAdd(false); }}>
                        Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History {side} (Cash)</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`History ${side} (Cash)`}>
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງ Supplier</th>
                <th>ປະເພດລາຍການ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">(+)</th>
                <th className="text-right">(−)</th>
                <th className="text-right">ຍອດສະສົມ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={9}
                isError={historyFailed}
                error={historyError}
                isEmpty={history.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void refetchHistory()}
              />
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partner?.nameLo ?? '—'}</td>
                  <td>{row.category?.nameLo ?? '—'}</td>
                  <td className="text-muted">{row.refType}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right text-success">{formatMoney(row.amountIn)}</td>
                  <td className="num text-right text-danger">{formatMoney(row.amountOut)}</td>
                  <td className="num text-right font-medium">{formatMoney(row.balance)}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
