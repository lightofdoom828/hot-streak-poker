"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGate, DemoBanner } from "@/components/AuthGate";
import { Pnl, SyncDot } from "@/components/bits";
import { NightProvider, useNightCtx } from "@/components/night/context";
import { ExpensesTab } from "@/components/night/ExpensesTab";
import { PlayersTab } from "@/components/night/PlayersTab";
import { AuditTab, NegativeBookBanner, SummaryTab } from "@/components/night/SummaryTab";
import { Button, Pill, WarnIcon } from "@/components/ui";
import { formatNightDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { useNight } from "@/lib/useNight";

type Tab = "players" | "expenses" | "summary" | "audit";

function SummaryHeader() {
  const { night, summary: s, readOnly } = useNightCtx();
  const negative = s.book < 0;
  return (
    <section className="felt rounded-[1.75rem] p-4" aria-label="Night summary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-cream/85">
            {s.revenue_final ? "Book (all cashed out)" : "Book (incl. chips in play)"}
          </p>
          <p
            className={`font-display tabular flex items-center gap-2 text-5xl leading-none ${
              negative ? "rounded-lg bg-rail px-2 py-1 text-error" : ""
            }`}
          >
            {negative && <WarnIcon className="size-7" />}
            {formatCents(s.book)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg leading-tight">{formatNightDate(night.date)}</p>
          <p className="text-xs text-cream/85">{night.venue || "No venue"}</p>
          <p className="mt-1">
            {readOnly ? (
              <span className="inline-flex rounded-full bg-rail px-2 py-0.5 text-xs font-semibold text-cream">Closed</span>
            ) : (
              <span className="inline-flex rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-black">Open</span>
            )}
          </p>
        </div>
      </div>
      <div className="betting-line my-3" />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-cream/85">Players</dt>
          <dd className="tabular font-semibold">
            {s.players_seated} seated · {s.players_cashed_out} out
          </dd>
        </div>
        <div>
          <dt className="text-xs text-cream/85">{s.revenue_final ? "Net P&L" : "Net P&L (est.)"}</dt>
          <dd className="font-semibold">
            {s.net_pnl < 0 ? (
              <span className="rounded bg-rail px-1.5 py-0.5">
                <Pnl cents={s.net_pnl} animate />
              </span>
            ) : (
              <Pnl cents={s.net_pnl} animate className="!text-cream" />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-cream/85">Owed to us</dt>
          <dd className="tabular font-semibold">{formatCents(s.receivables)}</dd>
        </div>
        <div>
          <dt className="text-xs text-cream/85">We owe</dt>
          <dd className="tabular font-semibold">{formatCents(s.payables)}</dd>
        </div>
      </dl>
    </section>
  );
}

function NightBody() {
  const { readOnly, playerRows, data } = useNightCtx();
  const [tab, setTab] = useState<Tab>("players");
  const tabs: { id: Tab; label: string }[] = [
    { id: "players", label: `Players (${playerRows.length})` },
    { id: "expenses", label: `Expenses (${data.expenses.filter((e) => !e.deleted_at).length})` },
    { id: "summary", label: "Summary" },
    { id: "audit", label: "Audit" },
  ];
  return (
    <>
      <div className="sticky top-0 z-10 space-y-2 bg-rail px-3 pb-2 pt-3">
        <SummaryHeader />
        <div role="tablist" aria-label="Night sections" className="grid grid-cols-4 gap-1 rounded-xl border border-rail-border bg-rail-raised p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 rounded-lg px-1 text-[13px] leading-tight transition ${
                tab === t.id ? "bg-gold font-semibold text-black" : "text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="space-y-3 px-3 pb-28 pt-1">
        <NegativeBookBanner />
        {readOnly && tab !== "summary" && tab !== "audit" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Pill tone="muted">Closed</Pill> Read-only. Reopen from the Summary tab to edit.
          </p>
        )}
        {tab === "players" && <PlayersTab />}
        {tab === "expenses" && <ExpensesTab />}
        {tab === "summary" && <SummaryTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </>
  );
}

function NightScreen({ id }: { id: string }) {
  const { night, data, players, loading, error, sync, apply, refresh } = useNight(id);
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <AppHeader back right={<SyncDot status={sync} />} />
      <main className="mx-auto w-full max-w-2xl flex-1">
        {loading ? (
          <p className="py-16 text-center text-sm text-muted">Loading night…</p>
        ) : error || !night ? (
          <div className="space-y-4 p-8 text-center">
            <p className="text-sm text-error">{error ?? "Night not found"}</p>
            <Link href="/nights" className="text-gold underline">
              Back to nights
            </Link>
            <div>
              <Button onClick={() => void refresh()}>Try again</Button>
            </div>
          </div>
        ) : (
          <NightProvider night={night} data={data} players={players} apply={apply} refresh={refresh}>
            <NightBody />
          </NightProvider>
        )}
      </main>
    </div>
  );
}

function NightRoute() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <p className="p-8 text-center text-sm text-muted">
        No night selected.{" "}
        <Link href="/nights" className="text-gold underline">
          Back to nights
        </Link>
      </p>
    );
  }
  return <NightScreen key={id} id={id} />;
}

export default function NightPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <NightRoute />
      </Suspense>
    </AuthGate>
  );
}
