export default function SectionCard({ title, subtitle, children, tone = 'default' }) {
  const toneClass = {
    default: 'border-slate-200',
    danger: 'border-rose-200',
    success: 'border-emerald-200',
    warn: 'border-amber-200',
  }[tone];

  return (
    <section className={`rounded-2xl border ${toneClass} bg-white p-5 shadow-glow`}>
      <header className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
