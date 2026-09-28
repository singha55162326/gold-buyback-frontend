'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatWeight, formatDateTime } from '@/lib/format';

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

  const { data } = useQuery({
    queryKey: ['finance', 'consignments'],
    queryFn: () => api.get<Payload>('/finance/consignments'),
  });

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຝາກສິນຄ້າ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຄຳທີ່ລູກຄ້າຝາກໄວ້ກັບຮ້ານ — ບໍ່ນັບເຂົ້າ Stock ຫຼື COH Gold (TOR §3.7)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat labelLo="ນໍ້າໜັກລວມ (ຝາກຢູ່)" value={data ? `${formatWeight(data.totals.totalWeightG)} g` : '—'} />
        <Stat labelLo="ຈຳນວນລວມ" value={data ? String(data.totals.totalQuantity) : '—'} />
        <Stat labelLo="ຈຳນວນບິນ" value={data ? String(data.totals.billCount) : '—'} />
      </div>

      <div className="card p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="billId">ລະຫັດ / BILL ID</label>
            <input id="billId" className="input" value={billId} onChange={(e) => setBillId(e.target.value)} />
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
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">ລາຍການຝາກ</span>
            <button className="btn-secondary py-1 text-xs"
              onClick={() => setLines((p) => [...p, { nameLo: '', weightG: '', quantity: 1 }])}>
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <input className="input" placeholder="ລາຍການ" value={line.nameLo}
                  onChange={(e) => setLine(index, { nameLo: e.target.value })} />
                <input className="input num" inputMode="decimal" placeholder="ນ້ຳໜັກ (g)"
                  value={line.weightG} onChange={(e) => setLine(index, { weightG: e.target.value })} />
                <input className="input num" type="number" min={1} value={line.quantity}
                  onChange={(e) => setLine(index, { quantity: Number(e.target.value) || 1 })} />
                <button className="btn-secondary px-3 text-xs" disabled={lines.length === 1}
                  onClick={() => setLines((p) => p.filter((_, i) => i !== index))}>
                  ລຶບ
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-4">
          <button className="btn-primary" disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຮັບຝາກສິນຄ້າ'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">History ຝາກສິນຄ້າ</h2></div>
        <div className="table-wrap">
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
              {(data?.rows ?? []).length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {(data?.rows ?? []).map((row) => (
                <>
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td className="font-mono text-xs">{row.billId}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>{row.customerName}</td>
                    <td className="num text-right">{formatWeight(row.totalWeightG)}</td>
                    <td className="num text-right">{row.totalQuantity}</td>
                    <td>{row.staffName}</td>
                    <td>
                      <span className={row.status === 'HELD' ? 'badge bg-amber-100 text-amber-800' : 'badge bg-slate-100 text-slate-600'}>
                        {row.status === 'HELD' ? 'ຝາກຢູ່' : 'ສົ່ງຄືນແລ້ວ'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button className="text-sm text-gold-700 hover:underline"
                          onClick={() => setViewing(viewing === row.id ? null : row.id)}>
                          View
                        </button>
                        {row.status === 'HELD' && (
                          <button className="text-sm text-emerald-700 hover:underline"
                            onClick={() => giveBack.mutate(row.id)} disabled={giveBack.isPending}>
                            ຢືນຢັນສົ່ງຄືນ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {viewing === row.id && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={10} className="bg-slate-50 p-4">
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
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ labelLo, value }: { labelLo: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className="num mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
