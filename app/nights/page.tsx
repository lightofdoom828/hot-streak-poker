"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGate, DemoBanner } from "@/components/AuthGate";
import { MoneyInput, Pnl, SyncDot } from "@/components/bits";
import { ChipBadge } from "@/components/ChipBadge";
import { useToast } from "@/components/Toast";
import { Button, Field, inputClass, Pill, Sheet } from "@/components/ui";
import { friendlyError, getApi, type SyncStatus } from "@/lib/api";
import { nightSummary, type NightData } from "@/lib/calc";
import { formatMonth, formatNightDate, melbourneToday, monthKey } from "@/lib/dates";
import { centsToInput, formatCents, parseMoney } from "@/lib/money";
import type { Night } from "@/lib/types";

function NightsList() {
  const api = getApi();
  const router = useRouter();
  const toast = useToast();
  const [nights, setNights] = useState<Night[]>([]);
  const [data, setData] = useState<Record<string, NightData>>({});
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listNights();
      setNights(res.nights);
      setData(res.data);
    } catch (e) {
      toast({ message: friendlyError(e), tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => {
    // Initial fetch from the backend; state is set only after the await resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Any change anywhere just refetches the list; it is small.
    let timer = 0;
    const off = api.subscribe(
      null,
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void refresh(), 250);
      },
      setSync,
    );
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [api, refresh]);

  const summaries = useMemo(
    () => Object.fromEntries(nights.map((n) => [n.id, nightSummary(data[n.id] ?? { buyins: [], cashouts: [], expenses: [] })])),
    [nights, data],
  );

  const thisMonth = monthKey(melbourneToday());
  const monthTotal = nights.filter((n) => monthKey(n.date) === thisMonth).reduce((acc, n) => acc + summaries[n.id].net_pnl, 0);
  const monthCount = nights.filter((n) => monthKey(n.date) === thisMonth).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <AppHeader right={<SyncDot status={sync} />} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 p-4">
        <section className="felt rounded-[1.75rem] p-5" aria-label="Month total">
          <p className="text-xs font-medium uppercase tracking-wide text-cream/80">Net P&amp;L · {formatMonth(thisMonth)}</p>
          <p className="font-display mt-1 text-5xl">
            <Pnl cents={monthTotal} animate className={monthTotal < 0 ? "" : "!text-cream"} />
          </p>
          <div className="betting-line my-3" />
          <p className="text-sm text-cream/90">
            {monthCount} {monthCount === 1 ? "night" : "nights"} this month · includes open nights (estimate)
          </p>
        </section>

        <Button variant="primary" className="min-h-14 w-full text-base" onClick={() => setStarting(true)}>
          Start new night
        </Button>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted">Loading nights…</p>
        ) : nights.length === 0 ? (
          <div className="felt rounded-[1.75rem] p-8 text-center">
            <p className="font-display text-2xl">No nights yet</p>
            <p className="mt-1 text-sm text-cream/90">Start one when the first player sits down.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {nights.map((n) => {
              const s = summaries[n.id];
              const open = n.status === "open";
              return (
                <li key={n.id}>
                  <Link
                    href={`/night?id=${n.id}`}
                    className={`block rounded-2xl p-4 transition ${
                      open ? "felt rounded-[1.5rem]" : "border border-rail-border bg-rail-raised hover:border-muted"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ChipBadge label={s.players_total} variant={open ? "buyin" : "cashout"} title={`${s.players_total} players`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-xl leading-tight">{formatNightDate(n.date)}</p>
                        <p className={`truncate text-sm ${open ? "text-cream/90" : "text-muted"}`}>
                          {n.venue || "No venue"} · {s.players_total} {s.players_total === 1 ? "player" : "players"}
                        </p>
                      </div>
                      <div className="text-right">
                        {open ? (
                          <span className="inline-flex rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-black">Open</span>
                        ) : (
                          <Pill tone="muted">Closed</Pill>
                        )}
                        <p className="mt-1 text-xs opacity-80">{open ? "Est. net P&L" : "Net P&L"}</p>
                        <p className="text-lg font-semibold">
                          {open ? (
                            <span className="tabular text-cream">{formatCents(s.net_pnl)}</span>
                          ) : (
                            <Pnl cents={s.net_pnl} />
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <StartNightSheet
        open={starting}
        onClose={() => setStarting(false)}
        defaultBuyin={nights[0]?.default_buyin_cents ?? 20000}
        defaultVenue={nights[0]?.venue ?? ""}
        onCreated={(n) => router.push(`/night?id=${n.id}`)}
      />
    </div>
  );
}

function StartNightSheet({
  open,
  onClose,
  defaultBuyin,
  defaultVenue,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultBuyin: number;
  defaultVenue: string;
  onCreated: (n: Night) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Start new night">
      <StartNightForm defaultBuyin={defaultBuyin} defaultVenue={defaultVenue} onCreated={onCreated} />
    </Sheet>
  );
}

function StartNightForm({
  defaultBuyin,
  defaultVenue,
  onCreated,
}: {
  defaultBuyin: number;
  defaultVenue: string;
  onCreated: (n: Night) => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(melbourneToday());
  const [venue, setVenue] = useState(defaultVenue);
  const [buyin, setBuyin] = useState(centsToInput(defaultBuyin));
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(buyin);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!cents) return;
        setBusy(true);
        try {
          onCreated(await getApi().createNight({ date, venue: venue.trim() || null, default_buyin_cents: cents }));
        } catch (err) {
          toast({ message: friendlyError(err), tone: "error" });
          setBusy(false);
        }
      }}
    >
      <Field label="Date" hint="A night that runs past midnight keeps the date it started.">
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Venue">
        <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Jack's place" className={inputClass} />
      </Field>
      <Field label="Default buy-in" hint="The one-tap buy-in amount for this night.">
        <MoneyInput label="Default buy-in" value={buyin} onChange={setBuyin} large={false} />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !cents}>
        {busy ? "Starting…" : "Start night"}
      </Button>
    </form>
  );
}

export default function NightsPage() {
  return (
    <AuthGate>
      <NightsList />
    </AuthGate>
  );
}
