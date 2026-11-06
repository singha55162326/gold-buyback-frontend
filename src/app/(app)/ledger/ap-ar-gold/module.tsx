'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
import { formatLak, formatWeight, formatDate } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

interface Summary { side: 'AP' | 'AR'; startG: string; netMovementG: string; totalG: string; totalBaht: string }
interface PartnerRow {
  partnerId: string; partnerCode: string; partnerNameLo: string; side: 'AP' | 'AR';
  broughtForwardG: string; increasesG: string; decreasesG: string; currentG: string;
}
interface HistoryRow {
  id: string; businessDate: string; side: 'AP' | 'AR'; typeLabel: string;
  goldInG: string; goldOutG: string; weightG: string;
  priceIn: string; priceOut: string; cost: string;
  note?: string | null;
  partner: { nameLo: string };
  /** ຜູ້ບັນທຶກລາຍການນີ້. */
  createdBy: string;
}

const SIDE_LABEL = {
  AR: 'AR (GOLD) — ໜີ້ຕ້ອງຮັບຄຳ (FACTORY / ຊ່າງ)',
  AP: 'AP (GOLD) — ໜີ້ຕ້ອງສົ່ງຄຳ (Vendor)',
} as const;

/** TOR §8 — AP/AR (GOLD). */
export function ApArGoldModule({ side }: { side: 'AP' | 'AR' }) {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');

  // One window per side (TOR §8.2, §8.3); passing ?side= ensures server-side filtering
  const {
    data: summary = [],
    isLoading: summaryLoading,
    isError: summaryFailed,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'gold', side],
    queryFn: () => api.get<Summary[]>(`/ledger/ap-ar/gold?side=${side}`),
  });

  const {
    data: partners = [],
    isLoading: partnersLoading,
    isError: partnersFailed,
    error: partnersError,
    refetch: refetchPartners,
  } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'gold', 'partners', side],
    queryFn: () => api.get<PartnerRow[]>(`/ledger/ap-ar/gold/partners?side=${side}`),
  });

  /*
   * ປະຫວັດ: ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້ ແລະ ກວ້າງອອກໄດ້ຈາກແຖບ filter.
   * ສົ່ງ `side` ແລະ `partnerId` ເພື່ອກອງຢູ່ server ໂດຍກົງ.
   */
  const historyRange = useHistoryRange<HistoryRow>(
    ['ledger', 'ap-ar', 'gold', 'history', side],
    '/ledger/ap-ar/gold/history',
    {
      params: {
        side,
        partnerId: selectedPartnerId || undefined,
      },
    },
  );
  const history = historyRange.rows;
  const historyFailed = historyRange.isError;
  const historyError = historyRange.error;
  const refetchHistory = historyRange.refetch;

  const filteredPartners = partners.filter((r) => r.side === side);

  return (
    <div className="space-y-6">
      <PageHead
        title={SIDE_LABEL[side]}
        subtitle={`ຕິດຕາມພັນທະຄຳກັບຄູ່ຄ້າ — EASY / FACTORY / ຊ່າງນອກ / ອື່ນໆ (TOR ${side === 'AP' ? '§8.2' : '§8.3'})`}
        actions={
          <button
            type="button"
            className="btn-secondary btn-sm h-8 py-0 px-3 text-xs"
            onClick={() => {
              void refetchSummary();
              void refetchPartners();
              void refetchHistory();
            }}
          >
            ໂຫຼດຂໍ້ມູນຄືນ (Refresh)
          </button>
        }
      />

      {/* With every gold movement booked to AP per §8.4 / §7.4, this window has
          no posting rule feeding it. Saying so is kinder than letting a row of
          zeros read as a broken report. */}
      {side === 'AR' && (
        <div data-fade className="notice status-warning">
          <div>
            ຕາມທີ່ຕົກລົງກັບລູກຄ້າ — ທຸກການເໜັງຕີງຄຳລົງບັນຊີຢູ່ <strong>AP (GOLD)</strong> ໝົດ
            (TOR §8.4 ແລະ §7.4): ຮັບເຂົ້າ = AP (+), ສົ່ງອອກ = AP (−).
            ໜ້ານີ້ຈຶ່ງບໍ່ມີລາຍການ ແລະ ຍອດເປັນ 0 — ບໍ່ແມ່ນລະບົບຜິດພາດ.
            ຖ້າຕ້ອງການໃຫ້ຄຳສົ່ງອອກລົງເປັນ AR ແທນ ແກ້ໄດ້ທີ່ຕາຕະລາງກົດ AP/AR (GOLD) ໂດຍບໍ່ຕ້ອງແກ້ໂຄ້ດ.
          </div>
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ຍອດລວມ {side} (GOLD)</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`ຍອດລວມ ${side} (GOLD)`}>
          <table className="table">
            <thead>
              <tr>
                <th>ປະເພດ</th>
                <th className="text-right">ຍອດຕັ້ງຕົ້ນ (g)</th>
                <th className="text-right">ຍອດເຄື່ອນໄຫວ (g)</th>
                <th className="text-right">ຍອດສຸດທິ (g)</th>
                <th className="text-right">ບາດຄຳ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={5}
                dense
                isLoading={summaryLoading}
                isError={summaryFailed}
                error={summaryError}
                isEmpty={summary.filter((r) => r.side === side).length === 0}
                emptyText="ຍັງບໍ່ມີຂໍ້ມູນຍອດລວມ"
                onRetry={() => void refetchSummary()}
              />
              {summary.filter((r) => r.side === side).map((row) => (
                <tr key={row.side}>
                  <td className="font-medium">{SIDE_LABEL[row.side]}</td>
                  <td className="num text-right">{formatWeight(row.startG)}</td>
                  <td className="num text-right">{formatWeight(row.netMovementG)}</td>
                  <td className="num text-right font-semibold">{formatWeight(row.totalG)}</td>
                  <td className="num text-right">{formatWeight(row.totalBaht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="card-title">ແຍກຕາມແຫຼ່ງ</h2>
            <p className="text-xs text-muted mt-0.5">ຄລິກທີ່ແຖວຄູ່ຄ້າເພື່ອເລືອກກອງສະເພາະປະຫວັດຂອງແຫຼ່ງນັ້ນ</p>
          </div>
          {selectedPartnerId && (
            <button
              type="button"
              className="btn-ghost btn-sm text-xs h-7 py-0"
              onClick={() => setSelectedPartnerId('')}
            >
              ສະແດງທຸກແຫຼ່ງ
            </button>
          )}
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`ແຍກຕາມແຫຼ່ງ`}>
          <table className="table">
            <thead>
              <tr>
                <th>ແຫຼ່ງ</th>
                <th>ດ້ານ</th>
                <th className="text-right">ຍອດຍົກມາ (g)</th>
                <th className="text-right">(+) g</th>
                <th className="text-right">(−) g</th>
                <th className="text-right">ຍອດປັດຈຸບັນ (g)</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={6}
                dense
                isLoading={partnersLoading}
                isError={partnersFailed}
                error={partnersError}
                isEmpty={filteredPartners.length === 0}
                emptyText="ຍັງບໍ່ມີຂໍ້ມູນ"
                onRetry={() => void refetchPartners()}
              />
              {filteredPartners.map((row) => {
                const isSelected = selectedPartnerId === row.partnerId;
                return (
                  <tr
                    key={`${row.partnerId}-${row.side}`}
                    className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                      isSelected ? 'bg-primary/10 font-medium' : ''
                    }`}
                    onClick={() =>
                      setSelectedPartnerId((curr) => (curr === row.partnerId ? '' : row.partnerId))
                    }
                    title="ຄລິກເພື່ອເລືອກກອງປະຫວັດຕາມແຫຼ່ງນີ້"
                  >
                    <td className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{row.partnerNameLo}</span>
                        {isSelected && (
                          <span className="badge badge-sm badge-primary text-[10px]">ເລືອກຢູ່</span>
                        )}
                      </div>
                    </td>
                    <td><span className={row.side === 'AP' ? 'status-danger' : 'status-success'}>{row.side}</span></td>
                    <td className="num text-right">{formatWeight(row.broughtForwardG)}</td>
                    <td className="num text-right text-success">{formatWeight(row.increasesG)}</td>
                    <td className="num text-right text-danger">{formatWeight(row.decreasesG)}</td>
                    <td className="num text-right font-semibold">{formatWeight(row.currentG)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 className="card-title">ປະຫວັດ AP-AR (GOLD)</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="partner-filter" className="text-xs font-medium text-muted">
              ແຫຼ່ງ/ຄູ່ຄ້າ:
            </label>
            <select
              id="partner-filter"
              className="select h-8 text-xs py-0 px-2"
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
            >
              <option value="">ທຸກແຫຼ່ງ ({filteredPartners.length})</option>
              {filteredPartners.map((p) => (
                <option key={p.partnerId} value={p.partnerId}>
                  {p.partnerNameLo}
                </option>
              ))}
            </select>
            {selectedPartnerId && (
              <button
                type="button"
                className="btn-ghost btn-sm text-xs py-0 h-8"
                onClick={() => setSelectedPartnerId('')}
                title="ລ້າງການເລືອກແຫຼ່ງ"
              >
                ລ້າງ
              </button>
            )}
          </div>
        </div>
        <DateRangeFilter history={historyRange} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`ປະຫວັດ AP-AR (GOLD)`}>
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງ</th>
                <th>ປະເພດ</th>
                <th className="text-right">ຄຳເຂົ້າ (g)</th>
                <th className="text-right">ຄຳອອກ (g)</th>
                <th className="text-right" title="ຍອດສະສົມຄຳຂອງຄູ່ຄ້ານີ້">ຍອດສະສົມ (g)</th>
                <th className="text-right">ຕົ້ນທຶນເຂົ້າ</th>
                <th className="text-right">ຕົ້ນທຶນອອກ</th>
                <th className="text-right" title="ຕົ້ນທຶນສະສົມຂອງຄູ່ຄ້ານີ້">ຕົ້ນທຶນສະສົມ</th>
                <th>ຜູ້ບັນທຶກ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={10}
                dense
                isError={historyFailed}
                error={historyError}
                isEmpty={history.filter((r) => r.side === side).length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void refetchHistory()}
              />
              {history.filter((r) => r.side === side).map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partner.nameLo}</td>
                  <td className="text-muted">
                    <div>{row.typeLabel}</div>
                    {row.note && <div className="text-xs text-muted/80 italic">{row.note}</div>}
                  </td>
                  <td className="num text-right">{formatWeight(row.goldInG)}</td>
                  <td className="num text-right">{formatWeight(row.goldOutG)}</td>
                  <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{formatLak(row.priceIn)}</td>
                  <td className="num text-right">{formatLak(row.priceOut)}</td>
                  <td className="num text-right font-medium">{formatLak(row.cost)}</td>
                  <td className="text-muted">{row.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
