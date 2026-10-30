'use client';

import { Fragment, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { formatLak, formatWeight, formatDate, formatDateTime } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { Dialog } from '@/components/dialog';
import { PrintSheet } from '@/components/print-sheet';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import {
  DateRangeFilter,
  canPickDates,
  isValidRange,
  rangeProblem,
  today,
  useHistoryRange,
  type PagedResult,
} from '@/components/date-range';
import { statusClass } from '@/lib/status';

interface GoldType { id: string; code: string; nameLo: string }

interface SummaryRow {
  goldTypeId: string; goldTypeCode: string; goldTypeNameLo: string;
  /** ຕາຕະລາງ 1 — ຮັບມາຈາກຜູ້ປະເມີນ. */
  receivedG: string; receivedBahtWeight: string; receivedPaid: string;
  receivedAveragePerGram: string | null; receivedAveragePerBaht: string | null;
  /** ຕາຕະລາງ 2 — ຫຼັງສົ່ງມອບເຂົ້າສາງ. */
  handedG: string; handedPaid: string;
  weightG: string; bahtWeight: string; totalPaid: string;
  averagePerGram: string | null; averagePerBaht: string | null; averageMessageLo: string | null;
  quantity: number; newWeightG: string;
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
  glassWeightG: string | null; shortfallG: string | null; warehouseCost: string | null;
  status: string; note: string | null; createdAt: string;
  goldType: { id: string; code: string; nameLo: string };
  shift: { user: { fullName: string } };
  createdBy: string;
  items: Array<{
    id: string; weightG: string; quantity: number;
    goldPercent: string | null; payableAmount: string;
    buyback: { code: string; goldItem: { nameLo: string } | null };
  }>;
}

const STATUS: Record<string, { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າສາງຢືນຢັນ' },
  APPROVED: { lo: 'ສາງຮັບແລ້ວ' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ສຳເລັດ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

/** ຄຳຕົ້ມ ມອບເປັນລາຍການ; ປະເພດອື່ນ ຊັ່ງເປັນຮອບ. */
const BOILED = 'BOILED';
/** ຄຳແທ່ງ ບໍ່ແຍກ ເນື້ອລ້ວນ / ມີແກ້ວ. */
const BAR = 'BAR';

/** ຈຸດສີນຳໜ້າຊື່ປະເພດຄຳ — ອ່ານຕາຕະລາງກວ້າງໄດ້ໄວຂຶ້ນ. */
const DOT: Record<string, string> = {
  GOOD: 'bg-success-dot',
  HUMP: 'bg-warning-dot',
  BAR: 'bg-gold',
  BOILED: 'bg-danger-dot',
};

function TypeName({ code, nameLo }: { code: string; nameLo: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <i className={`h-2 w-2 shrink-0 rounded-full ${DOT[code] ?? 'bg-gold'}`} aria-hidden="true" />
      {nameLo}
    </span>
  );
}

const num = (v: string | null | undefined) => Number(v ?? 0);
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
/** ຂາດດຸ = ນ້ຳໜັກລວມອອກ − (ເນື້ອລ້ວນ + ມີແກ້ວ) — ປົກກະຕິຕິດລົບເລັກນ້ອຍ. */
const shortfallOf = (r: { grossWeightG: string | null; weightG: string; pureWeightG: string | null; glassWeightG: string | null }) =>
  num(r.grossWeightG ?? r.weightG) - (num(r.pureWeightG) + num(r.glassWeightG));

/** ຕົວເລກທີ່ອາດຕິດລົບ: ສະແດງເຄື່ອງໝາຍ ແລະ ສີໃຫ້ເຫັນທັນທີ. */
function Delta({ value }: { value: number }) {
  const cls = value < 0 ? 'text-danger' : value > 0 ? 'text-success' : 'text-muted';
  return <span className={cls}>{value < 0 ? '−' : ''}{formatWeight(String(Math.abs(value)))}</span>;
}

/** ແຖວໃນຕາຕະລາງ "ຮອບ": ຮອບໜຶ່ງມີໄດ້ຫຼາຍປະເພດຄຳ. */
interface RoundRow {
  key: string; roundNo: number; date: string;
  byType: Record<string, HandoverRow>;
}

function groupRounds(rows: HandoverRow[]): RoundRow[] {
  const map = new Map<string, RoundRow>();
  for (const row of rows) {
    if (row.roundNo === null || row.goldType.code === BOILED) continue;
    const date = row.createdAt.slice(0, 10);
    const key = `${date}#${row.roundNo}`;
    const entry = map.get(key) ?? { key, roundNo: row.roundNo, date, byType: {} };
    entry.byType[row.goldType.code] = row;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.roundNo - b.roundNo);
}

/** ແຖວຄຳຕົ້ມ: ແຕ່ລະລາຍການທີ່ມອບ ເປັນໜຶ່ງແຖວ. */
interface BoilRow {
  id: string; code: string; nameLo: string; weightG: number; quantity: number;
  goldPercent: string | null; cost: number; date: string;
}

function flattenBoils(rows: HandoverRow[]): BoilRow[] {
  const out: BoilRow[] = [];
  for (const row of rows) {
    if (row.goldType.code !== BOILED) continue;
    for (const item of row.items) {
      out.push({
        id: item.id,
        code: item.buyback.code,
        nameLo: item.buyback.goldItem?.nameLo ?? '—',
        // ຫົວບິນເກັບຍອດລວມຢູ່ແລ້ວ — ບໍ່ຄູນດ້ວຍຈຳນວນອີກ.
        weightG: num(item.weightG),
        quantity: item.quantity,
        goldPercent: item.goldPercent,
        cost: num(item.payableAmount),
        date: row.createdAt.slice(0, 10),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

/** TOR §4.2 — ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ. */
export default function OldGoldPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [mode, setMode] = useState<'ROUND' | 'BOILED' | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // ── ຟອມຮອບ: ເລືອກໄດ້ຫຼາຍປະເພດຄຳໃນຮອບດຽວ
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [weights, setWeights] = useState<Record<string, { out: string; pure: string; glass: string }>>({});
  // ── ຟອມຄຳຕົ້ມ
  const [picked, setPicked] = useState<string[]>([]);
  const [poolQuery, setPoolQuery] = useState('');

  // ── ຊ່ວງວັນທີຂອງຕາຕະລາງໃບພິມ (ມີປຸ່ມລັດ ມື້ນີ້ / 7 ມື້ / ເດືອນນີ້)
  const [dlFrom, setDlFrom] = useState(today());
  const [dlTo, setDlTo] = useState(today());
  const [chip, setChip] = useState<'today' | '7d' | 'month' | null>('today');
  // ── ຕົວກອງ History
  const [historyType, setHistoryType] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');

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

  /*
   * ຊ່ອງວັນທີຂອງ ໃບມອບຄຳ ເຄີຍສົ່ງເຂົ້າ URL ໂດຍກົງ: ລ້າງຊ່ອງໃດຊ່ອງໜຶ່ງອອກ
   * ຈະໄດ້ `?from_date=` ວ່າງ ແລ້ວໃບມອບຄຳຫວ່າງເປົ່າ. ກັ້ນໄວ້ທີ່ນີ້ ແລະ ຮັກສາ
   * ຜົນເກົ່າໄວ້ໃຫ້ເຫັນ ແທນທີ່ຈະລ້າງໜ້າຈໍຂະນະຜູ້ໃຊ້ກຳລັງພິມ.
   */
  const dlProblem = rangeProblem(dlFrom, dlTo);

  const delivery = useQuery({
    queryKey: ['stock', 'handovers', 'delivery', dlFrom, dlTo],
    queryFn: () =>
      api.get<PagedResult<HandoverRow>>(
        `/stock/handovers?from_date=${dlFrom}&to_date=${dlTo}&all=true`,
      ),
    enabled: isValidRange(dlFrom, dlTo),
    placeholderData: keepPreviousData,
  });

  // ປະເພດຄຳກອງຢູ່ server (ປ່ຽນບໍ່ຖີ່); ຄຳຄົ້ນຫາກອງຢູ່ client ເພື່ອໃຫ້ທັນທີ.
  const history = useHistoryRange<HandoverRow>(['stock', 'handovers'], '/stock/handovers', {
    params: { goldTypeId: historyType || undefined },
  });

  const roundTypes = goldTypes.filter((t) => t.code !== BOILED);
  const boiledType = goldTypes.find((t) => t.code === BOILED);
  const remainingByType = useMemo(
    () => new Map(summary.map((r) => [r.goldTypeId, num(r.weightG)])),
    [summary],
  );
  const averageByType = useMemo(
    () => new Map(summary.map((r) => [r.goldTypeId, num(r.receivedAveragePerGram)])),
    [summary],
  );

  const deliveryRows = delivery.data?.rows ?? [];
  const rounds = useMemo(() => groupRounds(deliveryRows), [deliveryRows]);
  const boils = useMemo(() => flattenBoils(deliveryRows), [deliveryRows]);
  const multiDay = dlFrom !== dlTo;

  // ── History: ແຜ່ຮອບອອກເປັນແຖວລະປະເພດຄຳ, ແລ້ວຈຶ່ງກອງດ້ວຍຄຳຄົ້ນຫາ
  const historyRows = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const rows = history.rows.flatMap((row) =>
      row.goldType.code === BOILED && row.items.length > 0
        ? row.items.map((item) => ({ row, item }))
        : [{ row, item: null as HandoverRow['items'][number] | null }],
    );
    if (!q) return rows;
    return rows.filter(({ row, item }) =>
      [row.code, item?.buyback.code, item?.buyback.goldItem?.nameLo, row.shift.user.fullName, row.createdBy]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [history.rows, historyQuery]);

  const setRange = (kind: 'today' | '7d' | 'month') => {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const iso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    let from = today();
    if (kind === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      from = iso(d);
    }
    if (kind === 'month') from = `${today().slice(0, 8)}01`;
    setDlFrom(from);
    setDlTo(today());
    setChip(kind);
  };

  const closeForm = () => {
    setMode(null);
    setSelected({});
    setWeights({});
    setPicked([]);
    setPoolQuery('');
    setNote('');
    setError(null);
  };

  const line = (id: string) => weights[id] ?? { out: '', pure: '', glass: '' };
  const setLine = (id: string, patch: Partial<{ out: string; pure: string; glass: string }>) =>
    setWeights((prev) => ({ ...prev, [id]: { ...line(id), ...patch } }));

  /** ກວດແຕ່ລະແຖວຢູ່ໜ້າຈໍດ້ວຍກົດດຽວກັນກັບ server. */
  const checkLine = (type: GoldType) => {
    const { out, pure, glass } = line(type.id);
    const o = Number(out);
    const split = type.code !== BAR;
    const remaining = remainingByType.get(type.id) ?? 0;
    if (!out.trim()) return { ready: false, message: '' };
    if (!(o > 0)) return { ready: false, message: 'ນ້ຳໜັກຕ້ອງຫຼາຍກວ່າ 0' };
    if (o > remaining + 1e-9) {
      return { ready: false, message: `ນ້ຳໜັກເກີນຍອດຄົງເຫຼືອ (${formatWeight(String(remaining))} g)` };
    }
    if (!split) return { ready: true, message: '' };
    if (!pure.trim() || !glass.trim()) return { ready: false, message: '' };
    const parts = Number(pure) + Number(glass);
    if (parts < o - 1e-9) {
      return {
        ready: false,
        message: `ເນື້ອລ້ວນ + ມີແກ້ວ (${formatWeight(String(parts))} g) ນ້ອຍກວ່ານ້ຳໜັກລວມອອກ (${formatWeight(String(o))} g) — ຫຼາຍກວ່າໄດ້ ແຕ່ນ້ອຍກວ່າບໍ່ໄດ້`,
      };
    }
    return { ready: true, message: '' };
  };

  const chosenTypes = roundTypes.filter((t) => selected[t.id]);
  const roundReady = chosenTypes.length > 0 && chosenTypes.every((t) => checkLine(t).ready);
  const roundTotalG = sum(chosenTypes.map((t) => Number(line(t.id).out) || 0));
  const roundTotalCost = sum(
    chosenTypes.map((t) => (Number(line(t.id).out) || 0) * (averageByType.get(t.id) ?? 0)),
  );

  const poolRows = pending.filter((p) => {
    const q = poolQuery.trim().toLowerCase();
    return !q || `${p.code} ${p.goldItem?.nameLo ?? ''}`.toLowerCase().includes(q);
  });
  const pickedRows = pending.filter((p) => picked.includes(p.id));
  const pickedWeight = sum(pickedRows.map((r) => num(r.totalWeightG)));
  const pickedPaid = sum(pickedRows.map((r) => num(r.payableAmount)));

  const create = useMutation({
    mutationFn: () =>
      mode === 'BOILED'
        ? api.post('/stock/handovers', {
            goldTypeId: boiledType?.id,
            buybackIds: picked,
            note: note || undefined,
          })
        : api.post('/stock/handovers', {
            lines: chosenTypes.map((t) => ({
              goldTypeId: t.id,
              outWeightG: line(t.id).out.trim(),
              ...(t.code === BAR
                ? {}
                : { pureWeightG: line(t.id).pure.trim(), glassWeightG: line(t.id).glass.trim() }),
            })),
            note: note || undefined,
          }),
    onSuccess: () => {
      toast.success('ບັນທຶກການມອບແລ້ວ');
      closeForm();
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ"
        subtitle="ຄຳເກົ່າທີ່ຮັບມາຈາກຜູ້ປະເມີນ ແລະ ການມອບຄຳລະຫວ່າງມື້ເຂົ້າສາງຄຳເກົ່າ (TOR §4.2)"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => { setMode('ROUND'); setError(null); }}>
              + ມອບຄຳລະຫວ່າງມື້ — ຄຳດີ / ຄຳຫຍຸບ / ແທ່ງ
            </button>
            <button className="btn-secondary" onClick={() => { setMode('BOILED'); setError(null); }}>
              + ມອບຄຳລະຫວ່າງມື້ — ຄຳຕົ້ມ
            </button>
          </div>
        }
      />
      {goldTypesFailed && <QueryErrorNotice error={goldTypesError} onRetry={() => void refetchGoldTypes()} />}

      {/* ═══ 1. ສະຫຼຸບປະເພດຄຳ ═══ */}
      <section className="space-y-3" aria-labelledby="h-summary">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-summary" className="section-label text-sm">ສະຫຼຸບປະເພດຄຳ</h2>
          <span className="text-xs text-muted">ຂໍ້ມູນວັນທີ {formatDate(new Date())}</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div data-fade className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">① ຮັບມາຈາກຜູ້ປະເມີນ</h3>
                <p className="text-xs text-muted">ຍອດທີ່ຮັບມາຈາກຜູ້ປະເມີນ (ກ່ອນມອບເຂົ້າສາງ)</p>
              </div>
            </div>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="ຮັບມາຈາກຜູ້ປະເມີນ">
              <table className="table">
                <thead>
                  <tr>
                    <th>ປະເພດຄຳ</th>
                    <th className="text-right">ນ້ຳໜັກ (g)</th>
                    <th className="text-right">ບາດຄຳ</th>
                    <th className="text-right">Total ເງິນທີ່ຈ່າຍ (ກີບ)</th>
                    <th className="text-right">ສະເລ່ຍ / g</th>
                    <th className="text-right">ສະເລ່ຍ / ບາດ</th>
                  </tr>
                </thead>
                <tbody>
                  <TableStateRow colSpan={6} isError={summaryFailed} error={summaryError}
                    isEmpty={summary.length === 0} emptyText="ຍັງບໍ່ມີຂໍ້ມູນໃນມື້ນີ້"
                    onRetry={() => void refetchSummary()} />
                  {summary.map((row) => (
                    <tr key={row.goldTypeId}>
                      <td className="font-medium">
                        <TypeName code={row.goldTypeCode} nameLo={row.goldTypeNameLo} />
                      </td>
                      <td className="num text-right">{formatWeight(row.receivedG)}</td>
                      <td className="num text-right">{formatWeight(row.receivedBahtWeight)}</td>
                      <td className="num text-right">{formatLak(row.receivedPaid)}</td>
                      <td className="num text-right">
                        {row.receivedAveragePerGram ? formatLak(row.receivedAveragePerGram) : '—'}
                      </td>
                      <td className="num text-right">
                        {row.receivedAveragePerBaht ? formatLak(row.receivedAveragePerBaht) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="font-medium">ລວມ</td>
                      <td className="num text-right">{formatWeight(String(sum(summary.map((r) => num(r.receivedG)))))}</td>
                      <td className="num text-right">{formatWeight(String(sum(summary.map((r) => num(r.receivedBahtWeight)))))}</td>
                      <td className="num text-right">{formatLak(String(sum(summary.map((r) => num(r.receivedPaid)))))}</td>
                      <td className="text-right text-muted">—</td>
                      <td className="text-right text-muted">—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div data-fade className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">② ຫຼັງສົ່ງມອບເຂົ້າສາງແລ້ວ</h3>
                <p className="text-xs text-muted">ຍອດຄົງເຫຼືອ ຫຼັງຫັກນ້ຳໜັກທີ່ມອບເຂົ້າສາງຄຳເກົ່າ</p>
              </div>
            </div>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="ຫຼັງສົ່ງມອບເຂົ້າສາງແລ້ວ">
              <table className="table">
                <thead>
                  <tr>
                    <th>ປະເພດຄຳ</th>
                    <th className="text-right">ມອບແລ້ວ (g)</th>
                    <th className="text-right">ນ້ຳໜັກຄົງເຫຼືອ (g)</th>
                    <th className="text-right">ບາດຄຳ</th>
                    <th className="text-right">Total ເງິນທີ່ຈ່າຍ (ກີບ)</th>
                    <th className="text-right">ສະເລ່ຍ / g</th>
                    <th className="text-right">ສະເລ່ຍ / ບາດ</th>
                  </tr>
                </thead>
                <tbody>
                  <TableStateRow colSpan={7} isError={summaryFailed} error={summaryError}
                    isEmpty={summary.length === 0} emptyText="ຍັງບໍ່ມີຂໍ້ມູນໃນມື້ນີ້"
                    onRetry={() => void refetchSummary()} />
                  {summary.map((row) => (
                    <tr key={row.goldTypeId}>
                      <td className="font-medium">
                        <TypeName code={row.goldTypeCode} nameLo={row.goldTypeNameLo} />
                      </td>
                      <td className="num text-right">
                        {num(row.handedG) > 0
                          ? <span className="text-danger">−{formatWeight(row.handedG)}</span>
                          : <span className="text-muted">0.00</span>}
                      </td>
                      <td className="num text-right font-semibold">{formatWeight(row.weightG)}</td>
                      <td className="num text-right">{formatWeight(row.bahtWeight)}</td>
                      <td className="num text-right">{formatLak(row.totalPaid)}</td>
                      <td className="num text-right" title={row.averageMessageLo ?? ''}>
                        {row.averagePerGram ? formatLak(row.averagePerGram) : '—'}
                      </td>
                      <td className="num text-right" title={row.averageMessageLo ?? ''}>
                        {row.averagePerBaht ? formatLak(row.averagePerBaht) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="font-medium">ລວມ</td>
                      <td className="num text-right">
                        {sum(summary.map((r) => num(r.handedG))) > 0 ? '−' : ''}
                        {formatWeight(String(sum(summary.map((r) => num(r.handedG)))))}
                      </td>
                      <td className="num text-right">{formatWeight(String(sum(summary.map((r) => num(r.weightG)))))}</td>
                      <td className="num text-right">{formatWeight(String(sum(summary.map((r) => num(r.bahtWeight)))))}</td>
                      <td className="num text-right">{formatLak(String(sum(summary.map((r) => num(r.totalPaid)))))}</td>
                      <td className="text-right text-muted">—</td>
                      <td className="text-right text-muted">—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        <details className="card p-4 text-xs text-muted">
          <summary className="cursor-pointer text-sm font-medium text-gold">ວິທີຄິດໄລ່</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>ບາດຄຳ = ນ້ຳໜັກ (g) ÷ 15 · ສະເລ່ຍ/g = Total ເງິນທີ່ຈ່າຍ ÷ ນ້ຳໜັກ · ສະເລ່ຍ/ບາດ = ສະເລ່ຍ/g × 15</li>
            <li>ນ້ຳໜັກຄົງເຫຼືອຫຼັງມອບ = ນ້ຳໜັກຮັບຈາກຜູ້ປະເມີນ − ນ້ຳໜັກລວມທີ່ມອບເຂົ້າສາງ (ຄຳດີ/ຫຍຸບ/ແທ່ງ ໃຊ້ “ນ້ຳໜັກລວມອອກ”, ຄຳຕົ້ມ ໃຊ້ນ້ຳໜັກລາຍການ)</li>
            <li>Total ເງິນທີ່ຈ່າຍຄົງເຫຼືອຫຼັງມອບ = Total ເງິນທີ່ຈ່າຍ ຕາມຕາຕະລາງ ① — ການມອບຍ້າຍນ້ຳໜັກ ບໍ່ແມ່ນຍ້າຍເງິນ</li>
            <li>ສະແດງ “—” ເມື່ອຕົວຫານເປັນ 0 ຫຼື ຕິດລົບ</li>
          </ul>
        </details>
      </section>

      {/* ═══ 2. ຕາຕະລາງມອບຄຳເຂົ້າສາງ (ໃບພິມ) ═══ */}
      {/* ຕາຕະລາງນີ້ພິມຜ່ານປຸ່ມ "ພິມຕາຕະລາງ" (A4 ແນວນອນ) ບໍ່ແມ່ນພິມໜ້າຈໍ —
          13 ຖັນບໍ່ລົງ A4 ແນວຕັ້ງ. */}
      <section className="no-print space-y-3" aria-labelledby="h-delivery">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="h-delivery" className="section-label text-sm">
            ຕາຕະລາງມອບຄຳເຂົ້າສາງ <span className="badge recessed ml-1 text-gold">ໃບພິມ</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {canPickDates() && (
              <>
                <div className="flex gap-1" role="group" aria-label="ຊ່ວງວັນທີ">
                  {([['today', 'ມື້ນີ້'], ['7d', '7 ມື້'], ['month', 'ເດືອນນີ້']] as const).map(([k, lo]) => (
                    <button key={k} type="button"
                      className={chip === k ? 'btn-primary h-9 py-0' : 'btn-secondary h-9 py-0'}
                      onClick={() => setRange(k)}>
                      {lo}
                    </button>
                  ))}
                </div>
                <input className="filter-date" type="date" aria-label="ຈາກວັນທີ" value={dlFrom}
                  max={dlTo}
                  onChange={(e) => { setDlFrom(e.target.value); setChip(null); }} />
                <span className="filter-sep">–</span>
                <input className="filter-date" type="date" aria-label="ຫາວັນທີ" value={dlTo}
                  min={dlFrom}
                  onChange={(e) => { setDlTo(e.target.value); setChip(null); }} />
                {dlProblem && (
                  <span className="text-xs font-medium text-warning">{dlProblem}</span>
                )}
              </>
            )}
            <button type="button" className="btn-secondary h-9 py-0" onClick={() => setPreview(true)}>
              ພິມຕາຕະລາງ
            </button>
          </div>
        </div>

        <div data-fade className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">ຄຳດີ · ຄຳຫຍຸບ · ຄຳແທ່ງ</h3>
              <p className="text-xs text-muted">
                ບັນທຶກເປັນຮອບ — ນ້ຳໜັກເນື້ອລ້ວນ + ມີແກ້ວ ຕ້ອງບໍ່ນ້ອຍກວ່ານ້ຳໜັກລວມອອກ
              </p>
            </div>
            <span className="num text-xs text-muted">{rounds.length} ຮອບ</span>
          </div>
          <RoundTable rounds={rounds} multiDay={multiDay}
            isError={delivery.isError} error={delivery.error}
            onRetry={() => void delivery.refetch()} />
        </div>

        <div data-fade className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">ຄຳຕົ້ມ</h3>
              <p className="text-xs text-muted">
                ບັນທຶກຕາມລາຍການທີ່ພະນັກງານເລືອກ (ບໍ່ແບ່ງເປັນຮອບ) — ຕົ້ນທຶນເຂົ້າສາງ = ລາຄາທີ່ຈ່າຍຂອງລາຍການນັ້ນ
              </p>
            </div>
            <span className="num text-xs text-muted">{boils.length} ລາຍການ</span>
          </div>
          <BoilTable boils={boils} multiDay={multiDay}
            isError={delivery.isError} error={delivery.error}
            onRetry={() => void delivery.refetch()} />
        </div>
      </section>

      {/* ═══ 3. History ມອບຄຳ ═══ */}
      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History ມອບຄຳ</h2></div>
        <DateRangeFilter history={history} />
        <div className="filter-bar">
          <div className="filter-dates">
            <span className="filter-select-label">ປະເພດຄຳ</span>
            <select className="filter-date" aria-label="ປະເພດຄຳ" value={historyType}
              onChange={(e) => setHistoryType(e.target.value)}>
              <option value="">ທຸກປະເພດ</option>
              {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
            </select>
            <input className="filter-date" type="search" aria-label="ຄົ້ນຫາ"
              placeholder="ຄົ້ນຫາລະຫັດ / ລາຍການ / ຜູ້ມອບ"
              value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} />
          </div>
          <div className="filter-tail">
            <span className="filter-note">{historyRows.length} ລາຍການ</span>
          </div>
        </div>
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
                <th className="text-right">ຕົ້ນທຶນເຂົ້າສາງ</th>
                <th>ຜູ້ມອບ</th>
                <th>ສະຖານະ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={11} isError={history.isError} error={history.error}
                isEmpty={historyRows.length === 0} emptyText="ບໍ່ພົບການມອບຄຳທີ່ກົງກັບຕົວກອງ"
                onRetry={() => void history.refetch()} />
              {historyRows.map(({ row, item }) => {
                const split = row.goldType.code !== BOILED && row.goldType.code !== BAR;
                return (
                  <tr key={item ? item.id : row.id}>
                    <td className="font-mono text-xs">
                      {item ? item.buyback.code : row.code}
                      {item && (
                        <>
                          <br />
                          <span className="font-sans text-fg">{item.buyback.goldItem?.nameLo ?? '—'}</span>
                        </>
                      )}
                    </td>
                    <td className="num text-right">{row.roundNo ?? <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td><TypeName code={row.goldType.code} nameLo={row.goldType.nameLo} /></td>
                    <td className="num text-right">
                      {formatWeight(item ? item.weightG : (row.grossWeightG ?? row.weightG))}
                    </td>
                    {split ? (
                      <>
                        <td className="num text-right">{formatWeight(row.pureWeightG)}</td>
                        <td className="num text-right">{formatWeight(row.glassWeightG)}</td>
                        <td className="num text-right"><Delta value={shortfallOf(row)} /></td>
                      </>
                    ) : (
                      <>
                        <td className="text-right text-muted">—</td>
                        <td className="text-right text-muted">—</td>
                        <td className="text-right text-muted">—</td>
                      </>
                    )}
                    <td className="num text-right">
                      {item ? formatLak(item.payableAmount) : (row.warehouseCost ? formatLak(row.warehouseCost) : '—')}
                    </td>
                    <td>{row.shift.user.fullName}</td>
                    <td>
                      <span className={statusClass(row.status)}>
                        {STATUS[row.status]?.lo ?? row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ຟອມ: ຮອບ (ຄຳດີ / ຄຳຫຍຸບ / ແທ່ງ) ── */}
      <Dialog
        open={mode === 'ROUND'}
        onClose={closeForm}
        title="ມອບຄຳເຂົ້າສາງ — ຄຳດີ · ຄຳຫຍຸບ · ຄຳແທ່ງ"
        size="lg"
        footer={
          <>
            <div className="mr-auto text-xs text-muted">
              ລວມຮອບນີ້: <b className="text-fg">{formatWeight(String(roundTotalG))} g</b> ·
              {' '}ຕົ້ນທຶນ <b className="text-fg">{formatLak(String(roundTotalCost))} ກີບ</b>
            </div>
            <button className="btn-secondary" onClick={closeForm}>ຍົກເລີກ</button>
            <button className="btn-primary" disabled={!roundReady || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງສົ່ງ...' : 'ບັນທຶກການມອບ'}
            </button>
          </>
        }
      >
        <p className="notice recessed mb-3 text-xs">
          ເລືອກປະເພດຄຳທີ່ມອບໃນຮອບນີ້ — ເລືອກພ້ອມກັນໄດ້ຫຼາຍປະເພດ ແລະ ທັງໝົດຈະຢູ່ຮອບດຽວກັນ.
          ຄຳດີ ແລະ ຄຳຫຍຸບ ມີຫ້ອງປ້ອນ ເນື້ອລ້ວນ ແລະ ມີແກ້ວ.
        </p>

        <div className="flex flex-wrap gap-2">
          {roundTypes.map((type) => (
            <label key={type.id}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                selected[type.id] ? 'border-gold bg-gold-tint' : 'border-line'
              }`}>
              <input type="checkbox" className="h-4 w-4 accent-[var(--gold)]"
                checked={Boolean(selected[type.id])}
                onChange={(e) => setSelected((prev) => ({ ...prev, [type.id]: e.target.checked }))} />
              <TypeName code={type.code} nameLo={type.nameLo} />
              <small className="text-muted">
                ຄົງເຫຼືອ {formatWeight(String(remainingByType.get(type.id) ?? 0))} g
              </small>
            </label>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {chosenTypes.length === 0 && (
            <p className="recessed rounded-xl p-4 text-center text-sm text-muted">
              ເລືອກຢ່າງໜ້ອຍ 1 ປະເພດຄຳ
            </p>
          )}
          {chosenTypes.map((type) => {
            const split = type.code !== BAR;
            const { out, pure, glass } = line(type.id);
            const check = checkLine(type);
            const o = Number(out) || 0;
            const diff = split && pure.trim() && glass.trim() ? o - (Number(pure) + Number(glass)) : null;
            const cost = o * (averageByType.get(type.id) ?? 0);
            const remaining = remainingByType.get(type.id) ?? 0;
            return (
              <fieldset key={type.id} className="rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-medium">
                  <TypeName code={type.code} nameLo={type.nameLo} />
                  <span className="ml-2 text-xs text-muted">
                    · ສະເລ່ຍ {formatLak(String(averageByType.get(type.id) ?? 0))} ກີບ/g
                  </span>
                </legend>
                <div className={`grid gap-3 ${split ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
                  <div>
                    <label className="label" htmlFor={`out-${type.id}`}>
                      {split ? 'ນ້ຳໜັກລວມອອກ (g)' : 'ນ້ຳໜັກ (g)'}
                    </label>
                    <NumberInput decimals={4} id={`out-${type.id}`} className="input num"
                      placeholder="0.00" value={out}
                      onValueChange={(v) => setLine(type.id, { out: v })} />
                  </div>
                  {split && (
                    <>
                      <div>
                        <label className="label" htmlFor={`pure-${type.id}`}>ເນື້ອລ້ວນ (g)</label>
                        <NumberInput decimals={4} id={`pure-${type.id}`} className="input num"
                          placeholder="0.00" value={pure}
                          onValueChange={(v) => setLine(type.id, { pure: v })} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`glass-${type.id}`}>ມີແກ້ວ (g)</label>
                        <NumberInput decimals={4} id={`glass-${type.id}`} className="input num"
                          placeholder="0.00" value={glass}
                          onValueChange={(v) => setLine(type.id, { glass: v })} />
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  {split && (
                    <span>ນ້ຳໜັກຂາດດຸ: <b className="text-fg">{diff === null ? '—' : <Delta value={diff} />}</b></span>
                  )}
                  <span>ຕົ້ນທຶນເຂົ້າສາງ: <b className="text-fg">{o > 0 ? formatLak(String(cost)) : '—'} ກີບ</b></span>
                  <span>ຄົງເຫຼືອຫຼັງມອບ: <b className="text-fg">{formatWeight(String(remaining - o))} g</b></span>
                </div>
                {check.message && (
                  <div role="alert" className="notice status-danger mt-2 text-xs">{check.message}</div>
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="note-round">ໝາຍເຫດ</label>
          <input id="note-round" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div role="alert" className="notice status-danger mt-3">{error}</div>}
        <p className="mt-2 text-xs text-muted">ຮອບທີ ອອກໃຫ້ອັດຕະໂນມັດຕາມມື້ການຄ້າ · ສົ່ງໃຫ້ສາງກົດຢືນຢັນ</p>
      </Dialog>

      {/* ── ຟອມ: ຄຳຕົ້ມ (ເລືອກລາຍການ) ── */}
      <Dialog
        open={mode === 'BOILED'}
        onClose={closeForm}
        title="ມອບຄຳເຂົ້າສາງ — ຄຳຕົ້ມ"
        size="lg"
        footer={
          <>
            <div className="mr-auto text-xs text-muted">
              ເລືອກ <b className="text-fg">{picked.length}</b> ລາຍການ ·
              {' '}<b className="text-fg">{formatWeight(String(pickedWeight))} g</b> ·
              {' '}ຕົ້ນທຶນ <b className="text-fg">{formatLak(String(pickedPaid))} ກີບ</b>
            </div>
            <button className="btn-secondary" onClick={closeForm}>ຍົກເລີກ</button>
            <button className="btn-primary" disabled={picked.length === 0 || !boiledType || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງສົ່ງ...' : 'ບັນທຶກການມອບ'}
            </button>
          </>
        }
      >
        <p className="notice recessed mb-3 text-xs">
          ເລືອກລາຍການຄຳເກົ່າທີ່ຮັບຊື້ຄືນມາ. ເລືອກໄດ້ຫຼາຍລາຍການໃນ 1 ຄັ້ງ;
          ນ້ຳໜັກ ແລະ ລາຄາ ດຶງມາຈາກລາຍການ, ແກ້ໄຂບໍ່ໄດ້.
        </p>
        {pendingFailed && <QueryErrorNotice error={pendingError} onRetry={() => void refetchPending()} />}
        <input className="input mb-3" type="search" aria-label="ຄົ້ນຫາລາຍການ"
          placeholder="ຄົ້ນຫາລະຫັດ ຫຼື ຊື່ລາຍການ"
          value={poolQuery} onChange={(e) => setPoolQuery(e.target.value)} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການຄຳເກົ່າທີ່ຍັງບໍ່ໄດ້ມອບ">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" aria-label="ເລືອກທັງໝົດ"
                    checked={poolRows.length > 0 && poolRows.every((p) => picked.includes(p.id))}
                    onChange={(e) => setPicked(e.target.checked ? poolRows.map((p) => p.id) : [])} />
                </th>
                <th>ລະຫັດລາຍການ</th>
                <th>ລາຍການຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ຈຳນວນ</th>
                <th className="text-right">% ຄຳ</th>
                <th className="text-right">ລາຄາທີ່ຈ່າຍ (ກີບ)</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={7} isError={pendingFailed} error={pendingError}
                isEmpty={poolRows.length === 0} emptyText="ບໍ່ພົບລາຍການຄຳເກົ່າທີ່ລໍຖ້າມອບ"
                onRetry={() => void refetchPending()} />
              {poolRows.map((row) => (
                <tr key={row.id} className={picked.includes(row.id) ? 'bg-gold-tint' : undefined}>
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
                  <td className="num text-right">{row.goldPercent ? Number(row.goldPercent) : '—'}</td>
                  <td className="num text-right">{formatLak(row.payableAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="note-boiled">ໝາຍເຫດ</label>
          <input id="note-boiled" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div role="alert" className="notice status-danger mt-3">{error}</div>}
      </Dialog>

      {/* ── ຕົວຢ່າງໃບພິມ ── */}
      <PrintSheet open={preview} onClose={() => setPreview(false)}>
        <div className="sheet-head">
          <div>
            <h2>ໃບມອບຄຳເຂົ້າສາງຄຳເກົ່າ</h2>
            <div className="text-xs">ຮ້ານຄຳພູວົງ · KHAMPHOUVONG</div>
          </div>
          <div className="text-right text-xs">
            ຊ່ວງວັນທີ: <b>{formatDate(dlFrom)}{multiDay ? ` – ${formatDate(dlTo)}` : ''}</b>
            <br />
            ພິມເມື່ອ: {formatDateTime(new Date())}
          </div>
        </div>
        <h3>1. ຕາຕະລາງມອບຄຳເຂົ້າສາງ ຄຳດີ, ຄຳຫຍຸບ, ຄຳແທ່ງ</h3>
        {rounds.length > 0
          ? <RoundTable rounds={rounds} multiDay={multiDay} isError={false} error={null} onRetry={() => {}} />
          : <p className="text-xs">ບໍ່ມີລາຍການ</p>}
        <h3>2. ຕາຕະລາງມອບຄຳເຂົ້າສາງ ຄຳຕົ້ມ</h3>
        {boils.length > 0
          ? <BoilTable boils={boils} multiDay={multiDay} isError={false} error={null} onRetry={() => {}} />
          : <p className="text-xs">ບໍ່ມີລາຍການ</p>}
        <div className="sheet-sign">
          <div>ຜູ້ມອບ</div>
          <div>ຜູ້ຮັບ (ສາງຄຳ)</div>
          <div>ຜູ້ກວດກາ</div>
        </div>
      </PrintSheet>
    </div>
  );
}

/** ຫ້າຖັນຂອງປະເພດທີ່ແຍກ ເນື້ອລ້ວນ / ມີແກ້ວ; ແທ່ງ ໃຊ້ສອງຖັນ. */
function SplitCells({ row }: { row: HandoverRow | undefined }) {
  if (!row) {
    return (
      <>
        <td className="border-l border-line text-right text-muted">—</td>
        <td className="text-right text-muted">—</td>
        <td className="text-right text-muted">—</td>
        <td className="text-right text-muted">—</td>
        <td className="text-right text-muted">—</td>
      </>
    );
  }
  return (
    <>
      <td className="num border-l border-line text-right">{formatWeight(row.grossWeightG ?? row.weightG)}</td>
      <td className="num text-right">{formatWeight(row.pureWeightG)}</td>
      <td className="num text-right">{formatWeight(row.glassWeightG)}</td>
      <td className="num text-right"><Delta value={shortfallOf(row)} /></td>
      <td className="num text-right">{row.warehouseCost ? formatLak(row.warehouseCost) : '—'}</td>
    </>
  );
}

function RoundTable({
  rounds, multiDay, isError, error, onRetry,
}: {
  rounds: RoundRow[]; multiDay: boolean;
  isError: boolean; error: unknown; onRetry: () => void;
}) {
  const totals = (code: string) => {
    const rows = rounds.map((r) => r.byType[code]).filter(Boolean) as HandoverRow[];
    return {
      out: sum(rows.map((r) => num(r.grossWeightG ?? r.weightG))),
      pure: sum(rows.map((r) => num(r.pureWeightG))),
      glass: sum(rows.map((r) => num(r.glassWeightG))),
      diff: sum(rows.map(shortfallOf)),
      cost: sum(rows.map((r) => num(r.warehouseCost))),
    };
  };
  const good = totals('GOOD');
  const hump = totals('HUMP');
  const bar = totals('BAR');

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="ຕາຕະລາງມອບຄຳ ຄຳດີ ຄຳຫຍຸບ ຄຳແທ່ງ">
      <table className="table">
        <thead>
          <tr>
            <th rowSpan={2} className="align-bottom">ລຳດັບ</th>
            <th colSpan={5} className="border-l border-line text-center">ຄຳດີ</th>
            <th colSpan={5} className="border-l border-line text-center">ຄຳຫຍຸບ</th>
            <th colSpan={2} className="border-l border-line text-center">ຄຳແທ່ງ</th>
          </tr>
          <tr>
            <th className="border-l border-line text-right">ນ້ຳໜັກລວມອອກ</th>
            <th className="text-right">ເນື້ອລ້ວນ</th>
            <th className="text-right">ມີແກ້ວ</th>
            <th className="text-right">ຂາດດຸ</th>
            <th className="text-right">ຕົ້ນທຶນເຂົ້າສາງ</th>
            <th className="border-l border-line text-right">ນ້ຳໜັກລວມອອກ</th>
            <th className="text-right">ເນື້ອລ້ວນ</th>
            <th className="text-right">ມີແກ້ວ</th>
            <th className="text-right">ຂາດດຸ</th>
            <th className="text-right">ຕົ້ນທຶນເຂົ້າສາງ</th>
            <th className="border-l border-line text-right">ນ້ຳໜັກ</th>
            <th className="text-right">ຕົ້ນທຶນເຂົ້າສາງ</th>
          </tr>
        </thead>
        <tbody>
          <TableStateRow colSpan={13} isError={isError} error={error}
            isEmpty={rounds.length === 0} emptyText="ບໍ່ມີການມອບຄຳໃນຊ່ວງວັນທີນີ້" onRetry={onRetry} />
          {rounds.map((round) => (
            <tr key={round.key}>
              <td className="whitespace-nowrap font-medium">
                ຮອບທີ {round.roundNo}
                {multiDay && <><br /><span className="text-xs text-muted">{formatDate(round.date)}</span></>}
              </td>
              <SplitCells row={round.byType.GOOD} />
              <SplitCells row={round.byType.HUMP} />
              {round.byType.BAR ? (
                <>
                  <td className="num border-l border-line text-right">
                    {formatWeight(round.byType.BAR.grossWeightG ?? round.byType.BAR.weightG)}
                  </td>
                  <td className="num text-right">
                    {round.byType.BAR.warehouseCost ? formatLak(round.byType.BAR.warehouseCost) : '—'}
                  </td>
                </>
              ) : (
                <>
                  <td className="border-l border-line text-right text-muted">—</td>
                  <td className="text-right text-muted">—</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        {rounds.length > 0 && (
          <tfoot>
            <tr>
              <td className="font-medium">ລວມ</td>
              {[good, hump].map((t, i) => (
                <Fragment key={i}>
                  <td className="num border-l border-line text-right">{formatWeight(String(t.out))}</td>
                  <td className="num text-right">{formatWeight(String(t.pure))}</td>
                  <td className="num text-right">{formatWeight(String(t.glass))}</td>
                  <td className="num text-right"><Delta value={t.diff} /></td>
                  <td className="num text-right">{formatLak(String(t.cost))}</td>
                </Fragment>
              ))}
              <td className="num border-l border-line text-right">{formatWeight(String(bar.out))}</td>
              <td className="num text-right">{formatLak(String(bar.cost))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function BoilTable({
  boils, multiDay, isError, error, onRetry,
}: {
  boils: BoilRow[]; multiDay: boolean;
  isError: boolean; error: unknown; onRetry: () => void;
}) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="ຕາຕະລາງມອບຄຳ ຄຳຕົ້ມ">
      <table className="table">
        <thead>
          <tr>
            <th>ລະຫັດລາຍການ</th>
            <th>ລາຍການຄຳ</th>
            <th className="text-right">ນ້ຳໜັກ (g)</th>
            <th className="text-right">ຈຳນວນ</th>
            <th className="text-right">% ຄຳ</th>
            <th className="text-right">ຕົ້ນທຶນເຂົ້າສາງ (ກີບ)</th>
          </tr>
        </thead>
        <tbody>
          <TableStateRow colSpan={6} isError={isError} error={error}
            isEmpty={boils.length === 0} emptyText="ບໍ່ມີການມອບຄຳຕົ້ມໃນຊ່ວງວັນທີນີ້" onRetry={onRetry} />
          {boils.map((row) => (
            <tr key={row.id}>
              <td className="font-mono text-xs">
                {row.code}
                {multiDay && <><br /><span className="font-sans text-xs text-muted">ມອບ {formatDate(row.date)}</span></>}
              </td>
              <td>{row.nameLo}</td>
              <td className="num text-right">{formatWeight(String(row.weightG))}</td>
              <td className="num text-right">{row.quantity}</td>
              <td className="num text-right">{row.goldPercent ? Number(row.goldPercent) : '—'}</td>
              <td className="num text-right">{formatLak(String(row.cost))}</td>
            </tr>
          ))}
        </tbody>
        {boils.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={2} className="font-medium">ລວມ</td>
              <td className="num text-right">{formatWeight(String(sum(boils.map((b) => b.weightG))))}</td>
              <td className="num text-right">{sum(boils.map((b) => b.quantity))}</td>
              <td className="text-right text-muted">—</td>
              <td className="num text-right">{formatLak(String(sum(boils.map((b) => b.cost))))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
