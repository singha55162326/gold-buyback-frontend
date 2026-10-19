'use client';

import { useId } from 'react';

/**
 * Opt-in override for the shop's own artwork. Set NEXT_PUBLIC_LOGO_SRC (e.g.
 * `/brand/logo.png`, with the file in frontend/public/brand/) and every place
 * the mark appears uses it instead. Left unset, the default is /PV_logo.png
 * (public/); set it to `vector` to use the vector mark below.
 */
const ASSET_SRC = process.env.NEXT_PUBLIC_LOGO_SRC || '/PV_logo.png';

/**
 * ໂລໂກ້ຮ້ານຄຳພູວົງ — the diamond-over-ring mark with the PV monogram,
 * redrawn as vector so the UI ships a real logo with no binary asset and stays
 * crisp from the 16px favicon to the login card. `currentColor` throughout, so
 * it takes the gold of whatever it sits in.
 */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');

  if (ASSET_SRC !== 'vector') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ASSET_SRC}
        alt="ຮ້ານຄຳພູວົງ"
        width={96}
        height={96}
        className={`${className} object-contain`}
        style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.4))' }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 200 220"
      className={className}
      role="img"
      aria-label="ຮ້ານຄຳພູວົງ"
      fill="none"
    >
      <defs>
        {/* The diamond interrupts the band, as it does in the shop's mark.
            Punching it out of the ring keeps that read on any background. */}
        <path id={`${uid}-dia`} d="M62 12 H138 L170 48 L100 128 L30 48 Z" />
        <mask id={`${uid}-ring`}>
          <rect width="200" height="220" fill="white" />
          <use
            href={`#${uid}-dia`}
            fill="black"
            stroke="black"
            strokeWidth="16"
            strokeLinejoin="round"
          />
        </mask>
      </defs>

      {/* Band: an annulus, evenodd punching the inner circle. */}
      <path
        d="M100 140 m-78 0 a78 78 0 1 0 156 0 a78 78 0 1 0 -156 0
           M100 140 m-58 0 a58 58 0 1 0 116 0 a58 58 0 1 0 -116 0"
        fill="currentColor"
        fillRule="evenodd"
        mask={`url(#${uid}-ring)`}
      />

      {/* Brilliant cut, drawn as outline + facets. */}
      <g
        stroke="currentColor"
        strokeWidth="7"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      >
        <use href={`#${uid}-dia`} />
        <path d="M44 30 H156 M30 48 H170" />
        {/* crown */}
        <path d="M62 12 L44 30 M81 12 L72 30 M100 12 V30 M119 12 L128 30 M138 12 L156 30" />
        <path d="M44 30 L30 48 M72 30 L65 48 M100 30 V48 M128 30 L135 48 M156 30 L170 48" />
        {/* pavilion */}
        <path d="M65 48 L100 128 M100 48 V128 M135 48 L100 128" />
        <path d="M79 97 A 26 26 0 0 1 121 97" />
      </g>

      {/* PV monogram, seated inside the band. */}
      <text
        x="100"
        y="162"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="'Times New Roman', Georgia, serif"
        fontSize="62"
        fontWeight="700"
        letterSpacing="2"
      >
        PV
      </text>
    </svg>
  );
}

/**
 * The mark plus the shop name — the sidebar brand block and the login card.
 * `tone` is accepted for existing callers but is a no-op: the lockup always
 * sits on a surface whose tokens already resolve to the right colours.
 */
export function LogoLockup({
  className = 'h-9 w-9',
}: {
  className?: string;
  /** @deprecated No-op, kept so existing callers keep compiling. */
  tone?: 'on-dark' | 'on-light';
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <LogoMark className={`${className} shrink-0 text-gold`} />
      <div className="min-w-0">
        <div className="text-gold-gradient truncate font-serif text-[18px] font-bold leading-tight">
          ຮ້ານຄຳພູວົງ
        </div>
        <div className="truncate font-latin text-[11px] font-semibold uppercase tracking-[0.42em] text-gold">
          Khamphouvong
        </div>
      </div>
    </div>
  );
}
