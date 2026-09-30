/** A small, original football crest for the independent fan publication. */
export default function FanMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 72 64" aria-hidden="true" focusable="false">
    <path d="M3 32C16 3 56 3 69 32C56 61 16 61 3 32Z" fill="currentColor" />
    <path d="M8 32C20 10 52 10 64 32C52 54 20 54 8 32Z" fill="none" stroke="var(--paper)" strokeWidth="1" />
    <path d="M25 19H47M29 16V22M36 16V22M43 16V22" fill="none" stroke="var(--paper)" strokeWidth="1.5" />
    <text x="36" y="45" textAnchor="middle" fill="var(--paper)" fontFamily="var(--font-hed), Impact, sans-serif" fontSize="26" fontStyle="italic">AF</text>
  </svg>;
}
