'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

interface GoldType {
  id: string;
  code: string;
  nameLo: string;
  isStockType: boolean;
}

interface GoldItem {
  id: string;
  code: string;
  nameLo: string;
}

/** TOR §3.5 — Module ປະເພດຄຳ ແລະ Module ລາຍການຄຳ. */
export default function GoldTypesPage() {

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ປະເພດຄຳ & ລາຍການຄຳ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຂໍ້ມູນຫຼັກທີ່ໃຊ້ໃນ Buyback, ປ່ຽນເປັນເງິນ, ສິນເຊື່ອ ແລະ ສາງຄຳ (TOR §3.5)
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GoldTypePanel />
        <GoldItemPanel />
      </div>
    </div>
  );
}

function GoldTypePanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [nameLo, setNameLo] = useState('');
  const [isStockType, setIsStockType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types'),
  });

  const pager = usePagination(rows);

  const create = useMutation({
    mutationFn: () => api.post('/catalog/gold-types', { code, nameLo, isStockType }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setCode('');
      setNameLo('');
      setIsStockType(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'gold-types'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">ປະເພດຄຳ</h2>
      </div>

      <div className="space-y-3 border-b border-slate-200 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="gt-code">Code</label>
            <input id="gt-code" className="input" placeholder="GOOD" value={code}
              onChange={(e) => setCode(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="gt-name">ຊື່ປະເພດຄຳ</label>
            <input id="gt-name" className="input" placeholder="ຄຳດີ" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={isStockType}
            onChange={(e) => setIsStockType(e.target.checked)} />
          ໃຊ້ເປັນໝວດຂອງ Stock (OLD)
        </label>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <button className="btn-primary" disabled={!code || !nameLo || create.isPending}
          onClick={() => create.mutate()}>
          {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມປະເພດຄຳ'}
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ລະຫັດ</th>
              <th>ຊື່ປະເພດຄຳ</th>
              <th>ສາງຄຳເກົ່າ</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs text-slate-500">{row.code}</td>
                <td className="font-medium">{row.nameLo}</td>
                <td>{row.isStockType ? 'ແມ່ນ' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        <Pagination {...pager} />
    </div>
  );
}

function GoldItemPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [nameLo, setNameLo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });

  const itemPager = usePagination(rows);

  const create = useMutation({
    mutationFn: () => api.post('/catalog/gold-items', { code, nameLo }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setCode('');
      setNameLo('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'gold-items'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">ລາຍການຄຳ</h2>
      </div>

      <div className="space-y-3 border-b border-slate-200 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="gi-code">Code</label>
            <input id="gi-code" className="input" placeholder="BRACELET" value={code}
              onChange={(e) => setCode(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="gi-name">ຊື່ລາຍການຄຳ</label>
            <input id="gi-name" className="input" placeholder="ສາຍແຂນ" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <button className="btn-primary" disabled={!code || !nameLo || create.isPending}
          onClick={() => create.mutate()}>
          {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມລາຍການຄຳ'}
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ລະຫັດ</th>
              <th>ຊື່ລາຍການຄຳ</th>
            </tr>
          </thead>
          <tbody>
            {itemPager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs text-slate-500">{row.code}</td>
                <td className="font-medium">{row.nameLo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...itemPager} />
    </div>
  );
}
