export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div data-fade className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-gold-gradient font-serif text-[26px] font-bold leading-[1.5] sm:text-[34px]">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm font-light text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}
