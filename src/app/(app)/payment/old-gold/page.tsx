'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { Dialog } from '@/components/dialog';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { statusClass } from '@/lib/status';

interface GoldType { id: string; code: string; nameLo: string }

interface SummaryRow {
  goldTypeId: string; goldTypeCode: string; goldTypeNameLo: string;
  weightG: string; bahtWeight: string; quantity: number; totalPaid: string;
  receivedG: string; handedG: string; receivedPaid: string; handedPaid: string;
  averagePerGram: string | null; averagePerBaht: string | null;
  averageMessageLo: string | null;
}

/** ລາຍການ Buyback ຄຳຕົ້ມ ທີ່ຮັບຊື້ຄືນແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ມອບເຂົ້າສາງ. */
interface PendingItem {
  id: string; code: string; weightG: string; quantity: number;
  goldPercent: string | null; payableAmount: string; totalWeightG: string;
  createdAt: string;
  goldItem: { nameLo: string } | null;
  goldType: { nameLo: string };
  customer: { phone: string };
}

interface HandoverRow {
  id: string; code: string; roundNo: number | null;
  weightG: string; grossWeightG: string | null; pureWeightG: string | null;
  glassWeightG: string | null; shortfallG: string | null;
  status: string; note: string | null; createdAt: string;
  goldType: { nameLo: string };
  shift: { user: { fullName: string } };
  items: Array<{
    id: string; weightG: string; quantity: number; goldPercent: string | null;
    buyback: { code: string; goldItem: { nameLo: string } | null };
  }>;
}

const STATUS: Record<string, { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າ Warehouse ຮັບ' },
  APPROVED: { lo: 'ຮັບແລ້ວ' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ສຳເລັດ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

/** ຄຳຕົ້ມ ມອບເປັນລາຍການ; ປະເພດອື່ນ ຊັ່ງເປັນຮອບ. */
const BOILED = 'BOILED';

/** TOR §4.2 — ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ. */
export default function OldGoldPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // ສອງປຸ່ມ, ສອງຟອມ: 'ROUND' = ຄຳດີ/ຄຳຫຍຸບ/ແທ່ງ, 'BOILED' = ຄຳຕົ້ມ.
  const [mode, setMode] = useState<'ROUND' | 'BOILED' | null>(null);
  const [goldTypeId, setGoldTypeId] = useState('');
  const [grossWeightG, setGrossWeightG] = useState('');
  const [pureWeightG, setPureWeightG] = useState('');
  const [glassWeightG, setGlassWeightG] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: goldTypes = [], isError: goldTypesFailed, error: goldTypesError, refetch: refetchGoldTypes } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const { data: summary = [], isError: summaryFailed, error: summaryError, refetch: refetchSummary } = useQuery({
    queryKey: ['stock', 'old-gold-summary'],
    queryFn: () => api.get<SummaryRow[]>('/stock/old-gold-summary'),
  });
  // ດຶງສະເພາະເມື່ອຟອມ ຄຳຕົ້ມ ເປີດ — ບໍ່ດຶງ 500 ແຖວໄວ້ລ້າໆ.
  const { data: pending = [], isError: pendingFailed, error: pendingError, refetch: refetchPending } = useQuery({
    queryKey: ['stock', 'handovers', 'pending-items'],
    queryFn: () => api.get<PendingItem[]>('/stock/handovers/pending-items'),
    enabled: mode === 'BOILED',
  });
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; ກວ້າງອອກໄດ້ຈາກແຖບ filter.
  const history = useHistoryRange<HandoverRow>(['stock', 'handovers'], '/stock/handovers');

  const roundTypes = goldTypes.filter((t) => t.code !== BOILED);
  const boiledType = goldTypes.find((t) => t.code === BOILED);

  const shortfall = useMemo(() => {
    const gross = Number(grossWeightG || 0);
    const parts = Number(pureWeightG || 0) + Number(glassWeightG || 0);
    if (!grossWeightG.trim()) return null;
    return gross - parts;
  }, [grossWeightG, pureWeightG, glassWeightG]);

  const pickedRows = pending.filter((p) => picked.includes(p.id));
  const pickedWeight = pickedRows.reduce((sum, r) => sum + Number(r.totalWeightG), 0);
  const pickedQty = pickedRows.reduce((sum, r) => sum + r.quantity, 0);
  const pickedPaid = pickedRows.reduce((sum, r) => sum + Number(r.payableAmount), 0);

  const closeForm = () => {
    setMode(null);
    setGrossWeightG(''); setPureWeightG(''); setGlassWeightG('');
    setPicked([]); setNote(''); setError(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/stock/handovers', {
        goldTypeId: mode === 'BOILED' ? boiledType?.id : goldTypeId,
        ...(mode === 'BOILED'
          ? { buybackIds: picked }
          : {
              grossWeightG: grossWeightG.trim(),
              pureWeightG: pureWeightG.trim() || '0',
              glassWeightG: glassWeightG.trim() || '0',
            }),
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      closeForm();
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const canSaveRound =
    Boolean(goldTypeId) && Number(grossWeightG) > 0 && (shortfall ?? -1) >= 0;
  const canSaveBoiled = Boolean(boiledType) && picked.length > 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ"
        subtitle="ຄຳເກົ່າທີ່ຮັບເຂົ້າໃນມື້ ແລະ ການມອບຄຳລະຫວ່າງມື້ໃຫ້ສາງ (TOR §4.2)"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => { setMode('ROUND'); setError(null); }}>
              + ມອບຄຳລະຫວ່າງມື້ — ຄຳດີ / ຄຳຫຍຸບ / ແທ່ງ
            </button>
            <button className="btn-secondary" onClick={() => { setMode('BOILED'); setError(null); }}>
              + ມອບຄຳລະຫວ່າງມື້ — ຄຳຕົ້ມ
            </button>
            <button className="btn-secondary" onClick={() => window.print()}>ພິມຕາຕະລາງ</button>
          </div>
        }
      />
      {goldTypesFailed && <QueryErrorNotice error={goldTypesError} onRetry={() => void refetchGoldTypes()} />}

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ສະຫຼຸບປະເພດຄຳ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ສະຫຼຸບປະເພດຄຳ">
          <table className="table">
            <thead>
              <tr>
                <th>ປະເພດຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g) ຄົງເຫຼືອ</th>
                <th className="text-right">ບາດຄຳ (= g/15)</th>
                <th className="text-right">TOTAL ເງິນຈ່າຍຄົງເຫຼືອ</th>
                <th className="text-right">ສະເລ່ຍ / g</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={5} isError={summaryFailed} error={summaryError} isEmpty={summary.length === 0} emptyText="ຍັງບໍ່ມີຂໍ້ມູນໃນມື້ນີ້" onRetry={() => void refetchSummary()} />
              {summary.map((row) => (
                <tr key={row.goldTypeId}>
                  <td className="font-medium">{row.goldTypeNameLo}</td>
                  <td className="num text-right"
                    title={`ຮັບຈາກຜູ້ປະເມີນ ${formatWeight(row.receivedG)} g − ມອບເຂົ້າສາງ ${formatWeight(row.handedG)} g`}>
                    {formatWeight(row.weightG)}
                  </td>
                  <td className="num text-right">{formatWeight(row.bahtWeight)}</td>
                  <td className="num text-right font-medium"
                    title={`ຮັບ ${formatLak(row.receivedPaid)} − ມອບແລ້ວ ${formatLak(row.handedPaid)}`}>
                    {formatLak(row.totalPaid)}
                  </td>
                  <td className="num text-right" title={row.averageMessageLo ?? ''}>
                    {row.averagePerGram ? formatLak(row.averagePerGram) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ຄົງເຫຼືອ = ຮັບຈາກຜູ້ປະເມີນ − ມອບເຂົ້າສາງຄຳເກົ່າ (ວາງເມົາສ໌ເທິງຕົວເລກເພື່ອເບິ່ງສອງສ່ວນນັ້ນ) ·
          ຄຳດີ/ຫຍຸບ/ແທ່ງ: ສະເລ່ຍ(g) = ເງິນຈ່າຍຄົງເຫຼືອ / (ນ້ຳໜັກຄົງເຫຼືອ − ລວມນ້ຳໜັກຄຳໃໝ່) ·
          ຄຳຕົ້ມ: ສະເລ່ຍ(g) = ເງິນຈ່າຍຄົງເຫຼືອ / ນ້ຳໜັກຄົງເຫຼືອ. ສະແດງ &quot;—&quot; ເມື່ອຕົວຫານເປັນ 0 ຫຼື ຕິດລົບ.
        </p>
      </div>

      {/* ── ຟອມ ຄຳດີ / ຄຳຫຍຸບ / ແທ່ງ (ໄລ່ເປັນຮອບ) ── */}
      <Dialog
        open={mode === 'ROUND'}
        onClose={closeForm}
        title="ມອບຄຳລະຫວ່າງມື້ — ຄຳດີ / ຄຳຫຍຸບ / ແທ່ງ"
        footer={
          <>
            <button className="btn-secondary" onClick={closeForm}>ຍົກເລີກ</button>
            <button className="btn-primary" disabled={!canSaveRound || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງສົ່ງ...' : 'ມອບຄຳ (ຮອບຕໍ່ໄປ)'}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="goldType">ປະເພດຄຳ</label>
            <select id="goldType" className="input input-lg" value={goldTypeId}
              onChange={(e) => setGoldTypeId(e.target.value)}>
              <option value="">— ເລືອກປະເພດຄຳ —</option>
              {roundTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="gross">ນ້ຳໜັກອອກ (g)</label>
            <NumberInput decimals={4} id="gross" className="input input-lg num"
              value={grossWeightG} onValueChange={setGrossWeightG} />
          </div>
          <div>
            <label className="label" htmlFor="pure">ເນື້ອລ້ວນ (g)</label>
            <NumberInput decimals={4} id="pure" className="input input-lg num"
              value={pureWeightG} onValueChange={setPureWeightG} />
          </div>
          <div>
            <label className="label" htmlFor="glass">ມີແກ້ວ (g)</label>
            <NumberInput decimals={4} id="glass" className="input input-lg num"
              value={glassWeightG} onValueChange={setGlassWeightG} />
          </div>
          <div className="sm:col-span-2">
            <span className="label">ນ້ຳໜັກຂາດດຸ (g)</span>
            <div className={`input input-lg num flex items-center ${shortfall !== null && shortfall < 0 ? 'status-danger' : ''}`}>
              {shortfall === null ? '—' : formatWeight(String(shortfall))}
            </div>
            <p className="mt-1 text-xs text-muted">
              ຂາດດຸ = ນ້ຳໜັກອອກ − (ເນື້ອລ້ວນ + ມີແກ້ວ) · ເນື້ອລ້ວນ + ມີແກ້ວ ຕ້ອງບໍ່ເກີນ ນ້ຳໜັກອອກ
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="note">ໝາຍເຫດ</label>
            <input id="note" className="input input-lg" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && <div role="alert" className="notice status-danger mt-3">{error}</div>}
        <p className="mt-2 text-xs text-muted">ຮອບທີ ອອກໃຫ້ອັດຕະໂນມັດຕາມມື້ການຄ້າ · ສົ່ງໃຫ້ Warehouse ກົດ Approve</p>
      </Dialog>

      {/* ── ຟອມ ຄຳຕົ້ມ (ເລືອກລາຍການ, ບໍ່ໄລ່ເປັນຮອບ) ── */}
      <Dialog
        open={mode === 'BOILED'}
        onClose={closeForm}
        title="ມອບຄຳລະຫວ່າງມື້ — ຄຳຕົ້ມ"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={closeForm}>ຍົກເລີກ</button>
            <button className="btn-primary" disabled={!canSaveBoiled || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງສົ່ງ...' : `ມອບຄຳ ${picked.length} ລາຍການ`}
            </button>
          </>
        }
      >
        {pendingFailed && <QueryErrorNotice error={pendingError} onRetry={() => void refetchPending()} />}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການຄຳເກົ່າທີ່ຍັງບໍ່ໄດ້ມອບ">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" aria-label="ເລືອກທັງໝົດ"
                    checked={pending.length > 0 && picked.length === pending.length}
                    onChange={(e) => setPicked(e.target.checked ? pending.map((p) => p.id) : [])} />
                </th>
                <th>ລະຫັດ</th>
                <th>ລາຍການຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ຈຳນວນ</th>
                <th className="text-right">%ຄຳ</th>
                <th className="text-right">ເງິນທີ່ຈ່າຍ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={7} isError={pendingFailed} error={pendingError}
                isEmpty={pending.length === 0} emptyText="ບໍ່ມີລາຍການຄຳຕົ້ມ ທີ່ຍັງບໍ່ໄດ້ມອບ"
                onRetry={() => void refetchPending()} />
              {pending.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" aria-label={`ເລືອກ ${row.code}`}
                      checked={picked.includes(row.id)}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                        )} />
                  </td>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{row.goldItem?.nameLo ?? '—'}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{row.quantity}</td>
                  <td className="num text-right">{row.goldPercent ? `${Number(row.goldPercent)}%` : '—'}</td>
                  <td className="num text-right">{formatLak(row.payableAmount)}</td>
                </tr>
              ))}
            </tbody>
            {picked.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} className="font-medium">ລວມທີ່ເລືອກ ({picked.length} ລາຍການ)</td>
                  <td className="num text-right font-medium">{formatWeight(String(pickedWeight))}</td>
                  <td className="num text-right font-medium">{pickedQty}</td>
                  <td />
                  <td className="num text-right font-medium">{formatLak(String(pickedPaid))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="note-boiled">ໝາຍເຫດ</label>
          <input id="note-boiled" className="input input-lg" value={note}
            onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div role="alert" className="notice status-danger mt-3">{error}</div>}
        <p className="mt-2 text-xs text-muted">
          ຄຳຕົ້ມ ມອບເປັນລາຍການ ບໍ່ໄລ່ເປັນຮອບ · ລາຍການທີ່ມອບແລ້ວຈະຫຼຸດອອກຈາກລາຍການນີ້ທັນທີ
        </p>
      </Dialog>

      {/* ── History ມອບຄຳ ── */}
      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History ມອບຄຳ</h2></div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ມອບຄຳ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th className="text-right">ຮອບທີ</th>
                <th>ວັນທີ</th>
                <th>ປະເພດຄຳ</th>
                <th className="text-right">ນ້ຳໜັກອອກ (g)</th>
                <th className="text-right">ເນື້ອລ້ວນ (g)</th>
                <th className="text-right">ມີແກ້ວ (g)</th>
                <th className="text-right">ຂາດດຸ (g)</th>
                <th>ຜູ້ມອບ</th>
                <th>ສະຖານະ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={10} isError={history.isError} error={history.error}
                isEmpty={history.rows.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void history.refetch()} />
              {history.rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">
                    {row.code}
                    {row.items.length > 0 && (
                      <span className="ml-1 text-muted">({row.items.length} ລາຍການ)</span>
                    )}
                  </td>
                  <td className="num text-right">{row.roundNo ?? '—'}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.goldType.nameLo}</td>
                  <td className="num text-right">{formatWeight(row.grossWeightG ?? row.weightG)}</td>
                  <td className="num text-right">{row.pureWeightG ? formatWeight(row.pureWeightG) : '—'}</td>
                  <td className="num text-right">{row.glassWeightG ? formatWeight(row.glassWeightG) : '—'}</td>
                  <td className="num text-right">{row.shortfallG ? formatWeight(row.shortfallG) : '—'}</td>
                  <td>{row.shift.user.fullName}</td>
                  <td>
                    <span className={statusClass(row.status)}>
                      {STATUS[row.status]?.lo ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
