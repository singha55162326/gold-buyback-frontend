'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';

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
  PENDING: { lo: 'ລໍຖ້າສົ່ງ', cls: 'status-warning' },
  SENT: { lo: 'ສົ່ງແລ້ວ', cls: 'status-success' },
  FAILED: { lo: 'ລົ້ມເຫຼວ', cls: 'status-danger' },
  SKIPPED: { lo: 'ຂ້າມ', cls: 'badge recessed text-muted' },
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
    ? { lo: 'ກຳລັງກວດສອບ...', cls: 'badge recessed text-muted' }
    : !status.enabled
      ? { lo: 'ປິດການນຳໃຊ້', cls: 'badge recessed text-muted' }
      : !status.configured
        ? { lo: 'ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ', cls: 'status-warning' }
        : !status.reachable
          ? { lo: 'ຕິດຕໍ່ Gateway ບໍ່ໄດ້', cls: 'status-danger' }
          : status.live
            ? { lo: 'ພ້ອມສົ່ງ', cls: 'status-success' }
            // Reachable but not linked: sends WILL fail, so never show green.
            : { lo: 'ຕ້ອງສະແກນ QR', cls: 'status-warning' };

  const pager = usePagination(log);


  return (
    <div className="space-y-6">
      <PageHead
        title="ການແຈ້ງເຕືອນ WhatsApp"
        subtitle="ຊ່ອງທາງແຈ້ງເຕືອນທີສອງ ນອກເໜືອຈາກກະດິ່ງໃນລະບົບ — ຜ່ານ OpenWA gateway"
        actions={<span className="badge recessed text-gold">TOR §10</span>}
      />

      <div data-fade className="notice status-warning">
        OpenWA ແມ່ນ gateway ທີ່ບໍ່ເປັນທາງການ ແລະ ບໍ່ມີສ່ວນກ່ຽວຂ້ອງກັບ Meta.
        ໃຊ້ສະເພາະການແຈ້ງເຕືອນພາຍໃນໃຫ້ພະນັກງານທີ່ສະໝັກຮັບເທົ່ານັ້ນ —
        ບໍ່ຄວນໃຊ້ສົ່ງຫາລູກຄ້າ ຫຼື ສົ່ງຈຳນວນຫຼາຍ ເພາະບັນຊີອາດຖືກລະງັບ.
      </div>

      {message && (
        <div role="status" className="notice status-success">
          {message}
        </div>
      )}
      {error && (
        <div id="wa-error" role="alert" className="notice status-danger">
          {error}
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ສະຖານະ Gateway</h2>
          <span className={health.cls}>{health.lo}</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ສະຖານະ Gateway">
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
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ຕັ້ງຄ່າຢູ່ໄຟລ໌ <span className="font-mono">.env</span> ແລ້ວ restart API.
          ຄ່າ API key ບໍ່ຖືກສະແດງຢູ່ໜ້ານີ້.
        </p>
      </div>

      <div data-fade className="card p-5">
        <h2 className="card-title mb-4">ທົດສອບການສົ່ງ</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="testTo">ເບີ WhatsApp</label>
            <input id="testTo" className="input num" aria-describedby={error ? 'wa-error' : undefined} inputMode="tel" placeholder="2012345678"
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
        <p className="mt-3 text-xs text-muted">
          ຮັບເບີແບບ 8 ຕົວ (2012345678), ມີ 0 ນຳໜ້າ, ຫຼື ແບບເຕັມ (+856...) — ລະບົບຈະແປງໃຫ້ເອງ.
        </p>
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດການສົ່ງ</h2>
          <span className="num text-xs text-muted">{log.length} ລາຍການ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດການສົ່ງ">
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
                <tr><td colSpan={7} className="py-8 text-center text-muted">ຍັງບໍ່ມີການສົ່ງ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="font-medium">{row.title}</td>
                  <td className="num">{row.whatsappTo ?? '—'}</td>
                  <td>
                    <span className={STATUS_BADGE[row.whatsappStatus].cls}>
                      {STATUS_BADGE[row.whatsappStatus].lo}
                    </span>
                  </td>
                  <td className="num text-right">{row.whatsappAttempts}</td>
                  <td>{formatDateTime(row.whatsappSentAt)}</td>
                  <td className="max-w-xs truncate text-xs text-danger" title={row.whatsappError ?? ''}>
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
      <td className="w-72 font-medium text-fg">{labelLo}</td>
      <td className="font-mono text-xs text-muted">{value}</td>
    </tr>
  );
}
