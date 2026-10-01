"use client";

import { useEffect, useRef, useState } from "react";
import type { SyncStatus } from "@/lib/api";
import { formatCents } from "@/lib/money";
import type { Cents } from "@/lib/types";

export function Wordmark({ stacked = false, className = "" }: { stacked?: boolean; className?: string }) {
  if (stacked) {
    return (
      <h1 className={`font-display leading-[0.92] text-cream ${className}`}>
        {/* All cream here: gold on felt is only 3:1, below AA even for display type. */}
        <span className="block text-7xl">Hot</span>
        <span className="block text-7xl">Streak</span>
        <span className="block text-7xl">Poker</span>
      </h1>
    );
  }
  return (
    <span className={`font-display whitespace-nowrap text-xl text-cream ${className}`}>
      <span className="text-gold">Hot</span> Streak Poker
    </span>
  );
}

export function SyncDot({ status }: { status: SyncStatus }) {
  const ok = status === "synced";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
      <span className={`size-2 rounded-full ${ok ? "bg-ok" : "animate-pulse bg-pending"}`} aria-hidden />
      {ok ? "Synced" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  );
}

/** Dollar input with a decimal keypad on phones. Value is the raw typed string; parse with parseMoney. */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  label,
  large = true,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  label: string;
  large?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      // After the sheet's open animation, so the phone keyboard does not fight it.
      const t = window.setTimeout(() => {
        ref.current?.focus();
        ref.current?.select();
      }, 60);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus]);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-rail-border bg-rail px-4 focus-within:border-gold ${
        large ? "min-h-16" : "min-h-11"
      }`}
    >
      <span className={`text-muted ${large ? "font-display text-3xl" : "text-base"}`} aria-hidden>
        $
      </span>
      <input
        ref={ref}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        placeholder="0"
        className={`tabular w-full bg-transparent text-text placeholder:text-muted focus:outline-none ${
          large ? "font-display text-4xl" : "text-base"
        }`}
      />
    </div>
  );
}

/** Money that counts up/down to its new value (instant under prefers-reduced-motion). */
export function CountUp({ cents, className = "" }: { cents: Cents; className?: string }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  useEffect(() => {
    const start = from.current;
    if (start === cents) return;
    // Reduced motion: jump straight to the value on the next frame.
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = ms === 0 ? 1 : Math.min(1, (t - t0) / ms);
      const v = Math.round(start + (cents - start) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = cents;
    };
    raf = requestAnimationFrame(tick);
    // Browsers pause rAF when the tab is not being painted. The figure is money, so a timer
    // guarantees it lands on the true value even if the animation never ran.
    const settle = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      from.current = cents;
      setShown(cents);
    }, ms + 150);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      from.current = cents;
    };
  }, [cents]);
  return <span className={`tabular ${className}`}>{formatCents(shown)}</span>;
}

/** Signed P&L: green when up or square, error colour + down arrow when negative. */
export function Pnl({ cents, className = "", animate = false }: { cents: Cents; className?: string; animate?: boolean }) {
  const neg = cents < 0;
  return (
    <span className={`tabular inline-flex items-center gap-1 ${neg ? "text-error" : "text-ok"} ${className}`}>
      {neg && (
        <svg width="0.6em" height="0.6em" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 2h10L5 9z" fill="currentColor" />
        </svg>
      )}
      {animate ? <CountUp cents={cents} /> : formatCents(cents)}
    </span>
  );
}
