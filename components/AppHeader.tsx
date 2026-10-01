"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { getApi } from "@/lib/api";
import { useHost } from "./AuthGate";
import { Wordmark } from "./bits";

export function AppHeader({ back, right }: { back?: boolean; right?: ReactNode }) {
  const { host } = useHost();
  const router = useRouter();
  return (
    <header className="flex items-center gap-2 border-b border-rail-border bg-rail-raised px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      {back && (
        <Link
          href="/nights"
          aria-label="Back to nights"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      )}
      <Link href="/nights" className={back ? "" : "pl-2"}>
        <Wordmark />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {right}
        <button
          type="button"
          onClick={() => void getApi().signOut().then(() => router.replace("/login"))}
          className="min-h-11 whitespace-nowrap rounded-lg px-2 text-xs text-muted hover:text-text"
          title={`Signed in as ${host.display_name}`}
        >
          <span className="hidden sm:inline">{host.display_name} · </span>Sign out
        </button>
      </div>
    </header>
  );
}
