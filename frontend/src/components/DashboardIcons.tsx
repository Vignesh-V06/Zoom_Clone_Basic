export function ScheduleIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect x="10" y="12" width="28" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
    <path d="M16 9v7M32 9v7M11 20h26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <text x="24" y="33" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">19</text>
  </svg>;
}

export function JoinIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect x="12" y="12" width="24" height="24" rx="6" fill="currentColor" />
    <path d="M24 18v12M18 24h12" fill="none" stroke="#1269eb" strokeWidth="2.8" strokeLinecap="round" />
  </svg>;
}

export function HostIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect x="8" y="15" width="23" height="19" rx="4" fill="currentColor" />
    <path d="m31 21 9-5v17l-9-5z" fill="currentColor" />
  </svg>;
}

export function CopyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="8" y="7" width="12" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M16 4H6a2 2 0 0 0-2 2v12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>;
}

export function EmptyRecentIcon() {
  return <svg className="empty-recent-illustration" viewBox="0 0 180 150" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="box-left" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#72b7ff" /><stop offset="1" stopColor="#3481ed" /></linearGradient>
      <linearGradient id="box-right" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#1473ed" /><stop offset="1" stopColor="#0753c8" /></linearGradient>
      <linearGradient id="box-flap" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#eff6ff" /><stop offset="1" stopColor="#b7d3ff" /></linearGradient>
    </defs>
    <path d="M50 122h75l26 10H76z" fill="#dce7fb" opacity=".8" />
    <path d="m54 54 36 16v59l-36-18z" fill="url(#box-left)" />
    <path d="m90 70 36-16v57l-36 18z" fill="url(#box-right)" />
    <path d="m54 54 36 16-14 22-37-17-8-18z" fill="url(#box-flap)" />
    <path d="m126 54-36 16 14 22 37-17 8-18z" fill="#a9cbff" />
    <path d="m90 31 36 15-36 16-36-16z" fill="#3f91f7" />
    <path d="m90 31 36 15-36 16z" fill="#6aafff" />
    <path d="m54 54 36 16v59l-36-18z" fill="#3986ef" opacity=".22" />
    <path d="m90 70 36-16v57l-36 18z" fill="#0655ce" opacity=".18" />
  </svg>;
}

export function ChevronDownIcon() {
  return <svg className="nav-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="m1.5 1.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
