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
    <div className="sm:relative">
      <button
        type="button"
        className="chrome-btn relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="ການແຈ້ງເຕືອນ"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        <span className="sr-only">ແຈ້ງເຕືອນ</span>
        {unread > 0 && (
          <span
            className="num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full
                       bg-[image:var(--gold-fill)] px-1 text-xs font-semibold text-[var(--on-gold)]"
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="menu-panel absolute z-50 mt-2 max-h-96 overflow-y-auto
                     max-sm:left-0 max-sm:right-0 max-sm:top-full max-sm:mx-0
                     sm:right-0 sm:w-80"
        >
          {data.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">ບໍ່ມີການແຈ້ງເຕືອນ</div>
          ) : (
            <ul>
              {data.map((n) => (
                <li
                  key={n.id}
                  className={`border-b border-[var(--row-line)] px-4 py-3 text-sm last:border-b-0 ${
                    n.readAt ? 'text-muted' : 'bg-[var(--gold-tint)]'
                  }`}
                >
                  <div className="font-medium text-fg-strong">{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-fg">{n.body}</div>}
                  <div className="num mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
