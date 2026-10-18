'use client';

import { useMemo, useState } from 'react';
import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/page-head';
import { api } from '@/lib/api';
import { formatLak, formatMoney, formatWeight, formatDate, formatDateTime } from '@/lib/format';

type ReportKind = 'BUYBACK' | 'EXCHANGE' | 'CREDIT' | 'ORDER' | 'CASH' | 'STOCK_NEW' | 'STOCK_OLD';

const REPORTS: Array<{ kind: ReportKind; labelLo: string; path: string }> = [
  { kind: 'BUYBACK', labelLo: 'Buyback', path: '/buyback' },
  { kind: 'EXCHANGE', labelLo: 'ປ່ຽນເປັນເງິນ', path: '/exchange' },
  { kind: 'CREDIT', labelLo: 'ສິນເຊື່ອ', path: '/credit' },
  { kind: 'ORDER', labelLo: 'Order', path: '/orders' },
  { kind: 'CASH', labelLo: 'Cash Flow', path: '/cash/history' },
  { kind: 'STOCK_NEW', labelLo: 'Stock (NEW)', path: '/stock/new/history' },
  { kind: 'STOCK_OLD', labelLo: 'Stock (OLD)', path: '/stock/old/history' },
];

interface Row {
  id: string;
  code?: string;
  createdAt?: string;
  businessDate?: string;
  [key: string]: unknown;
}

/** Column layout per report, so each one reads like its own module. */
const COLUMNS: Record<ReportKind, Array<{ labelLo: string; get: (r: Row) => string; right?: boolean }>> = {
  BUYBACK: [
    { labelLo: 'Transaction ID', get: (r) => String(r.code ?? '') },
    { labelLo: 'Date', get: (r) => formatDateTime(r.createdAt as string) },
    { labelLo: 'Phone', get: (r) => String((r.customer as { phone?: string })?.phone ?? '') },
    { labelLo: 'ປະເພດຄຳ', get: (r) => String((r.goldType as { nameLo?: string })?.nameLo ?? '') },
    { labelLo: 'ນ້ຳໜັກ (g)', get: (r) => formatWeight(r.weightG as string), right: true },
    { labelLo: 'ລາຄາຈ່າຍ', get: (r) => formatLak(r.payableAmount as string), right: true },
    { labelLo: 'ສະຖານະ', get: (r) => String(r.status ?? '') },
  ],
  EXCHANGE: [
    { labelLo: 'Transaction ID', get: (r) => String(r.code ?? '') },
    { labelLo: 'Date', get: (r) => formatDateTime(r.createdAt as string) },
    { labelLo: 'Phone', get: (r) => String((r.customer as { phone?: string })?.phone ?? '') },
    { labelLo: 'ທຸລະກຳ', get: (r) => (r.txnType === 'FREE_EXCHANGE' ? 'ປ່ຽນຟຣີ' : 'ປ່ຽນເປັນເງິນ') },
    { labelLo: 'ລວມເງິນຈ່າຍ', get: (r) => formatLak(r.totalPayable as string), right: true },
    { labelLo: 'ສະຖານະ', get: (r) => String(r.status ?? '') },
  ],
  CREDIT: [
    { labelLo: 'Transaction ID', get: (r) => String(r.code ?? '') },
    { labelLo: 'Date', get: (r) => formatDateTime(r.createdAt as string) },
    { labelLo: 'Phone', get: (r) => String((r.customer as { phone?: string })?.phone ?? '') },
    { labelLo: 'ລາຄາຂາຍ', get: (r) => formatLak(r.sellPrice as string), right: true },
    { labelLo: 'ຍອດຕິດໜີ້', get: (r) => formatLak(r.outstanding as string), right: true },
    { labelLo: 'ສະຖານະ', get: (r) => String(r.status ?? '') },
  ],
  ORDER: [
    { labelLo: 'Order ID', get: (r) => String(r.code ?? '') },
    { labelLo: 'BILL', get: (r) => String(r.billNo ?? '') },
    { labelLo: 'Date', get: (r) => formatDateTime(r.createdAt as string) },
    { labelLo: 'Phone', get: (r) => String((r.customer as { phone?: string })?.phone ?? '') },
    { labelLo: 'TOTAL', get: (r) => formatLak(r.totalAmount as string), right: true },
    { labelLo: 'ຄົງເຫຼືອ', get: (r) => formatLak(r.balanceAmount as string), right: true },
    { labelLo: 'ສະຖານະ', get: (r) => String(r.status ?? '') },
  ],
  CASH: [
    { labelLo: 'Date', get: (r) => formatDateTime(r.createdAt as string) },
    { labelLo: 'ປະເພດ', get: (r) => String(r.type ?? '') },
    { labelLo: 'Cur', get: (r) => String(r.currency ?? '') },
    { labelLo: 'ຈຳນວນເງິນ', get: (r) => formatMoney(r.amount as string), right: true },
    { labelLo: 'ອ້າງອີງ', get: (r) => String(r.refType ?? '—') },
    { labelLo: 'Note', get: (r) => String(r.note ?? '—') },
  ],
  STOCK_NEW: [
    { labelLo: 'Date', get: (r) => formatDate(r.businessDate as string) },
    { labelLo: 'ແຫຼ່ງ', get: (r) => String(r.partnerLabel ?? '—') },
    { labelLo: 'Type', get: (r) => String(r.typeLabel ?? '') },
    { labelLo: 'GOLD(g) IN', get: (r) => formatWeight(r.goldInG as string), right: true },
    { labelLo: 'GOLD(g) OUT', get: (r) => formatWeight(r.goldOutG as string), right: true },
    { labelLo: 'WEIGHT', get: (r) => formatWeight(r.weightG as string), right: true },
    { labelLo: 'ຕົ້ນທຶນ', get: (r) => formatLak(r.cost as string), right: true },
  ],
  STOCK_OLD: [
    { labelLo: 'Date', get: (r) => formatDate(r.businessDate as string) },
    { labelLo: 'ປະເພດຄຳ', get: (r) => String((r.goldType as { nameLo?: string })?.nameLo ?? '') },
    { labelLo: 'Type', get: (r) => String(r.typeLabel ?? '') },
    { labelLo: 'GOLD(g) IN', get: (r) => formatWeight(r.goldInG as string), right: true },
    { labelLo: 'GOLD(g) OUT', get: (r) => formatWeight(r.goldOutG as string), right: true },
    { labelLo: 'WEIGHT', get: (r) => formatWeight(r.weightG as string), right: true },
    { labelLo: 'ຕົ້ນທຶນ', get: (r) => formatLak(r.cost as string), right: true },
  ],
};

/** Escape a CSV field — quotes doubled, the whole field quoted. */
const csvField = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * TOR §3.7 — Report.
 *
 * Reads the same endpoints the modules use and filters client-side, so a
 * report can never show a number the module itself would not. Export is CSV
 * with a UTF-8 BOM, which is what makes Lao text open correctly in Excel.
 */
export default function ReportsPage() {
  const [kind, setKind] = useState<ReportKind>('BUYBACK');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const report = REPORTS.find((r) => r.kind === kind)!;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['report', kind],
    queryFn: () => api.get<Row[]>(report.path),
  });

  const columns = COLUMNS[kind];

  const filtered = useMemo(() => {
    if (!from && !to) return rows;
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toTime = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    return rows.filter((row) => {
      const raw = (row.createdAt ?? row.businessDate) as string | undefined;
      if (!raw) return true;
      const time = new Date(raw).getTime();
      return time >= fromTime && time <= toTime;
    });
  }, [rows, from, to]);

  const exportCsv = () => {
    const header = columns.map((c) => csvField(c.labelLo)).join(',');
    const body = filtered.map((row) => columns.map((c) => csvField(c.get(row))).join(',')).join('\n');
    // The BOM is what makes Excel read the Lao text as UTF-8.
    const blob = new Blob([`﻿${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kpv-${kind.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const pager = usePagination(filtered);


  return (
    <div className="space-y-6">
      <PageHead
        title="Report"
        subtitle="ລາຍງານສະຫຼຸບ — ເລືອກປະເພດ ແລະ ຊ່ວງວັນທີ ແລ້ວ Export ເປັນ CSV (TOR §3.7)"
      />

      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="kind">ປະເພດລາຍງານ</label>
            <select id="kind" className="input" value={kind}
              onChange={(e) => setKind(e.target.value as ReportKind)}>
              {REPORTS.map((r) => <option key={r.kind} value={r.kind}>{r.labelLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="from">ວັນທີເລີ່ມ</label>
            <input id="from" type="date" className="input" value={from}
              onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="to">ວັນທີສິ້ນສຸດ</label>
            <input id="to" type="date" className="input" value={to}
              onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1">
            <button className="btn-primary" disabled={filtered.length === 0} onClick={exportCsv}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className=""><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
              Export CSV
            </button>
            <button className="btn-secondary" onClick={() => window.print()}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--gold-icon)]"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z" /></svg>
              ພິມ
            </button>
          </div>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">{report.labelLo}</h2>
          <span className="text-xs text-muted">
            {filtered.length} ແຖວ{rows.length !== filtered.length ? ` (ຈາກ ${rows.length})` : ''}
          </span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={report.labelLo}>
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.labelLo} className={c.right ? 'text-right' : ''}>{c.labelLo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={columns.length} className="py-8 text-center text-muted">ກຳລັງໂຫຼດ...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={columns.length} className="py-8 text-center text-muted">ບໍ່ມີຂໍ້ມູນໃນຊ່ວງທີ່ເລືອກ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.labelLo} className={c.right ? 'num text-right' : ''}>
                      {c.get(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
