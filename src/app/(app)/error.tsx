'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * ໜ້າຜິດພາດ — the boundary for everything inside the app shell.
 *
 * Without it, a thrown render error shows Next's English default and the
 * sidebar disappears, so staff cannot navigate away from the broken screen.
 * This keeps them inside the system and offers a retry, which recovers most
 * cases (a dropped API call, an expired token mid-render).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this screen to the server log entry.
    console.error('[kpv] render error', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="card p-7">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none">
            <path
              d="M12 8.5v4.2M12 16.2h.01M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="mt-4 text-lg font-semibold text-slate-900">ໜ້ານີ້ເກີດຂໍ້ຜິດພາດ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຂໍ້ມູນຂອງທ່ານບໍ່ໄດ້ຫາຍໄປ. ລອງໂຫຼດຄືນເບິ່ງກ່ອນ.
        </p>

        {error.digest && (
          <p className="mt-3 text-xs text-slate-400">
            ລະຫັດອ້າງອີງ <span className="mono">{error.digest}</span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={reset}>
            ລອງໃໝ່
          </button>
          <Link href="/dashboard" className="btn-secondary">
            ກັບໄປ Dashboard
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          ຖ້າຍັງເປັນອີກ ໃຫ້ແຈ້ງຜູ້ດູແລພ້ອມບອກວ່າທ່ານຢູ່ໜ້າໃດ ແລະ ກົດປຸ່ມຫຍັງ
        </p>
      </div>
    </div>
  );
}
