/** App mark: a green and a red candle. */
export default function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#161b25" />
      <path d="M11 7v18" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="11" width="6" height="9" rx="1.5" fill="#22c55e" />
      <path d="M21 6v19" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
      <rect x="18" y="13" width="6" height="8" rx="1.5" fill="#ef4444" />
    </svg>
  );
}
