'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
import { RowActions } from '@/components/row-actions';

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
      <PageHead
        title="ປະເພດຄຳ & ລາຍການຄຳ"
        subtitle="ຂໍ້ມູນຫຼັກທີ່ໃຊ້ໃນ Buyback, ປ່ຽນເປັນເງິນ, ສິນເຊື່ອ ແລະ ສາງຄຳ (TOR §3.5)"
      />

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
  const [nameLo, setNameLo] = useState('');
  const [isStockType, setIsStockType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isError: rowsFailed, error: rowsError, refetch: refetchRows } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types'),
  });

  const pager = usePagination(rows);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: ({ id, nameLo: name }: { id: string; nameLo: string }) =>
      api.patch(`/catalog/gold-types/${id}`, { nameLo: name }),
    onSuccess: () => {
      setEditing(null);
      toast.success('ແກ້ໄຂແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'gold-types'] });
    },
    onError: (e) => toast.error('ບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/gold-types/${id}`),
    onSuccess: () => {
      setConfirming(null);
      toast.success('ລຶບແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'gold-types'] });
    },
    onError: (e) => {
      // The server names what is still using the row; show it in full.
      setConfirming(null);
      toast.error('ລຶບປະເພດຄຳບໍ່ໄດ້', e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ');
    },
  });


  const create = useMutation({
    // ລະຫັດອອກອັດຕະໂນມັດຈາກ server.
    mutationFn: () => api.post('/catalog/gold-types', { nameLo, isStockType }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
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
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">ປະເພດຄຳ</h2>
      </div>

      <div className="space-y-3 border-b border-line p-5">
        <div className="grid gap-3">
          <div>
            <label className="label" htmlFor="gt-name">ຊື່ປະເພດຄຳ</label>
            <input id="gt-name" className="input" aria-describedby={error ? 'gt-error' : undefined} placeholder="ຄຳດີ" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
        </div>
        <label className="flex min-h-[42px] items-center gap-2 text-sm text-fg">
          <input type="checkbox" className="h-4 w-4 accent-[var(--gold)]" checked={isStockType}
            onChange={(e) => setIsStockType(e.target.checked)} />
          ໃຊ້ເປັນໝວດຂອງ Stock (OLD)
        </label>
        {error && <div id="gt-error" role="alert" className="notice status-danger">{error}</div>}
        <button className="btn-primary" disabled={!nameLo || create.isPending}
          onClick={() => create.mutate()}>
          {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມປະເພດຄຳ'}
        </button>
      </div>

      <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະເພດຄຳ">
        <table className="table">
          <thead>
            <tr>
              <th>ລະຫັດ</th>
              <th>ຊື່ປະເພດຄຳ</th>
              <th>ສາງຄຳເກົ່າ</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            <TableStateRow
              colSpan={4}
              isError={rowsFailed}
              error={rowsError}
              isEmpty={false}
              emptyText=""
              onRetry={() => void refetchRows()}
            />
            {pager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs text-muted">{row.code}</td>
                <td className="font-medium">
                  {editing === row.id ? (
                    <input className="input" value={editName} aria-label="ຊື່ປະເພດຄຳ"
                      onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    row.nameLo
                  )}
                </td>
                <td>{row.isStockType ? 'ແມ່ນ' : '—'}</td>
                <td className="text-right">
                  <RowActions
                    id={row.id}
                    editing={editing}
                    confirming={confirming}
                    busy={update.isPending || remove.isPending}
                    canSave={Boolean(editName.trim())}
                    onEdit={() => { setConfirming(null); setEditing(row.id); setEditName(row.nameLo); }}
                    onSave={() => update.mutate({ id: row.id, nameLo: editName })}
                    onCancel={() => { setEditing(null); setConfirming(null); }}
                    onAskDelete={() => { setEditing(null); setConfirming(row.id); }}
                    onDelete={() => remove.mutate(row.id)}
                  />
                </td>
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
  const [nameLo, setNameLo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isError: rowsFailed, error: rowsError, refetch: refetchRows } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });

  const itemPager = usePagination(rows);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: ({ id, nameLo: name }: { id: string; nameLo: string }) =>
      api.patch(`/catalog/gold-items/${id}`, { nameLo: name }),
    onSuccess: () => {
      setEditing(null);
      toast.success('ແກ້ໄຂແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'gold-items'] });
    },
    onError: (e) => toast.error('ບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/gold-items/${id}`),
    onSuccess: () => {
      setConfirming(null);
      toast.success('ລຶບແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'gold-items'] });
    },
    onError: (e) => {
      // The server names what is still using the row; show it in full.
      setConfirming(null);
      toast.error('ລຶບລາຍການຄຳບໍ່ໄດ້', e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ');
    },
  });


  const create = useMutation({
    // ລະຫັດອອກອັດຕະໂນມັດຈາກ server.
    mutationFn: () => api.post('/catalog/gold-items', { nameLo }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
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
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">ລາຍການຄຳ</h2>
      </div>

      <div className="space-y-3 border-b border-line p-5">
        <div className="grid gap-3">
          <div>
            <label className="label" htmlFor="gi-name">ຊື່ລາຍການຄຳ</label>
            <input id="gi-name" className="input" aria-describedby={error ? 'gi-error' : undefined} placeholder="ສາຍແຂນ" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
        </div>
        {error && <div id="gi-error" role="alert" className="notice status-danger">{error}</div>}
        <button className="btn-primary" disabled={!nameLo || create.isPending}
          onClick={() => create.mutate()}>
          {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມລາຍການຄຳ'}
        </button>
      </div>

      <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການຄຳ">
        <table className="table">
          <thead>
            <tr>
              <th>ລະຫັດ</th>
              <th>ຊື່ລາຍການຄຳ</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            <TableStateRow
              colSpan={3}
              isError={rowsFailed}
              error={rowsError}
              isEmpty={false}
              emptyText=""
              onRetry={() => void refetchRows()}
            />
            {itemPager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs text-muted">{row.code}</td>
                <td className="font-medium">
                  {editing === row.id ? (
                    <input className="input" value={editName} aria-label="ຊື່ລາຍການຄຳ"
                      onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    row.nameLo
                  )}
                </td>
                <td className="text-right">
                  <RowActions
                    id={row.id}
                    editing={editing}
                    confirming={confirming}
                    busy={update.isPending || remove.isPending}
                    canSave={Boolean(editName.trim())}
                    onEdit={() => { setConfirming(null); setEditing(row.id); setEditName(row.nameLo); }}
                    onSave={() => update.mutate({ id: row.id, nameLo: editName })}
                    onCancel={() => { setEditing(null); setConfirming(null); }}
                    onAskDelete={() => { setEditing(null); setConfirming(row.id); }}
                    onDelete={() => remove.mutate(row.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...itemPager} />
    </div>
  );
}
