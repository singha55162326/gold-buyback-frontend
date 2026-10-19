'use client';

import { Fragment, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatWeight, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { StatCard } from '@/components/stat-card';

interface Line { nameLo: string; weightG: string; quantity: number }
interface Row {
  id: string; code: string; billId: string; customerName: string; staffName: string;
  totalWeightG: string; totalQuantity: number; status: 'HELD' | 'RETURNED';
  createdAt: string; customer: { phone: string }; lines: Array<Line & { id: string }>;
}
interface Payload { rows: Row[]; totals: { totalWeightG: string; totalQuantity: number; billCount: number } }

/**
 * TOR §3.7 — Module ຝາກສິນຄ້າ.
 *
 * Gold held for a customer. It is deliberately kept out of Stock, WAC and
 * COH Gold: the shop holds it but does not own it.
 */
export default function ConsignmentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [billId, setBillId] = useState('');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [staffName, setStaffName] = useState('');
  const [lines, setLines] = useState<Line[]>([{ nameLo: '', weightG: '', quantity: 1 }]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['finance', 'consignments'],
    queryFn: () => api.get<Payload>('/finance/consignments'),
  });
  const data = query.data;

  const create = useMutation({
    mutationFn: () =>
      api.post('/finance/consignments', {
        billId, phone, customerName, staffName,
        lines: lines.filter((l) => l.nameLo.trim() && Number(l.weightG) > 0),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setBillId(''); setPhone(''); setCustomerName(''); setStaffName('');
      setLines([{ nameLo: '', weightG: '', quantity: 1 }]); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'consignments'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const giveBack = useMutation({
    mutationFn: (id: string) => api.post(`/finance/consignments/${id}/return`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['finance', 'consignments'] }),
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const canSave =
    /^\d{8}$/.test(phone) && billId.trim() && customerName.trim() && staffName.trim() &&
    lines.some((l) => l.nameLo.trim() && Number(l.weightG) > 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="ຝາກສິນຄ້າ"
        subtitle="ຄຳທີ່ລູກຄ້າຝາກໄວ້ກັບຮ້ານ — ບໍ່ນັບເຂົ້າ Stock ຫຼື COH Gold (TOR §3.7)"
      />

      {query.isError && <QueryErrorNotice error={query.error} onRetry={() => void query.refetch()} />}

      <div className="stat-grid">
        <StatCard label="ນໍ້າໜັກລວມ (ຝາກຢູ່)" value={data ? `${formatWeight(data.totals.totalWeightG)} g` : '—'} />
        <StatCard label="ຈຳນວນລວມ" value={data ? String(data.totals.totalQuantity) : '—'} />
        <StatCard label="ຈຳນວນບິນ" value={data ? String(data.totals.billCount) : '—'} />
      </div>

      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="billId">ລະຫັດ / BILL ID</label>
            <input id="billId" className="input" aria-describedby={error ? 'cons-error' : undefined} value={billId} onChange={(e) => setBillId(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
            <input id="phone" className="input num" inputMode="numeric" maxLength={8} value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label" htmlFor="cust">ຊື່ ລູກຄ້າ</label>
            <input id="cust" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="staff">ຊື່ ພະນັກງານ</label>
            <input id="staff" className="input" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label mb-0">ລາຍການຝາກ</span>
            <button className="btn-secondary"
              onClick={() => setLines((p) => [...p, { nameLo: '', weightG: '', quantity: 1 }])}>
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <input className="input" aria-label={`ລາຍການ ${index + 1}`} placeholder="ລາຍການ" value={line.nameLo}
                  onChange={(e) => setLine(index, { nameLo: e.target.value })} />
                <input className="input num" aria-label={`ນ້ຳໜັກ (g) ${index + 1}`} inputMode="decimal" placeholder="ນ້ຳໜັກ (g)"
                  value={line.weightG} onChange={(e) => setLine(index, { weightG: e.target.value })} />
                <input className="input num" aria-label={`ຈຳນວນ ${index + 1}`} type="number" min={1} value={line.quantity}
                  onChange={(e) => setLine(index, { quantity: Number(e.target.value) || 1 })} />
                <button className="btn-secondary px-3" aria-label={`ລຶບ ${index + 1}`} disabled={lines.length === 1}
                  onClick={() => setLines((p) => p.filter((_, i) => i !== index))}>
                  ລຶບ
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div id="cons-error" role="alert" className="notice status-danger mt-3">{error}</div>
        )}

        <div className="mt-4">
          <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]" disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຮັບຝາກສິນຄ້າ'}
          </button>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History ຝາກສິນຄ້າ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ຝາກສິນຄ້າ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ລະຫັດບິນ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ຊື່ ລູກຄ້າ</th>
                <th className="text-right">ນໍ້າໜັກລວມ</th>
                <th className="text-right">ຈຳນວນລວມ</th>
                <th>ຊື່ພະນັກງານ</th>
                <th>ສະຖານະ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={10}
                isLoading={query.isLoading}
                isError={query.isError}
                error={query.error}
                isEmpty={(data?.rows ?? []).length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void query.refetch()}
              />
              {(data?.rows ?? []).map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td className="font-mono text-xs">{row.billId}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>{row.customerName}</td>
                    <td className="num text-right">{formatWeight(row.totalWeightG)}</td>
                    <td className="num text-right">{row.totalQuantity}</td>
                    <td>{row.staffName}</td>
                    <td>
                      <span className={statusClass(row.status, { HELD: 'status-warning' })}>
                        {row.status === 'HELD' ? 'ຝາກຢູ່' : 'ສົ່ງຄືນແລ້ວ'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                        <button className="btn-ghost" aria-expanded={viewing === row.id}
                          aria-label={`View ${row.code}`}
                          onClick={() => setViewing(viewing === row.id ? null : row.id)}>
                          View
                        </button>
                        {row.status === 'HELD' && (
                          <button className="btn-ghost text-success"
                            aria-label={`ຢືນຢັນສົ່ງຄືນ ${row.code}`}
                            aria-describedby={error ? 'cons-error' : undefined}
                            onClick={() => giveBack.mutate(row.id)} disabled={giveBack.isPending}>
                            ຢືນຢັນສົ່ງຄືນ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {viewing === row.id && (
                    <tr>
                      <td colSpan={10} className="bg-recessed p-4">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>ລາຍການ</th>
                              <th className="text-right">ນໍ້າໜັກ (g)</th>
                              <th className="text-right">ຈຳນວນ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.lines.map((line) => (
                              <tr key={line.id}>
                                <td>{line.nameLo}</td>
                                <td className="num text-right">{formatWeight(line.weightG)}</td>
                                <td className="num text-right">{line.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

