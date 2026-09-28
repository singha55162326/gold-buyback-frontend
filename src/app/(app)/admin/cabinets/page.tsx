'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatWeight } from '@/lib/format';

interface Cabinet {
  id: string;
  code: string;
  nameLo: string;
}

interface CabinetContents {
  cabinet: Cabinet;
  totalWeightG: string;
  lines: Array<{
    id: string;
    weightG: string;
    quantity: number;
    goldSku: { fullSkuName: string };
  }>;
}

/** TOR §3.7 — Module ຕູ້ເຄື່ອງ. */
export default function CabinetsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [nameLo, setNameLo] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: cabinets = [] } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });

  const { data: contents } = useQuery({
    queryKey: ['catalog', 'cabinets', viewing],
    queryFn: () => api.get<CabinetContents>(`/catalog/cabinets/${viewing}`),
    enabled: Boolean(viewing),
  });

  const create = useMutation({
    mutationFn: () => api.post('/catalog/cabinets', { code, nameLo }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setCode('');
      setNameLo('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'cabinets'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(cabinets);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການ ຕູ້ເຄື່ອງ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຕູ້ວາງສະແດງຄຳ — ກົດ View ເພື່ອເບິ່ງລາຍການຄຳ ແລະ ນ້ຳໜັກ (TOR §3.7)
        </p>
      </div>

      <div className="card p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="cab-code">Code</label>
            <input id="cab-code" className="input" placeholder="CAB-03" value={code}
              onChange={(e) => setCode(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="cab-name">ຊື່ຕູ້ເຄື່ອງ</label>
            <input id="cab-name" className="input" placeholder="ຕູ້ເຄື່ອງ 03" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary" disabled={!code || !nameLo || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມຕູ້ເຄື່ອງ'}
            </button>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການຕູ້ເຄື່ອງ</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ຕູ້ເຄື່ອງ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((cab) => (
                <tr key={cab.id}>
                  <td className="font-mono text-xs text-slate-500">{cab.code}</td>
                  <td className="font-medium">{cab.nameLo}</td>
                  <td className="text-right">
                    <button className="text-sm text-gold-700 hover:underline"
                      onClick={() => setViewing(viewing === cab.id ? null : cab.id)}>
                      {viewing === cab.id ? 'ປິດ' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      {viewing && contents && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">ລາຍການຄຳໃນ {contents.cabinet.nameLo}</h2>
            <span className="num text-sm text-slate-600">
              ລວມ {formatWeight(contents.totalWeightG)} g
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ລາຍການຄຳ</th>
                  <th className="text-right">ນ້ຳໜັກ / g</th>
                  <th className="text-right">ຈຳນວນ</th>
                </tr>
              </thead>
              <tbody>
                {contents.lines.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">
                      ຍັງບໍ່ມີຄຳໃນຕູ້ນີ້
                    </td>
                  </tr>
                )}
                {contents.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.goldSku.fullSkuName}</td>
                    <td className="num text-right">{formatWeight(line.weightG)}</td>
                    <td className="num text-right">{line.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
