"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckIcon, WarnIcon } from "./ui";

interface ToastInput {
  message: string;
  tone?: "ok" | "error";
  action?: { label: string; onClick: () => void };
  ms?: number;
}
interface ToastItem extends ToastInput {
  id: number;
}

const Ctx = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = next.current++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.ms ?? 5000);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-rail-border bg-rail-raised px-4 py-3 text-sm shadow-2xl shadow-black/60"
          >
            {t.tone === "error" ? (
              <WarnIcon className="shrink-0 text-error" />
            ) : (
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ok/20 text-ok">
                <CheckIcon />
              </span>
            )}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 font-semibold text-gold hover:bg-white/5"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
