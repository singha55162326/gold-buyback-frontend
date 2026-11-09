'use client';

import { dec } from '@kpv/domain';
import { Dialog } from '@/components/dialog';
import { formatDate, formatLak, formatWeight, formatGrams, gramsToBaht } from '@/lib/format';
import { TRANSFORM_LABEL, type LedgerRow } from '../types';

interface MovementViewModalProps {
  row: LedgerRow | null;
  onClose: () => void;
}

export function MovementViewModal({ row, onClose }: MovementViewModalProps) {
  if (!row) return null;

  const mv = row.movement;
  const isIn = mv ? mv.type === 'IN' : dec(row.goldInG).gt(0);
  const totalW = mv ? mv.totalGoldG : isIn ? row.goldInG : row.goldOutG;
  const totalC = mv ? mv.totalCost : isIn ? row.priceIn : row.priceOut;
  const perG = mv?.pricePerG
    ? mv.pricePerG
    : dec(totalW || 0).gt(0)
      ? dec(totalC || 0).div(dec(totalW)).toFixed()
      : '0';

  return (
    <Dialog
      open
      size="lg"
      title={`ລາຍລະອຽດການເຄື່ອນໄຫວສາງ — ${mv?.code ?? row.typeLabel}`}
      onClose={onClose}
      footer={
        <button className="btn-secondary" onClick={onClose}>
          ປິດ
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-recessed rounded-xl border border-line text-sm">
          <div>
            <span className="text-xs text-muted block">ລະຫັດລາຍການ</span>
            <span className="font-mono font-medium">{mv?.code ?? row.typeLabel}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">ວັນທີ</span>
            <span className="font-medium">{formatDate(row.businessDate)}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">ປະເພດການເຄື່ອນໄຫວ</span>
            <span className="font-medium text-[var(--gold)]">{row.typeLabel}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">ແຫຼ່ງທີ່ມາ / ແຫຼ່ງສົ່ງມອບ</span>
            <span className="font-medium">{mv?.partner?.nameLo ?? row.partnerLabel ?? '—'}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">ປະເພດຄຳ</span>
            <span className="font-medium">{row.goldType?.nameLo ?? '—'}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">ຜູ້ບັນທຶກ</span>
            <span>{row.createdBy}</span>
          </div>
          <div>
            <span className="text-xs text-muted block">ສະຖານະ</span>
            <span className="font-medium text-success">{mv?.status ?? 'COMPLETED'}</span>
          </div>
          {mv?.transformType && (
            <div>
              <span className="text-xs text-muted block">ແປງສະພາບ</span>
              <span className="font-medium">{TRANSFORM_LABEL[mv.transformType] ?? mv.transformType}</span>
            </div>
          )}
          {mv?.goldPercent && dec(mv.goldPercent).gt(0) && (
            <div>
              <span className="text-xs text-muted block">%ຄຳ / ນ້ຳໜັກຄາດວ່າຈະໄດ້ຮັບ</span>
              <span className="font-medium num">
                {formatWeight(mv.goldPercent)}%{' '}
                {mv.expectedReturnG ? `(${formatGrams(mv.expectedReturnG)} g)` : ''}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3">
            <span className="text-xs text-muted block">ນ້ຳໜັກຄຳ</span>
            <span className={`num font-semibold text-base ${isIn ? 'text-success' : 'text-danger'}`}>
              {isIn ? '+' : '-'}
              {formatWeight(totalW)} g
            </span>
            <span className="text-xs text-muted block">{gramsToBaht(totalW)} ບາດ</span>
          </div>
          <div className="card p-3">
            <span className="text-xs text-muted block">ຈຳນວນລວມ</span>
            <span className="num font-semibold text-base">{mv?.totalQuantity ?? 1} ຊິ້ນ</span>
          </div>
          <div className="card p-3">
            <span className="text-xs text-muted block">ລາຄາ / g</span>
            <span className="num font-semibold text-base">{formatLak(perG)}</span>
            <span className="text-xs text-muted block">LAK</span>
          </div>
          <div className="card p-3">
            <span className="text-xs text-muted block">ຕົ້ນທຶນລວມ</span>
            <span className="num font-semibold text-base text-[var(--gold)]">{formatLak(totalC)}</span>
            <span className="text-xs text-muted block">LAK</span>
          </div>
        </div>

        {mv?.note && (
          <div className="p-3 bg-recessed rounded-xl border border-line text-sm">
            <span className="text-xs text-muted block mb-0.5">ໝາຍເຫດ</span>
            <p className="text-fg">{mv.note}</p>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold mb-2">ລາຍການຄຳໃນໃບບິນ</h4>
          <div className="table-wrap border border-line rounded-lg">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ປະເພດຄຳ / SKU</th>
                  <th>ລາຍການຄຳ</th>
                  <th>ໝວດ</th>
                  <th className="text-right">ນ້ຳໜັກ/ຊິ້ນ (g)</th>
                  <th className="text-right">ຈຳນວນ</th>
                  <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                  <th className="text-right">ຕົ້ນທຶນ (LAK)</th>
                </tr>
              </thead>
              <tbody>
                {mv?.lines && mv.lines.length > 0 ? (
                  mv.lines.map((line, idx) => (
                    <tr key={line.id || idx}>
                      <td className="text-muted text-xs">{idx + 1}</td>
                      <td className="font-medium">
                        {line.goldType?.nameLo ?? line.goldSku?.fullSkuName ?? row.goldType?.nameLo ?? '—'}
                      </td>
                      <td>{line.goldItem?.nameLo ?? '—'}</td>
                      <td>
                        {line.oldCategory === 'JEWELRY'
                          ? 'ຮູບປະພັນ'
                          : line.oldCategory === 'BAR'
                            ? 'ແທ່ງ'
                            : '—'}
                      </td>
                      <td className="num text-right">{formatWeight(line.weightG)}</td>
                      <td className="num text-right">{line.quantity}</td>
                      <td className="num text-right font-semibold">{formatWeight(line.goldG)}</td>
                      <td className="num text-right">{formatLak(line.cost)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-muted text-xs">1</td>
                    <td className="font-medium">{row.goldType?.nameLo ?? '—'}</td>
                    <td>—</td>
                    <td>—</td>
                    <td className="num text-right">{formatWeight(totalW)}</td>
                    <td className="num text-right">1</td>
                    <td className="num text-right font-semibold">{formatWeight(totalW)}</td>
                    <td className="num text-right">{formatLak(totalC)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

