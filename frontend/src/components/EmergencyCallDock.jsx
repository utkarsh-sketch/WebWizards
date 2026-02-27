const emergencyActions = [
  {
    id: 'ambulance',
    label: 'Ambulance',
    number: '108',
    bgClass: 'bg-rose-600/90 hover:bg-rose-500',
    ringClass: 'focus-visible:ring-rose-300/70',
    Icon: AmbulanceIcon,
  },
  {
    id: 'police',
    label: 'Police',
    number: '112',
    bgClass: 'bg-blue-600/90 hover:bg-blue-500',
    ringClass: 'focus-visible:ring-blue-300/70',
    Icon: ShieldIcon,
  },
];

export default function EmergencyCallDock() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[1400]"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      aria-hidden="false"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-8 sm:px-12 lg:px-16">
        {emergencyActions.map((action) => (
          <a
            key={action.id}
            href={`tel:${action.number}`}
            aria-label={`Call ${action.label} at ${action.number}`}
            className={`pointer-events-auto group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-md transition-all duration-200 ${
              action.id === 'ambulance'
                ? 'border-rose-300 bg-rose-200/70 text-rose-900 hover:bg-rose-200/85'
                : 'border-blue-300 bg-blue-200/70 text-blue-900 hover:bg-blue-200/85'
            } ${action.ringClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white`}
          >
            <span className={`inline-flex items-center justify-center rounded-full p-2 text-white ${action.bgClass}`}>
              <action.Icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            </span>
            <span>{action.label}</span>
            <span className="text-xs opacity-85">{action.number}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function AmbulanceIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 14h14a2 2 0 0 1 2 2v1H2v-1a2 2 0 0 1 1-2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 10h3l3 3v4h-6V10Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 8h3M8.5 6.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3 5 6v6c0 4.5 2.8 7.4 7 9 4.2-1.6 7-4.5 7-9V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
