import Link from 'next/link';

/**
 * ບໍ່ພົບໜ້າ (404).
 *
 * Next's built-in 404 is unstyled English on a white page, which in a Lao-only
 * shop system reads as a crash rather than a wrong address. This sits on the
 * brand gradient like the login screen and offers the way back.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-7 text-center shadow-2xl">
        <div className="num text-5xl font-bold text-brand-800">404</div>

        <h1 className="mt-3 text-lg font-semibold text-slate-900">ບໍ່ພົບໜ້ານີ້</h1>
        <p className="mt-1 text-sm text-slate-500">
          ທີ່ຢູ່ອາດພິມຜິດ ຫຼື ໜ້ານີ້ຖືກຍ້າຍໄປແລ້ວ
        </p>

        <Link href="/dashboard" className="btn-primary mt-5 w-full">
          ກັບໄປ Dashboard
        </Link>
      </div>
    </div>
  );
}
