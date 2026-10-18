/** ProfitLens mark: a lens ring with a rising line through it (original artwork). */
export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <circle cx="14" cy="14" r="7.5" fill="none" stroke="white" strokeWidth="2.2" />
        <path d="M19.5 19.5 25 25" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M9.5 16.5 12.5 13.5 14.5 15.5 18.5 11" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWordmark ? <span className="text-[15px] font-semibold tracking-tight">ProfitLens</span> : null}
    </span>
  );
}
