'use client';

import { useId, useMemo, useState } from 'react';
import { formatLak } from '@/lib/format';

export interface PricePoint {
  /** ວັນ-ເວລາ ທີ່ລາຄານີ້ມີຜົນ. */
  date: string;
  sellPrice: string;
  buybackPrice: string;
}

const W = 760;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 92 };

/**
 * ກຼາບລາຄາ ຮູບປະພັນ 1 ບາດ ຕາມເວລາ (TOR §3.1).
 *
 * ແຕ້ມເປັນ SVG ເອງ ບໍ່ດຶງ library ເຂົ້າມາ: ມັນມີສອງເສັ້ນ ແລະ ຈຸດບອກຄ່າ
 * ເທົ່ານັ້ນ, ແລະ ໜ້ານີ້ໂຫຼດຢູ່ໜ້າຮ້ານເທິງເນັດຊ້າ ຈຶ່ງບໍ່ຄຸ້ມທີ່ຈະເພີ່ມ
 * ແພັກເກດສຳລັບພາບດຽວ.
 *
 * ລຳດັບທີ່ສົ່ງເຂົ້າມາເປັນ ໃໝ່ → ເກົ່າ (ຄືກັບຕາຕະລາງປະຫວັດ), ສະນັ້ນຈຶ່ງ
 * ກັບລຳດັບກ່ອນແຕ້ມ ເພື່ອໃຫ້ເວລາເດີນຈາກຊ້າຍໄປຂວາ.
 */
export function PriceChart({ points, labelLo = 'ກຼາບລາຄາ ຮູບປະພັນ 1 ບາດ' }: {
  points: PricePoint[];
  labelLo?: string;
}) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => {
    const ordered = [...points].reverse();
    const sell = ordered.map((p) => Number(p.sellPrice));
    const buy = ordered.map((p) => Number(p.buybackPrice));
    const all = [...sell, ...buy].filter((n) => Number.isFinite(n));
    if (all.length === 0) return null;

    // ຂອບເທິງ/ລຸ່ມ ເພີ່ມ 5% ເພື່ອບໍ່ໃຫ້ເສັ້ນຕິດຂອບ; ຖ້າລາຄາບໍ່ເຄີຍປ່ຽນ
    // ກໍຍັງຕ້ອງມີຊ່ວງ ບໍ່ດັ່ງນັ້ນການຫານຈະເປັນສູນ.
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.05 || Math.max(max * 0.01, 1);
    const lo = min - pad;
    const hi = max + pad;

    const x = (i: number) =>
      ordered.length === 1
        ? PAD.left + (W - PAD.left - PAD.right) / 2
        : PAD.left + (i * (W - PAD.left - PAD.right)) / (ordered.length - 1);
    const y = (v: number) =>
      PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const path = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return { ordered, sell, buy, lo, hi, x, y, path };
  }, [points]);

  if (!series) {
    return (
      <div className="card p-5">
        <h2 className="card-title">{labelLo}</h2>
        <p className="mt-2 text-sm text-muted">ຍັງບໍ່ມີປະຫວັດລາຄາພໍທີ່ຈະແຕ້ມກຼາບ</p>
      </div>
    );
  }

  const { ordered, sell, buy, lo, hi, x, y, path } = series;
  const ticks = [hi, (hi + lo) / 2, lo];
  const active = hover ?? ordered.length - 1;
  const shown = ordered[active];

  return (
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title" id={titleId}>{labelLo}</h2>
        <span className="text-xs text-muted">{ordered.length} ຈຸດ · ເກົ່າ → ໃໝ່</span>
      </div>

      <div className="px-5 pt-4">
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-6" style={{ background: 'var(--gold)' }} />
            ລາຄາຂາຍ <strong className="num">{formatLak(shown.sellPrice)}</strong>
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-6" style={{ background: 'var(--fg-muted, #94a3b8)' }} />
            ລາຄາຊື້ຄືນ <strong className="num">{formatLak(shown.buybackPrice)}</strong>
          </span>
          <span className="text-muted">{new Date(shown.date).toLocaleDateString('en-GB')}</span>
        </div>
      </div>

      <div className="table-wrap px-5 pb-5 pt-2" tabIndex={0} role="img" aria-labelledby={titleId}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ minWidth: 520 }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                stroke="currentColor" strokeOpacity={0.12} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end"
                fontSize="11" fill="currentColor" fillOpacity={0.6}>
                {formatLak(t)}
              </text>
            </g>
          ))}

          <path d={path(buy)} fill="none" stroke="var(--fg-muted, #94a3b8)" strokeWidth={2} />
          <path d={path(sell)} fill="none" stroke="var(--gold)" strokeWidth={2} />

          {ordered.map((p, i) => (
            <g key={p.date + i}>
              <circle cx={x(i)} cy={y(sell[i])} r={i === active ? 4 : 2.5} fill="var(--gold)" />
              <circle cx={x(i)} cy={y(buy[i])} r={i === active ? 4 : 2.5} fill="var(--fg-muted, #94a3b8)" />
              {/* ແຖບໂປ່ງໃສ ເພື່ອໃຫ້ເລື່ອນເມົາສ໌ຈັບຈຸດໄດ້ງ່າຍ */}
              <rect x={x(i) - 12} y={PAD.top} width={24} height={H - PAD.top - PAD.bottom}
                fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          ))}

          <text x={PAD.left} y={H - 8} fontSize="11" fill="currentColor" fillOpacity={0.6}>
            {new Date(ordered[0].date).toLocaleDateString('en-GB')}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity={0.6}>
            {new Date(ordered[ordered.length - 1].date).toLocaleDateString('en-GB')}
          </text>
        </svg>
      </div>
    </div>
  );
}
