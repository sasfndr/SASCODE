// FILE: sascode/brand/SascodeMark.tsx
// Purpose: The SASCODE wordmark and symbol.
// Layer: Brand.
//
// The symbol is three offset rounded planes — project, session, active work —
// whose negative space reads as an open doorway. No terminal prompts, angle
// brackets, braces, or sparkles: the mark is architectural, like the product.

interface MarkProps {
  className?: string;
  /** Size in px. The symbol is square. */
  size?: number;
}

export function SascodeSymbol({ className, size = 18 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Back plane — the project. */}
      <path
        d="M6.5 3.5h11a3 3 0 0 1 3 3v5.2a3 3 0 0 1-3 3h-3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.42"
      />
      {/* Middle plane — the session. */}
      <path
        d="M17.5 9.4h-11a3 3 0 0 0-3 3v5.1a3 3 0 0 0 3 3h11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.72"
      />
      {/* Front plane — the active work. The gap between the two long strokes is
          the doorway. */}
      <path d="M10.6 14.7h6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SascodeWordmark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.22em",
        // Architectural tracking; the mark is set in the interface face rather
        // than a display face so it sits inside the frame, not on top of it.
        textTransform: "uppercase",
      }}
    >
      Sascode
    </span>
  );
}

export function SascodeLockup({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <SascodeSymbol size={17} className="text-[var(--sas-text)]" />
      <SascodeWordmark className="text-[var(--sas-text)]" />
    </span>
  );
}
