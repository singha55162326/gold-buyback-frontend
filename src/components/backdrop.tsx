/**
 * Static page glows (no animation). Partly off-screen at the corners, behind
 * all content. Colors come from the theme tokens.
 */
export function Backdrop() {
  const base = 'pointer-events-none fixed rounded-full';
  const blur = { filter: 'blur(30px)' } as const;
  return (
    <div aria-hidden="true" className="no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className={`${base} -right-40 -top-40 h-[520px] w-[520px]`}
        style={{ background: 'var(--glow-gold)', ...blur }}
      />
      <div
        className={`${base} -bottom-48 -left-40 h-[560px] w-[560px]`}
        style={{ background: 'var(--glow-red)', ...blur }}
      />
      <div
        className={`${base} -bottom-24 -right-16 h-[280px] w-[280px]`}
        style={{ background: 'var(--glow-gold)', ...blur }}
      />
    </div>
  );
}
