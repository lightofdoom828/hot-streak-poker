"use client";

// Small shadcn-style primitives, styled with the brand tokens.
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-gold text-black hover:brightness-110 active:brightness-95 font-semibold",
  secondary: "bg-rail-raised text-text border border-rail-border hover:border-muted",
  ghost: "text-text hover:bg-white/5",
  danger: "bg-error text-black font-semibold hover:brightness-110",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Two-to-four option toggle, e.g. Paid | Unpaid. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-rail-border bg-rail p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-lg px-2 text-sm transition ${
            value === o.value ? "bg-gold font-semibold text-black" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on desktop. Built on <dialog> for focus + Esc handling. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The dialog's close event also fires when we close it ourselves (open -> false). Only report
  // closes the user started (Esc, backdrop), or a parent swapping one sheet for another would
  // have its new state wiped by the old sheet's close event.
  const wantOpen = useRef(open);
  useEffect(() => {
    wantOpen.current = open;
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={() => wantOpen.current && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-rail-border bg-rail-raised p-0 text-text sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
    >
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-cream">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-11 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-text"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-rail-border bg-rail px-3 text-base text-text placeholder:text-muted focus:border-gold focus:outline-none";

export function Pill({ tone, children }: { tone: "ok" | "pending" | "error" | "muted" | "gold"; children: ReactNode }) {
  const tones = {
    ok: "border-ok/40 text-ok",
    pending: "border-pending/50 text-pending",
    error: "border-error/50 text-error",
    muted: "border-rail-border text-muted",
    gold: "border-gold/60 text-gold",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function WarnIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 10v5M12 18v.5" />
    </svg>
  );
}

export function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
