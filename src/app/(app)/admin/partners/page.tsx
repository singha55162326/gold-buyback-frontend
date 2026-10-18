'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';

interface Partner {
  id: string;
  code: string;
  nameLo: string;
  direction: 'IN' | 'OUT' | 'BOTH';
  tracksGoldApAr: boolean;
}

const DIRECTION_LABEL: Record<Partner['direction'], string> = {
  IN: 'ແຫຼ່ງຮັບເຂົ້າ',
  OUT: 'ແຫຼ່ງສົ່ງອອກ',
  BOTH: 'ຮັບເຂົ້າ & ສົ່ງອອກ',
};

/** TOR §3.7 — Module ແຫຼ່ງຮັບເຂົ້າ / ແຫຼ່ງສົ່ງອອກ. */
export default function PartnersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [nameLo, setNameLo] = useState('');
  const [direction, setDirection] = useState<Partner['direction']>('BOTH');
  const [tracksGoldApAr, setTracksGoldApAr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/catalog/partners', { code, nameLo, direction, tracksGoldApAr }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setCode('');
      setNameLo('');
      setTracksGoldApAr(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'partners'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <PageHead
        title="ແຫຼ່ງຮັບເຂົ້າ / ແຫຼ່ງສົ່ງອອກ"
        subtitle="ຄູ່ຄ້າ ແລະ ຈຸດໝາຍຂອງການເຄື່ອນໄຫວຄຳ — ໃຊ້ໃນ Stock ແລະ AP/AR (GOLD) (TOR §3.7)"
      />

      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="p-code">Code</label>
            <input id="p-code" className="input" aria-describedby={error ? 'partner-error' : undefined} placeholder="FACTORY" value={code}
              onChange={(e) => setCode(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-name">ຊື່ແຫຼ່ງ</label>
            <input id="p-name" className="input" aria-describedby={error ? 'partner-error' : undefined} placeholder="ຊ່າງນອກ" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-dir">ທິດທາງ</label>
            <select id="p-dir" className="input" value={direction}
              onChange={(e) => setDirection(e.target.value as Partner['direction'])}>
              <option value="IN">ແຫຼ່ງຮັບເຂົ້າ</option>
              <option value="OUT">ແຫຼ່ງສົ່ງອອກ</option>
              <option value="BOTH">ຮັບເຂົ້າ & ສົ່ງອອກ</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-primary" disabled={!code || !nameLo || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມແຫຼ່ງ'}
            </button>
          </div>
        </div>

        <label className="mt-3 flex min-h-[42px] cursor-pointer items-center gap-3 text-sm text-fg">
          <input type="checkbox" className="h-5 w-5 accent-[var(--gold)]" checked={tracksGoldApAr}
            onChange={(e) => setTracksGoldApAr(e.target.checked)} />
          ຕິດຕາມ AP/AR (GOLD) ກັບແຫຼ່ງນີ້
        </label>

        {error && (
          <div id="partner-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການແຫຼ່ງ</h2>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການແຫຼ່ງ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ຊື່ແຫຼ່ງ</th>
                <th>ທິດທາງ</th>
                <th>AP/AR (GOLD)</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs text-muted">{row.code}</td>
                  <td className="font-medium">{row.nameLo}</td>
                  <td>{DIRECTION_LABEL[row.direction]}</td>
                  <td>{row.tracksGoldApAr ? 'ຕິດຕາມ' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
