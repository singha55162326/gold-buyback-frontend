'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { NumberInput } from '@/components/number-input';
import { TableStateRow } from '@/components/query-state';
import { PriceChart, type PricePoint } from '@/components/price-chart';
import { Dialog } from '@/components/dialog';
import { formatLak, formatWeight, formatDate, formatDateTime } from '@/lib/format';

interface PriceLine {
  tierCode: string;
  labelLo: string;
  category: 'JEWELRY' | 'BAR';
  displayWeightG: string;
  exchangeWeightG: string;
  sellPrice: string;
  buybackPrice: string;
  steps: { a: string; b: string; c: string; d: string } | null;
}

interface CurrentBoard {
  id: string;
  price1Baht: string;
  effectiveAt: string;
  lines: PriceLine[];
}

interface HistoryRow {
  id: string;
  date: string;
  price1Baht: string;
  updatedBy: string;
  note: string | null;
  /** ລາຄາຂອງແຕ່ລະນ້ຳໜັກ ຢູ່ເວລານັ້ນ — ເກັບທຸກຄັ້ງທີ່ລາຄາປ່ຽນ. */
  lines: Array<{
    tierCode: string;
    labelLo: string;
    category: 'JEWELRY' | 'BAR';
    displayWeightG: string;
    sellPrice: string;
    buybackPrice: string;
  }>;
}

/**
 * TOR §3.1 — ຈັດການ Products (ຕັ້ງລາຄາ & ສູດຄິດໄລ່).
 *
 * The A/B/C/D board is computed by the API when the price is saved; this page
 * shows the stored board returned by /pricing/current.
 */
export default function ProductsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  // Snapshot row ທີ່ກຳລັງເປີດ pop up modal ເບິ່ງລາຄາຕໍ່ນ້ຳໜັກ.
  const [viewingRow, setViewingRow] = useState<HistoryRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: current, isError: currentFailedRaw, error: currentError, refetch: refetchCurrent } = useQuery({
    queryKey: ['pricing', 'current'],
    queryFn: () => api.get<CurrentBoard>('/pricing/current'),
    retry: false,
  });

  const { data: history = [], isLoading: historyLoading, isError: historyFailed, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['pricing', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/pricing/history?limit=30'),
  });

  /** ຈຸດກຼາບ = ແຖວ 1 ບາດ (15 g) ຂອງແຕ່ລະ snapshot. */
  const chartPoints: PricePoint[] = history
    .map((row) => {
      const oneBaht = row.lines?.find((l) => Number(l.displayWeightG) === 15);
      return oneBaht
        ? { date: row.date, sellPrice: oneBaht.sellPrice, buybackPrice: oneBaht.buybackPrice }
        : null;
    })
    .filter((p): p is PricePoint => p !== null);

  // 404 on /pricing/current means "no price set yet" (empty text), not a failure.
  const currentFailed = currentFailedRaw && !(currentError instanceof ApiError && currentError.status === 404);

  const save = useMutation({
    mutationFn: (price1Baht: string) => api.post('/pricing/set', { price1Baht }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setInput('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['pricing'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const raw = input.replace(/,/g, '').trim();
  const isValidInput = /^\d+(\.\d+)?$/.test(raw) && Number(raw) > 0;

  const rows = current?.lines ?? [];

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການ Products"
        subtitle="ຕັ້ງລາຄາຮູບປະພັນ 1 ບາດ — ລະບົບຄິດໄລ່ລາຄາຂາຍ ແລະ ລາຄາຊື້ຄືນ ທຸກນ້ຳໜັກອັດຕະໂນມັດ (TOR §3.1)"
      />

      {/* Set Pricing */}
      <div data-fade className="card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="price1Baht">
              ລາຄາຂາຍ ຮູບປະພັນ 1 ບາດ (LAK)
            </label>
            <NumberInput
              id="price1Baht"
              className="input num"
              decimals={0}
              placeholder={current ? formatLak(current.price1Baht) : '45,859,000'}
              value={input}
              aria-describedby={error ? 'price-error' : undefined}
              onValueChange={setInput}
            />
          </div>

          <button
            className="btn-primary"
            disabled={!isValidInput || save.isPending}
            onClick={() => save.mutate(raw)}
          >
            {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'Set Pricing'}
          </button>

          <button className="btn-secondary" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? 'ເຊື່ອງສູດ A/B/C/D' : 'ສະແດງສູດ A/B/C/D'}
          </button>
        </div>

        {error && (
          <div id="price-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}
      </div>

      {/* Price board */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຕາຕະລາງລາຄາປັດຈຸບັນ</h2>
          {current && (
            <span className="text-xs text-muted">
              ອັບເດດລ່າສຸດ {formatDate(current.effectiveAt)}
            </span>
          )}
        </div>

        <div className="table-wrap" tabIndex={0} role="region" aria-label="ຕາຕະລາງລາຄາປັດຈຸບັນ">
          <table className="table">
            <thead>
              <tr>
                <th>ໝວດ / ລາຍການ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ນ້ຳໜັກປ່ຽນເປັນເງິນ</th>
                {showSteps && (
                  <>
                    <th className="text-right">A</th>
                    <th className="text-right">B</th>
                    <th className="text-right">C</th>
                    <th className="text-right">D</th>
                  </>
                )}
                <th className="text-right">ລາຄາຂາຍ (LAK)</th>
                <th className="text-right">ລາຄາຊື້ຄືນ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={showSteps ? 9 : 5}
                isError={currentFailed}
                error={currentError}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີການຕັ້ງລາຄາ — ປ້ອນລາຄາຂາຍ 1 ບາດ ດ້ານເທິງ ແລ້ວກົດ Set Pricing"
                onRetry={() => void refetchCurrent()}
              />
              {rows.map((line) => (
                <tr key={line.tierCode}>
                  <td className="font-medium">{line.labelLo}</td>
                  <td className="num text-right text-muted">
                    {formatWeight(line.displayWeightG)}
                  </td>
                  <td className="num text-right text-muted">
                    {formatWeight(line.exchangeWeightG)}
                  </td>
                  {showSteps && (
                    <>
                      <td className="num text-right text-xs text-muted">
                        {line.steps ? formatLak(line.steps.a) : '—'}
                      </td>
                      <td className="num text-right text-xs text-muted">
                        {line.steps ? formatLak(line.steps.b) : '—'}
                      </td>
                      <td className="num text-right text-xs text-muted">
                        {line.steps ? formatLak(line.steps.c) : '—'}
                      </td>
                      <td className="num text-right text-xs text-muted">
                        {line.steps ? formatLak(line.steps.d) : '—'}
                      </td>
                    </>
                  )}
                  <td className="num sell-price text-right">{formatLak(line.sellPrice)}</td>
                  <td className="num text-right">{formatLak(line.buybackPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ກຼາບລາຄາ ຮູບປະພັນ 1 ບາດ — ຈາກ snapshot ດຽວກັນກັບຕາຕະລາງປະຫວັດ,
          ສະນັ້ນຕົວເລກໃນກຼາບ ກັບ ໃນຕາຕະລາງ ແມ່ນຊຸດດຽວກັນສະເໝີ. */}
      <PriceChart points={chartPoints} />

      {/* History Products — 30 rows (TOR §3.1) */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Products</h2>
          <span className="text-xs text-muted">30 ແຖວລ່າສຸດ</span>
        </div>
        <p className="border-b border-line px-5 py-3 text-xs text-muted">
          ທຸກຄັ້ງທີ່ລາຄາປ່ຽນ — ທັງຈາກການຕັ້ງ ລາຄາຂາຍ 1 ບາດ ແລະ ຈາກການແກ້ ຫັກອອກ (%) /
          ລາຄາລົບອອກ ຢູ່ໜ້າ ຈັດການ ຄ່າຫັກ — ຈະບັນທຶກເປັນແຖວໃໝ່ພ້ອມລາຄາຊື້ຄືນຂອງທຸກນ້ຳໜັກ.
          ກົດ View ເພື່ອເປີດ modal ເບິ່ງລາຄາ snapshot ຂອງເວລານັ້ນ.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Products">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ ແລະ ເວລາ</th>
                <th className="text-right">ລາຄາຂາຍ 1 ບາດ</th>
                <th className="text-right">ລາຄາຊື້ຄືນ 1 ບາດ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th>ໝາຍເຫດ</th>
                <th className="text-right">ລາຄາທຸກນ້ຳໜັກ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={6}
                isLoading={historyLoading}
                isError={historyFailed}
                error={historyError}
                isEmpty={history.length === 0}
                emptyText="ຍັງບໍ່ມີປະຫວັດ"
                dense
                onRetry={() => void refetchHistory()}
              />
              {history.map((row) => {
                // ລາຄາຊື້ຄືນ 1 ບາດ = ແຖວ 1 ບາດ ຂອງ snapshot ນັ້ນ; ເປັນຕົວເລກ
                // ທີ່ພະນັກງານເບິ່ງຫຼາຍທີ່ສຸດ ຈຶ່ງເອົາຂຶ້ນມາເປັນຖັນ.
                const oneBaht = row.lines?.find((l) => Number(l.displayWeightG) === 15);
                return (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.date)}</td>
                    <td className="num text-right">{formatLak(row.price1Baht)}</td>
                    <td className="num text-right font-medium">
                      {oneBaht ? formatLak(oneBaht.buybackPrice) : '—'}
                    </td>
                    <td>{row.updatedBy}</td>
                    <td className="text-muted">{row.note ?? '—'}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost inline-flex items-center gap-1.5"
                        aria-haspopup="dialog"
                        aria-label={`ເບິ່ງລາຄາ snapshot ${formatDateTime(row.date)}`}
                        disabled={(row.lines?.length ?? 0) === 0}
                        onClick={() => setViewingRow(row)}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ເບິ່ງລາຄາ snapshot ທຸກນ້ຳໜັກ */}
      <Dialog
        open={viewingRow !== null}
        onClose={() => setViewingRow(null)}
        dismissOnScrim
        size="lg"
        title="ລາຍລະອຽດລາຄາ snapshot"
        footer={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setViewingRow(null)}
          >
            ປິດ
          </button>
        }
      >
        {viewingRow && (
          <div className="space-y-4">
            {/* ສະຫຼຸບຂໍ້ມູນ Snapshot */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card p-3">
                <div className="text-xs text-muted">ວັນທີ ແລະ ເວລາ</div>
                <div className="mt-1 text-sm font-medium">{formatDateTime(viewingRow.date)}</div>
              </div>
              <div className="card p-3">
                <div className="text-xs text-muted">ຜູ້ແກ້ໄຂ</div>
                <div className="mt-1 text-sm font-medium">{viewingRow.updatedBy || '—'}</div>
              </div>
              <div className="card p-3">
                <div className="text-xs text-muted">ລາຄາຂາຍ 1 ບາດ</div>
                <div className="mt-1 text-sm font-semibold text-gold num">{formatLak(viewingRow.price1Baht)} LAK</div>
              </div>
              <div className="card p-3">
                <div className="text-xs text-muted">ລາຄາຊື້ຄືນ 1 ບາດ</div>
                <div className="mt-1 text-sm font-semibold num">
                  {(() => {
                    const oneBaht = viewingRow.lines?.find((l) => Number(l.displayWeightG) === 15);
                    return oneBaht ? `${formatLak(oneBaht.buybackPrice)} LAK` : '—';
                  })()}
                </div>
              </div>
            </div>

            {viewingRow.note && (
              <div className="notice status-warning">
                <span className="font-medium">ໝາຍເຫດ:</span> {viewingRow.note}
              </div>
            )}

            {/* ຕາຕະລາງລາຄາແຕ່ລະນ້ຳໜັກ */}
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label={`ລາຄາທຸກນ້ຳໜັກ ${formatDateTime(viewingRow.date)}`}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>ໝວດ / ລາຍການ</th>
                    <th>ປະເພດ</th>
                    <th className="text-right">ນ້ຳໜັກ (g)</th>
                    <th className="text-right">ລາຄາຂາຍ (LAK)</th>
                    <th className="text-right">ລາຄາຊື້ຄືນ (LAK)</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingRow.lines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-sm text-muted">
                        ບໍ່ມີຂໍ້ມູນລາຄາໃນ snapshot ນີ້
                      </td>
                    </tr>
                  ) : (
                    viewingRow.lines.map((line) => {
                      const isOneBaht = Number(line.displayWeightG) === 15;
                      return (
                        <tr key={line.tierCode} className={isOneBaht ? 'bg-gold-tint font-medium' : undefined}>
                          <td className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{line.labelLo}</span>
                              {isOneBaht && (
                                <span className="badge text-[10px]">
                                  1 ບາດ
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="badge text-[11px] text-muted">
                              {line.category === 'BAR' ? 'ຄຳແທ່ງ' : 'ຮູບປະພັນ'}
                            </span>
                          </td>
                          <td className="num text-right text-muted">{formatWeight(line.displayWeightG)}</td>
                          <td className="num sell-price text-right">{formatLak(line.sellPrice)}</td>
                          <td className="num text-right font-medium">{formatLak(line.buybackPrice)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
