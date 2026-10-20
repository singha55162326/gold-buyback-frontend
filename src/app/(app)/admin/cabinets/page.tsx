'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { RowActions } from '@/components/row-actions';
import { formatWeight, formatDate } from '@/lib/format';
import { canPickDates } from '@/components/date-range';

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
    /** ລາຍການປ່ຽນທີ່ເອົາຄຳເຂົ້າຕູ້ — ໃຊ້ເປັນວັນທີເຂົ້າຕູ້. */
    exchange: { code: string; createdAt: string };
  }>;
}

/** TOR §3.7 — Module ຕູ້ເຄື່ອງ. */
export default function CabinetsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [nameLo, setNameLo] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * ຕູ້ເຄື່ອງ ເປັນຍອດຄົງຄ້າງ ບໍ່ແມ່ນປະຫວັດ — ຄ່າເລີ່ມຕົ້ນຈຶ່ງເປັນ "ທັງໝົດ"
   * ບໍ່ແມ່ນ "ມື້ນີ້". ໃສ່ວັນທີແລ້ວຈຶ່ງເຫັນສະເພາະຄຳທີ່ເຂົ້າຕູ້ໃນຊ່ວງນັ້ນ.
   */
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const ranged = Boolean(fromDate && toDate);

  const { data: cabinets = [], isError: cabinetsFailed, error: cabinetsError, refetch: refetchCabinets } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });

  const { data: contents, isError: contentsFailed, error: contentsError, refetch: refetchContents } = useQuery({
    queryKey: ['catalog', 'cabinets', viewing, fromDate, toDate],
    queryFn: () =>
      api.get<CabinetContents>(
        ranged
          ? `/catalog/cabinets/${viewing}?from_date=${fromDate}&to_date=${toDate}`
          : `/catalog/cabinets/${viewing}`,
      ),
    enabled: Boolean(viewing),
  });

  const create = useMutation({
    // ລະຫັດອອກອັດຕະໂນມັດຈາກ server.
    mutationFn: () => api.post('/catalog/cabinets', { nameLo }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
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

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: ({ id, nameLo: name }: { id: string; nameLo: string }) =>
      api.patch(`/catalog/cabinets/${id}`, { nameLo: name }),
    onSuccess: () => {
      setEditing(null);
      toast.success('ແກ້ໄຂແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'cabinets'] });
    },
    onError: (e) => toast.error('ບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/cabinets/${id}`),
    onSuccess: () => {
      setConfirming(null);
      toast.success('ລຶບແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'cabinets'] });
    },
    onError: (e) => {
      // The server names what still uses it (or the gold still inside).
      setConfirming(null);
      toast.error('ລຶບຕູ້ເຄື່ອງບໍ່ໄດ້', e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ');
    },
  });


  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການ ຕູ້ເຄື່ອງ"
        subtitle="ຕູ້ວາງສະແດງຄຳ — ກົດ View ເພື່ອເບິ່ງລາຍການຄຳ ແລະ ນ້ຳໜັກ (TOR §3.7)"
      />

      <div data-fade className="card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cab-name">ຊື່ຕູ້ເຄື່ອງ</label>
            <input id="cab-name" className="input" aria-describedby={error ? 'cab-error' : undefined} placeholder="ຕູ້ເຄື່ອງ 03" value={nameLo}
              onChange={(e) => setNameLo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary" disabled={!nameLo || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມຕູ້ເຄື່ອງ'}
            </button>
          </div>
        </div>
        {error && <div id="cab-error" role="alert" className="notice status-danger mt-3">{error}</div>}
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການຕູ້ເຄື່ອງ</h2>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການຕູ້ເຄື່ອງ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ຕູ້ເຄື່ອງ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={3}
                isError={cabinetsFailed}
                error={cabinetsError}
                isEmpty={false}
                emptyText=""
                onRetry={() => void refetchCabinets()}
              />
              {pager.pageItems.map((cab) => (
                <tr key={cab.id}>
                  <td className="font-mono text-xs text-muted">{cab.code}</td>
                  <td className="font-medium">
                    {editing === cab.id ? (
                      <input className="input" value={editName} aria-label="ຊື່ຕູ້ເຄື່ອງ"
                        onChange={(e) => setEditName(e.target.value)} />
                    ) : (
                      cab.nameLo
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      {editing !== cab.id && confirming !== cab.id && (
                        <button className="btn-ghost" aria-expanded={viewing === cab.id}
                          onClick={() => setViewing(viewing === cab.id ? null : cab.id)}>
                          {viewing === cab.id ? 'ປິດ' : 'View'}
                        </button>
                      )}
                      <RowActions
                        id={cab.id}
                        editing={editing}
                        confirming={confirming}
                        busy={update.isPending || remove.isPending}
                        canSave={Boolean(editName.trim())}
                        onEdit={() => { setConfirming(null); setEditing(cab.id); setEditName(cab.nameLo); }}
                        onSave={() => update.mutate({ id: cab.id, nameLo: editName })}
                        onCancel={() => { setEditing(null); setConfirming(null); }}
                        onAskDelete={() => { setEditing(null); setConfirming(cab.id); }}
                        onDelete={() => remove.mutate(cab.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      {viewing && contentsFailed && (
        <QueryErrorNotice error={contentsError} onRetry={() => void refetchContents()} />
      )}

      {viewing && contents && (
        <div data-fade className="card">
          <div className="card-header">
            <h2 className="card-title">ລາຍການຄຳໃນ {contents.cabinet.nameLo}</h2>
            <span className="num text-sm text-fg">
              ລວມ {formatWeight(contents.totalWeightG)} g
            </span>
          </div>
          {canPickDates() && (
            <div className="filter-bar">
              <div className="filter-dates">
                <span className="filter-select-label">ວັນທີເຂົ້າຕູ້</span>
                <input className="filter-date" type="date" aria-label="ຈາກວັນທີ"
                  value={draftFrom} max={draftTo || undefined}
                  onChange={(e) => setDraftFrom(e.target.value)} />
                <span className="text-slate-400">–</span>
                <input className="filter-date" type="date" aria-label="ຫາວັນທີ"
                  value={draftTo} min={draftFrom || undefined}
                  onChange={(e) => setDraftTo(e.target.value)} />
                <button type="button" className="btn-secondary h-9 py-0"
                  disabled={!draftFrom || !draftTo}
                  onClick={() => { setFromDate(draftFrom); setToDate(draftTo); }}>
                  ຄົ້ນຫາ
                </button>
                {ranged && (
                  <button type="button" className="filter-clear"
                    onClick={() => { setDraftFrom(''); setDraftTo(''); setFromDate(''); setToDate(''); }}>
                    ລ້າງ
                  </button>
                )}
              </div>
              <div className="filter-tail">
                <span className="num text-xs text-slate-500">
                  {ranged ? `${fromDate} – ${toDate}` : 'ທັງໝົດໃນຕູ້'}
                </span>
              </div>
            </div>
          )}
          <div className="table-wrap" tabIndex={0} role="region" aria-label={`ລາຍການຄຳໃນ ${contents.cabinet.nameLo}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>ລາຍການຄຳ</th>
                  <th>ວັນທີເຂົ້າຕູ້</th>
                  <th>ລະຫັດລາຍການປ່ຽນ</th>
                  <th className="text-right">ນ້ຳໜັກ / g</th>
                  <th className="text-right">ຈຳນວນ</th>
                </tr>
              </thead>
              <tbody>
                <TableStateRow
                  colSpan={5}
                  isEmpty={contents.lines.length === 0}
                  emptyText={ranged ? 'ບໍ່ມີຄຳເຂົ້າຕູ້ນີ້ໃນຊ່ວງວັນທີທີ່ເລືອກ' : 'ຍັງບໍ່ມີຄຳໃນຕູ້ນີ້'}
                  dense
                />
                {contents.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.goldSku.fullSkuName}</td>
                    <td>{formatDate(line.exchange.createdAt)}</td>
                    <td className="font-mono text-xs">{line.exchange.code}</td>
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
