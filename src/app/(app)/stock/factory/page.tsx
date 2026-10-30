'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import {
  DateRangeFilter,
  useHistoryRange,
  type PagedResult,
} from '@/components/date-range';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { useRealtimeInvalidate } from '@/lib/realtime';
import { formatLak, formatWeight, formatDate } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';
import { statusClass } from '@/lib/status';
import { isPositive } from '@/lib/validate';

interface Tracking {
  id: string;
  goldOutG: string;
  factoryAssessedG: string | null;
  cost: string;
  status: 'AWAITING_ASSESSMENT' | 'COMPLETED';
  createdAt: string;
  completedAt: string | null;
  /** ປະເພດຄຳ ຂອງລາຍການນີ້ — ແຖວໜຶ່ງອາດມີຫຼາຍປະເພດ, server ລວມໃຫ້ແລ້ວ. */
  goldTypesLo: string;
  /** ຜູ້ບັນທຶກ (ຜູ້ສົ່ງຄຳອອກ FACTORY). */
  createdBy: string;
  /** ຜູ້ອັບເດດລ່າສຸດ (ຜູ້ປ້ອນນ້ຳໜັກ FACTORY). */
  updatedBy: string;
  partner: { nameLo: string };
  movement: { code: string; transformType: string | null };
}

/**
 * ແຖວມາຈາກຄົນອື່ນ (ຜູ້ອະນຸມັດ) ບໍ່ແມ່ນຈາກຜູ້ທີ່ກຳລັງເບິ່ງຢູ່ ຈຶ່ງຕ້ອງໂຫຼດເອງ.
 * 15 ວິນາທີ ໄວພໍທີ່ຈະຮູ້ສຶກວ່າ "ຂຶ້ນເອງ" ແລະ ຊ້າພໍທີ່ຈະບໍ່ກວນ API.
 */
const LIVE_MS = 15_000;

/** ນອກ component ເພື່ອໃຫ້ເປັນອ້າງອີງດຽວກັນທຸກຮອບ render. */
const LIVE_KEYS = ['stock'] as const;

type View = 'QUEUE' | 'HISTORY';

/**
 * TOR §7.3 — ຕິດຕາມ Stock Out ໄປ FACTORY.
 *
 * A FACTORY OUT does not deduct stock when approved: it waits here until the
 * factory reports the assessed weight. Once Completed only Admin/Manager may
 * edit, which the API enforces regardless of what this page allows.
 *
 * ສອງທາງທີ່ຂໍ້ມູນມາຮອດໜ້ານີ້:
 *
 *  1. **ຄິວລໍຖ້າປະເມີນ** — ທຸກແຖວທີ່ຍັງຄ້າງ ບໍ່ວ່າອະນຸມັດມື້ໃດ, ໂຫຼດເອງ.
 *     ນີ້ຄືທາງທີ່ຖືກຕ້ອງສຳລັບວຽກປະຈຳວັນ: ອະນຸມັດແລ້ວແຖວຂຶ້ນເອງ ບໍ່ຕ້ອງຄົ້ນຫາ.
 *  2. **ປະຫວັດ** — ກອງຕາມຊ່ວງວັນທີ ສຳລັບການກວດຍ້ອນຫຼັງ.
 *
 * ແຕ່ກ່ອນມີແຕ່ທາງທີ 2 ແລະ ຄ່າເລີ່ມຕົ້ນເປັນ "ມື້ນີ້" — ແຖວທີ່ອະນຸມັດມື້ວານຈຶ່ງ
 * ຫາຍໄປທັງທີ່ຍັງບໍ່ທັນໄດ້ເຮັດ, ແລະ ເບິ່ງຄືວ່າ "ອະນຸມັດແລ້ວຂໍ້ມູນບໍ່ຂຶ້ນ".
 */
export default function FactoryTrackingPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<View>('QUEUE');
  const [editing, setEditing] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const user = getStoredUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  /*
   * ທາງທີ 1 — ຄິວ. ບໍ່ສົ່ງວັນທີມາເລີຍ: server ຕີຄວາມວ່າ "ທຸກແຖວທີ່ຍັງຄ້າງ".
   * ຖາມຕໍ່ເນື່ອງເຖິງຈະຢູ່ແຖບປະຫວັດ ເພາະຕົວເລກເທິງແຖບຕ້ອງຖືກຕ້ອງຢູ່ສະເໝີ.
   */
  const queue = useQuery({
    queryKey: ['stock', 'factory', 'queue'],
    queryFn: () =>
      api.get<PagedResult<Tracking>>('/stock/factory?status=AWAITING_ASSESSMENT&all=true'),
    refetchInterval: LIVE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  // ທາງທີ 2 — ປະຫວັດຕາມວັນທີ. ຖາມສະເພາະເມື່ອເປີດແຖບນີ້.
  const history = useHistoryRange<Tracking>(['stock', 'factory', 'history'], '/stock/factory', {
    enabled: view === 'HISTORY',
    refetchInterval: LIVE_MS,
  });

  /*
   * ແລະ ດ່ານທີ່ສາມ ທີ່ຜູ້ໃຊ້ບໍ່ເຫັນ: ເມື່ອຜູ້ອະນຸມັດກົດ Approve, server ແຈ້ງ
   * ເຕືອນມາທາງ socket — ສາງຈະເຫັນແຖວໃໝ່ທັນທີ ບໍ່ຕ້ອງລໍຮອບຕໍ່ໄປ. ສາຍຫຼຸດກໍ່
   * ຍັງມີການໂຫຼດຕາມເວລາຄໍ້າໄວ້.
   */
  useRealtimeInvalidate(LIVE_KEYS);

  const queueRows = queue.data?.rows ?? [];
  const onQueue = view === 'QUEUE';

  const rows = onQueue ? queueRows : history.rows;
  const rowsFailed = onQueue ? queue.isError : history.isError;
  const rowsError = onQueue ? queue.error : history.error;
  const refetchRows = onQueue ? () => void queue.refetch() : history.refetch;
  const isFetching = onQueue ? queue.isFetching : history.isFetching;

  const save = useMutation({
    mutationFn: (id: string) =>
      api.post(`/stock/factory/${id}/assessment`, { factoryAssessedG: weight.trim() }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setEditing(null);
      setWeight('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
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
        title="ຕິດຕາມ Stock Out ໄປ FACTORY"
        subtitle="ລາຍການທີ່ Approve ແລ້ວ ລໍຖ້າ FACTORY ປະເມີນນ້ຳໜັກ (TOR §7.3)"
      />

      <div data-fade className="notice status-warning">
        ລະບົບຍັງບໍ່ຕັດຍອດຈົນກວ່າຈະປ້ອນນ້ຳໜັກທີ່ FACTORY ປະເມີນ.
        ເມື່ອບັນທຶກແລ້ວ ສະຖານະຈະເປັນ Completed ແລະ ຕັດຍອດ Stock (OLD) ພ້ອມບັນທຶກ AP-AR (GOLD).
      </div>

      {error && (
        <div id="factory-error" role="alert" className="notice status-danger">{error}</div>
      )}

      <div data-fade className="card">
        <div className="card-header flex-wrap">
          <h2 className="card-title">ລາຍການຕິດຕາມ</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="live-dot">
              {isFetching ? 'ກຳລັງໂຫຼດ...' : 'ອັບເດດເອງ'}
            </span>
            <div className="seg" role="tablist" aria-label="ມຸມມອງ">
              <button
                type="button"
                role="tab"
                className="seg-btn"
                aria-selected={onQueue}
                onClick={() => setView('QUEUE')}
              >
                ລໍຖ້າປະເມີນ
                {queueRows.length > 0 && <span className="seg-count">{queueRows.length}</span>}
              </button>
              <button
                type="button"
                role="tab"
                className="seg-btn"
                aria-selected={!onQueue}
                onClick={() => setView('HISTORY')}
              >
                ປະຫວັດ
              </button>
            </div>
          </div>
        </div>

        {onQueue ? (
          <div className="filter-bar">
            <span className="filter-select-label">
              ທຸກລາຍການທີ່ຍັງລໍຖ້າ FACTORY ປະເມີນ — ບໍ່ຈຳກັດວັນທີ
            </span>
            <div className="filter-tail">
              <button type="button" className="filter-clear" onClick={refetchRows}>
                ໂຫຼດຄືນ
              </button>
              <span className="filter-note">
                {queueRows.length.toLocaleString('en-US')} ລາຍການ
              </span>
            </div>
          </div>
        ) : (
          <DateRangeFilter history={history} />
        )}

        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການຕິດຕາມ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງສົ່ງອອກ</th>
                <th>ປະເພດຄຳ</th>
                <th>ແປງສະພາບ</th>
                <th className="text-right">ຄຳເກົ່າອອກ (g)</th>
                <th className="text-right">ນ້ຳໜັກ (g) FACTORY ປະເມີນ</th>
                <th className="text-right">ຕົ້ນທຶນຄຳ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th>ສະຖານະ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={12}
                isError={rowsFailed}
                error={rowsError}
                isEmpty={rows.length === 0}
                emptyText={onQueue ? 'ບໍ່ມີລາຍການລໍຖ້າປະເມີນ' : 'ຍັງບໍ່ມີລາຍການ'}
                onRetry={refetchRows}
              />
              {pager.pageItems.map((row) => {
                const locked = row.status === 'COMPLETED' && !isAdmin;
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.movement.code}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.partner.nameLo}</td>
                    <td>{row.goldTypesLo || '—'}</td>
                    <td className="text-muted">{row.movement.transformType ?? '—'}</td>
                    <td className="num text-right">{formatWeight(row.goldOutG)}</td>
                    <td className="num text-right">
                      {editing === row.id ? (
                        <NumberInput
                          className="input num w-36 text-right"
                          aria-label={`ນໍ້າໜັກg FACTORY ປະເມີນ ${row.movement.code}`}
                          aria-describedby={error ? 'factory-error' : undefined}
                          decimals={4}
                          value={weight}
                          onValueChange={setWeight}
                          autoFocus
                        />
                      ) : (
                        formatWeight(row.factoryAssessedG)
                      )}
                    </td>
                    <td className="num text-right">{formatLak(row.cost)}</td>
                    <td className="text-muted">{row.createdBy}</td>
                    <td className="text-muted">{row.updatedBy}</td>
                    <td>
                      <span className={statusClass(row.status, { AWAITING_ASSESSMENT: 'status-warning' })}>
                        {row.status === 'COMPLETED' ? 'Completed' : 'ລໍຖ້າ FACTORY ປະເມີນ'}
                      </span>
                    </td>
                    <td className="text-right">
                      {editing === row.id ? (
                        <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                          <button className="btn-primary"
                            onClick={() => save.mutate(row.id)} disabled={save.isPending || !isPositive(weight)}>
                            ບັນທຶກ
                          </button>
                          <button className="btn-secondary" onClick={() => setEditing(null)}>
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : locked ? (
                        <span className="text-xs text-muted">ສະເພາະ Admin</span>
                      ) : (
                        <button className="btn-ghost"
                          aria-label={`${row.status === 'COMPLETED' ? 'ແກ້ໄຂ' : 'ອັບເດດ'} ${row.movement.code}`}
                          onClick={() => { setEditing(row.id); setWeight(row.factoryAssessedG ?? ''); }}>
                          {row.status === 'COMPLETED' ? 'ແກ້ໄຂ' : 'ອັບເດດ'}
                        </button>
                      )}
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
