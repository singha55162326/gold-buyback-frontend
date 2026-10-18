'use client';

import Link from 'next/link';
import { useFadeIn } from '@/lib/use-fade-in';

/**
 * ບໍ່ພົບໜ້າ (404).
 *
 * Next's built-in 404 is unstyled English on a white page, which in a Lao-only
 * shop system reads as a crash rather than a wrong address. This sits on the
 * page backdrop like the login screen and offers the way back.
 */
export default function NotFound() {
  useFadeIn();
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div data-fade className="glass glass-lg w-full max-w-sm p-7 text-center">
        <div className="num font-serif text-5xl font-bold text-gold-gradient">404</div>

        <h1 className="mt-3 font-serif text-xl font-bold text-gold-gradient">ບໍ່ພົບໜ້ານີ້</h1>
        <p className="mt-1 text-sm text-muted">
          ທີ່ຢູ່ອາດພິມຜິດ ຫຼື ໜ້ານີ້ຖືກຍ້າຍໄປແລ້ວ
        </p>

        <Link href="/dashboard" className="btn-primary mt-5 w-full">
          ກັບໄປ Dashboard
        </Link>
      </div>
    </div>
  );
}
