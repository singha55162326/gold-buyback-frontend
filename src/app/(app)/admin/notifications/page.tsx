'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface Status {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  sessionId: string | null;
  reachable: boolean;
  /** Gateway answered AND a phone is linked — only then can it actually send. */
  live: boolean;
  sessionState: string | null;
  detail: string | null;
}

interface LogRow {
  id: string;
  title: string;
  createdAt: string;
  whatsappStatus: 'SKIPPED' | 'PENDING' | 'SENT' | 'FAILED';
  whatsappTo: string | null;
  whatsappSentAt: string | null;
  whatsappAttempts: number;
  whatsappError: string | null;
}

const STATUS_BADGE: Record<LogRow['whatsappStatus'], { lo: string; cls: string }> = {
  PENDING: { lo: 'ລໍຖ້າສົ່ງ', cls: 'bg-amber-100 text-amber-800' },
  SENT: { lo: 'ສົ່ງແລ້ວ', cls: 'bg-emerald-100 text-emerald-800' },
  FAILED: { lo: 'ລົ້ມເຫຼວ', cls: 'bg-red-100 text-red-800' },
  SKIPPED: { lo: 'ຂ້າມ', cls: 'bg-slate-100 text-slate-600' },
};

/**
 * TOR §10 — the WhatsApp notification channel.
 *
 * WhatsApp is a SECOND delivery channel for alerts that already exist; the
 * in-app bell over Socket.IO remains the primary one. Messages are queued
 * inside the business transaction and delivered afterwards by a background
 * worker, so a gateway outage can never roll back a gold transaction.
 */
export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['notifications', 'whatsapp', 'status'],
    queryFn: () => api.get<Status>('/notifications/whatsapp/status'),
    refetchInterval: 60_000,
  });

  const { data: log = [] } = useQuery({
    queryKey: ['notifications', 'whatsapp', 'log'],
    queryFn: () => api.get<LogRow[]>('/notifications/whatsapp/log'),
  });

  const drain = useMutation({
    mutationFn: () => api.post<{ sent: number; failed: number; skipped: number }>('/notifications/whatsapp/drain'),
    onSuccess: (result) => {
      setMessage(`ສົ່ງແລ້ວ ${result.sent} · ລົ້ມເຫຼວ ${result.failed} · ຂ້າມ ${result.skipped}`);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'whatsapp'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; error?: string; to: string }>('/notifications/whatsapp/test', { to: testTo }),
    onSuccess: (result) => {
      setMessage(
      result.ok
      ? `ສົ່ງຂໍ້ຄວາມທົດສອບໄປທີ່ ${result.to} ແລ້ວ`
      : `ສົ່ງບໍ່ສຳເລັດ: ${result.error ?? 'ບໍ່ຮູ້ສາເຫດ'}`,
      );
      setError(null);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ສົ່ງບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const health = !status
    ? { lo: 'ກຳລັງກວດສອບ...', cls: 'bg-slate-100 text-slate-600' }
    : !status.enabled
      ? { lo: 'ປິດການນຳໃຊ້', cls: 'bg-slate-100 text-slate-600' }
      : !status.configured
        ? { lo: 'ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ', cls: 'bg-amber-100 text-amber-800' }
        : !status.reachable
          ? { lo: 'ຕິດຕໍ່ Gateway ບໍ່ໄດ້', cls: 'bg-red-100 text-red-800' }
          : status.live
            ? { lo: 'ພ້ອມສົ່ງ', cls: 'bg-emerald-100 text-emerald-800' }
            // Reachable but not linked: sends WILL fail, so never show green.
            : { lo: 'ຕ້ອງສະແກນ QR', cls: 'bg-amber-100 text-amber-800' };

  const pager = usePagination(log);


  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">ການແຈ້ງເຕືອນ WhatsApp</h1>
          <span className="badge bg-slate-100 text-slate-600">TOR §10</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          ຊ່ອງທາງແຈ້ງເຕືອນທີສອງ ນອກເໜືອຈາກກະດິ່ງໃນລະບົບ — ຜ່ານ OpenWA gateway
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        OpenWA ແມ່ນ gateway ທີ່ບໍ່ເປັນທາງການ ແລະ ບໍ່ມີສ່ວນກ່ຽວຂ້ອງກັບ Meta.
        ໃຊ້ສະເພາະການແຈ້ງເຕືອນພາຍໃນໃຫ້ພະນັກງານທີ່ສະໝັກຮັບເທົ່ານັ້ນ —
        ບໍ່ຄວນໃຊ້ສົ່ງຫາລູກຄ້າ ຫຼື ສົ່ງຈຳນວນຫຼາຍ ເພາະບັນຊີອາດຖືກລະງັບ.
      </div>

      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ສະຖານະ Gateway</h2>
          <span className={`badge ${health.cls}`}>{health.lo}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <Row labelLo="ເປີດການນຳໃຊ້ (WHATSAPP_ENABLED)"
                value={isLoading ? '—' : status?.enabled ? 'true' : 'false'} />
              <Row labelLo="WAHA_BASE_URL" value={status?.baseUrl ?? '— ຍັງບໍ່ໄດ້ຕັ້ງ —'} />
              <Row labelLo="WAHA_SESSION_ID" value={status?.sessionId ?? '— ຍັງບໍ່ໄດ້ຕັ້ງ —'} />
              <Row labelLo="ລາຍລະອຽດ" value={status?.detail ?? '—'} />
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          ຕັ້ງຄ່າຢູ່ໄຟລ໌ <span className="font-mono">.env</span> ແລ້ວ restart API.
          ຄ່າ API key ບໍ່ຖືກສະແດງຢູ່ໜ້ານີ້.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="card-title mb-4">ທົດສອບການສົ່ງ</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="testTo">ເບີ WhatsApp</label>
            <input id="testTo" className="input num" inputMode="tel" placeholder="2012345678"
              value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
          <button className="btn-primary"
            disabled={!testTo.trim() || test.isPending || !status?.live}
            onClick={() => test.mutate()}>
            {test.isPending ? 'ກຳລັງສົ່ງ...' : 'ສົ່ງຂໍ້ຄວາມທົດສອບ'}
          </button>
          <button className="btn-secondary" disabled={drain.isPending}
            onClick={() => drain.mutate()}>
            {drain.isPending ? 'ກຳລັງສົ່ງຄິວ...' : 'ສົ່ງຄິວທີ່ຄ້າງ'}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          ຮັບເບີແບບ 8 ຕົວ (2012345678), ມີ 0 ນຳໜ້າ, ຫຼື ແບບເຕັມ (+856...) — ລະບົບຈະແປງໃຫ້ເອງ.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດການສົ່ງ</h2>
          <span className="text-xs text-slate-500">{log.length} ລາຍການ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ເວລາສ້າງ</th>
                <th>ຫົວຂໍ້</th>
                <th>ເບີຮັບ</th>
                <th>ສະຖານະ</th>
                <th className="text-right">ຄັ້ງທີ່ລອງ</th>
                <th>ເວລາສົ່ງ</th>
                <th>ຂໍ້ຜິດພາດ</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີການສົ່ງ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="font-medium">{row.title}</td>
                  <td className="num">{row.whatsappTo ?? '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[row.whatsappStatus].cls}`}>
                      {STATUS_BADGE[row.whatsappStatus].lo}
                    </span>
                  </td>
                  <td className="num text-right">{row.whatsappAttempts}</td>
                  <td>{formatDateTime(row.whatsappSentAt)}</td>
                  <td className="max-w-xs truncate text-xs text-red-600" title={row.whatsappError ?? ''}>
                    {row.whatsappError ?? '—'}
                  </td>
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

function Row({ labelLo, value }: { labelLo: string; value: string }) {
  return (
    <tr>
      <td className="w-72 font-medium text-slate-700">{labelLo}</td>
      <td className="font-mono text-xs text-slate-600">{value}</td>
    </tr>
  );
}
