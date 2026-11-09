'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
import { RowActions } from '@/components/row-actions';

type PartnerType = 'FACTORY' | 'SMITH' | 'SUPPLIER' | 'INTERNAL';

interface Partner {
  id: string;
  code: string;
  nameLo: string;
  type: PartnerType;
  direction: 'IN' | 'OUT' | 'BOTH';
  tracksGoldApAr: boolean;
  /** ຜູ້ບັນທຶກ — ອ່ານຈາກ Audit Log ຢູ່ server. */
  createdBy: string;
}

const DIRECTION_LABEL: Record<Partner['direction'], string> = {
  IN: 'ແຫຼ່ງຮັບເຂົ້າ',
  OUT: 'ແຫຼ່ງສົ່ງອອກ',
  BOTH: 'ຮັບເຂົ້າ & ສົ່ງອອກ',
};

const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  SMITH: 'ຊ່າງ / ຊ່າງນອກ (ກຳນົດ %ຄຳ)',
  FACTORY: 'ໂຮງງານ (ຕິດຕາມ FACTORY)',
  SUPPLIER: 'ຜູ້ສະໜອງ (Vendor / ຮ້ານສົ່ງ)',
  INTERNAL: 'ຈຸດພາຍໃນ / ອື່ນໆ (Internal)',
};

const PARTNER_TYPE_BADGE: Record<PartnerType, { label: string; className: string }> = {
  SMITH: {
    label: 'ຊ່າງ (SMITH)',
    className: 'badge badge-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30',
  },
  FACTORY: {
    label: 'ໂຮງງານ (FACTORY)',
    className: 'badge badge-sm bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30',
  },
  SUPPLIER: {
    label: 'ຜູ້ສະໜອງ',
    className: 'badge badge-sm bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30',
  },
  INTERNAL: {
    label: 'ພາຍໃນ / ອື່ນໆ',
    className: 'badge badge-sm bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border border-zinc-500/30',
  },
};

const TYPE_HINT: Record<PartnerType, string> = {
  SMITH: '💡 ຊ່າງ: Stock OUT ຈະເປີດຊ່ອງປ້ອນ %ຄຳ ເພື່ອຄຳນວນນ້ຳໜັກຄາດວ່າຈະໄດ້ຮັບ ແລະ ຕັດຍອດ AP Gold ຕາມນ້ຳໜັກຄາດວ່າຈະໄດ້ຮັບ.',
  FACTORY: '💡 ໂຮງງານ: Stock OUT ຈະເຂົ້າສູ່ Module ຕິດຕາມ Stock Out ໄປ FACTORY — ລະບົບຍັງບໍ່ຕັດຍອດ ຈົນກວ່າຈະປ້ອນນ້ຳໜັກທີ່ໂຮງງານປະເມີນກັບມາ.',
  SUPPLIER: '💡 ຜູ້ສະໜອງ: ສໍາລັບຮັບຄຳໃໝ່ເຂົ້າສາງ (Stock IN) ຫຼື ສົ່ງຄຳຊຳລະ (ບໍ່ຕ້ອງລໍຖ້າປະເມີນ ແລະ ບໍ່ຕ້ອງລະບຸ %ຄຳ).',
  INTERNAL: '💡 ຈຸດພາຍໃນ: ຈຸດໝູນວຽນພາຍໃນຮ້ານ (ເຊັ່ນ ຕູ້ເຄື່ອງ, ເບີກຖອນ, Cashier).',
};

/** TOR §3.7 — Module ແຫຼ່ງຮັບເຂົ້າ / ແຫຼ່ງສົ່ງອອກ. */
export default function PartnersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [nameLo, setNameLo] = useState('');
  const [type, setType] = useState<PartnerType>('SMITH');
  const [direction, setDirection] = useState<Partner['direction']>('BOTH');
  const [tracksGoldApAr, setTracksGoldApAr] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isError: rowsFailed, error: rowsError, refetch: refetchRows } = useQuery({
    queryKey: ['catalog', 'partners', 'admin'],
    queryFn: () => api.get<Partner[]>('/catalog/partners?withActor=true'),
  });

  const create = useMutation({
    mutationFn: () =>
      // ລະຫັດອອກອັດຕະໂນມັດຈາກ server.
      api.post('/catalog/partners', { nameLo, type, direction, tracksGoldApAr }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setNameLo('');
      setType('SMITH');
      setDirection('BOTH');
      setTracksGoldApAr(true);
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

  // Edit state
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<PartnerType>('SMITH');
  const [editDirection, setEditDirection] = useState<Partner['direction']>('BOTH');
  const [editTracksGoldApAr, setEditTracksGoldApAr] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: ({
      id,
      nameLo: name,
      type: pType,
      direction: pDir,
      tracksGoldApAr: pTracks,
    }: {
      id: string;
      nameLo: string;
      type: PartnerType;
      direction: Partner['direction'];
      tracksGoldApAr: boolean;
    }) =>
      api.patch(`/catalog/partners/${id}`, {
        nameLo: name,
        type: pType,
        direction: pDir,
        tracksGoldApAr: pTracks,
      }),
    onSuccess: () => {
      setEditing(null);
      toast.success('ແກ້ໄຂແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'partners'] });
    },
    onError: (e) => toast.error('ບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/partners/${id}`),
    onSuccess: () => {
      setConfirming(null);
      toast.success('ລຶບແລ້ວ');
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'partners'] });
    },
    onError: (e) => {
      setConfirming(null);
      toast.error('ລຶບແຫຼ່ງບໍ່ໄດ້', e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ');
    },
  });

  const handleTypeChange = (newType: PartnerType) => {
    setType(newType);
    if (newType === 'SMITH' || newType === 'FACTORY' || newType === 'SUPPLIER') {
      setTracksGoldApAr(true);
    }
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="ແຫຼ່ງຮັບເຂົ້າ / ແຫຼ່ງສົ່ງອອກ"
        subtitle="ຄູ່ຄ້າ ແລະ ຈຸດໝາຍຂອງການເຄື່ອນໄຫວຄຳ — ໃຊ້ໃນ Stock ແລະ AP/AR (GOLD) (TOR §3.7)"
      />

      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="p-name">ຊື່ແຫຼ່ງ</label>
            <input
              id="p-name"
              className="input"
              aria-describedby={error ? 'partner-error' : undefined}
              placeholder="ຊ່າງສົມພອນ / ໂຮງງານວຽງຈັນ"
              value={nameLo}
              onChange={(e) => setNameLo(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="p-type">ປະເພດຄູ່ຄ້າ (Business Logic)</label>
            <select
              id="p-type"
              className="input font-medium"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as PartnerType)}
            >
              <option value="SMITH">🔨 ຊ່າງ / ຊ່າງນອກ (ກຳນົດ %ຄຳ)</option>
              <option value="FACTORY">🏭 ໂຮງງານ (ຕິດຕາມ FACTORY)</option>
              <option value="SUPPLIER">📦 ຜູ້ສະໜອງ (Vendor / ຮ້ານສົ່ງ)</option>
              <option value="INTERNAL">🏢 ຈຸດພາຍໃນ / ອື່ນໆ (Internal)</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="p-dir">ທິດທາງ</label>
            <select
              id="p-dir"
              className="input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as Partner['direction'])}
            >
              <option value="BOTH">ຮັບເຂົ້າ & ສົ່ງອອກ</option>
              <option value="OUT">ແຫຼ່ງສົ່ງອອກ (OUT)</option>
              <option value="IN">ແຫຼ່ງຮັບເຂົ້າ (IN)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              className="btn-primary w-full sm:w-auto"
              disabled={!nameLo || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມແຫຼ່ງ'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 border-border/50">
          <label className="flex min-h-[36px] cursor-pointer items-center gap-3 text-sm text-fg">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--gold)]"
              checked={tracksGoldApAr}
              onChange={(e) => setTracksGoldApAr(e.target.checked)}
            />
            <span>ຕິດຕາມ AP/AR (GOLD) ກັບແຫຼ່ງນີ້ (ບັນທຶກພັນທະໜີ້ຄຳ)</span>
          </label>
          <div className="text-xs text-muted/90 bg-muted/20 px-3 py-1.5 rounded-md border border-border/40">
            {TYPE_HINT[type]}
          </div>
        </div>

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
                <th>ປະເພດ</th>
                <th>ທິດທາງ</th>
                <th>AP/AR (GOLD)</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={7}
                isError={rowsFailed}
                error={rowsError}
                isEmpty={pager.pageItems.length === 0}
                emptyText="ບໍ່ມີລາຍການແຫຼ່ງ"
                onRetry={() => void refetchRows()}
              />
              {pager.pageItems.map((row) => {
                const isThisEditing = editing === row.id;
                const badge = PARTNER_TYPE_BADGE[row.type ?? 'INTERNAL'];

                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs text-muted">{row.code}</td>
                    <td className="font-medium">
                      {isThisEditing ? (
                        <input
                          className="input input-sm h-8"
                          value={editName}
                          aria-label="ຊື່ແຫຼ່ງ"
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        row.nameLo
                      )}
                    </td>
                    <td>
                      {isThisEditing ? (
                        <select
                          className="input input-sm h-8 text-xs py-0"
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as PartnerType)}
                        >
                          <option value="SMITH">ຊ່າງ (SMITH)</option>
                          <option value="FACTORY">ໂຮງງານ (FACTORY)</option>
                          <option value="SUPPLIER">ຜູ້ສະໜອງ</option>
                          <option value="INTERNAL">ພາຍໃນ / ອື່ນໆ</option>
                        </select>
                      ) : (
                        <span className={badge.className}>{badge.label}</span>
                      )}
                    </td>
                    <td>
                      {isThisEditing ? (
                        <select
                          className="input input-sm h-8 text-xs py-0"
                          value={editDirection}
                          onChange={(e) => setEditDirection(e.target.value as Partner['direction'])}
                        >
                          <option value="BOTH">ຮັບເຂົ້າ & ສົ່ງອອກ</option>
                          <option value="OUT">ສົ່ງອອກ</option>
                          <option value="IN">ຮັບເຂົ້າ</option>
                        </select>
                      ) : (
                        DIRECTION_LABEL[row.direction]
                      )}
                    </td>
                    <td>
                      {isThisEditing ? (
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={editTracksGoldApAr}
                            onChange={(e) => setEditTracksGoldApAr(e.target.checked)}
                          />
                          <span>ຕິດຕາມ</span>
                        </label>
                      ) : (
                        row.tracksGoldApAr ? (
                          <span className="text-success font-medium">ຕິດຕາມ</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )
                      )}
                    </td>
                    <td className="text-muted text-xs">{row.createdBy}</td>
                    <td className="text-right">
                      <RowActions
                        id={row.id}
                        editing={editing}
                        confirming={confirming}
                        busy={update.isPending || remove.isPending}
                        canSave={Boolean(editName.trim())}
                        onEdit={() => {
                          setConfirming(null);
                          setEditing(row.id);
                          setEditName(row.nameLo);
                          setEditType(row.type ?? 'INTERNAL');
                          setEditDirection(row.direction);
                          setEditTracksGoldApAr(row.tracksGoldApAr);
                        }}
                        onSave={() =>
                          update.mutate({
                            id: row.id,
                            nameLo: editName,
                            type: editType,
                            direction: editDirection,
                            tracksGoldApAr: editTracksGoldApAr,
                          })
                        }
                        onCancel={() => {
                          setEditing(null);
                          setConfirming(null);
                        }}
                        onAskDelete={() => {
                          setEditing(null);
                          setConfirming(row.id);
                        }}
                        onDelete={() => remove.mutate(row.id)}
                      />
                    </td>
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
