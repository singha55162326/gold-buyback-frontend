'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { api, getToken } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

/**
 * TOR §10 — real-time alerts along the approval chain. The socket only
 * invalidates the query; the list itself is always served from the API, so a
 * dropped connection degrades to "correct but not instant" rather than wrong.
 */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationRow[]>('/notifications'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket: Socket = io(`${url}/ws`, { auth: { token }, transports: ['websocket'] });
    socket.on('notification', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const unread = data.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        className="btn-on-dark relative px-3 py-1.5"
        onClick={() => setOpen((v) => !v)}
        aria-label="ການແຈ້ງເຕືອນ"
      >
        ແຈ້ງເຕືອນ
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-800 shadow-lg">
          {data.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">ບໍ່ມີການແຈ້ງເຕືອນ</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 text-sm ${n.readAt ? 'text-slate-500' : 'bg-gold-50/50'}`}
                >
                  <div className="font-medium text-slate-800">{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-slate-600">{n.body}</div>}
                  <div className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
