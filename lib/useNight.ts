"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApi, type ChangeEvent, type SyncStatus } from "./api";
import type { NightData } from "./calc";
import type { Night, Player } from "./types";

const upsert = <T extends { id: string }>(rows: T[], row: T): T[] => {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i < 0) return [...rows, row];
  const next = rows.slice();
  next[i] = row;
  return next;
};

const EMPTY: NightData = { buyins: [], cashouts: [], expenses: [] };

/** One night's live state: initial load, realtime merges, and local (optimistic) merges via `apply`. */
export function useNight(id: string) {
  const api = getApi();
  const [night, setNight] = useState<Night | null>(null);
  const [data, setData] = useState<NightData>(EMPTY);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("connecting");
  const loaded = useRef(false);

  const apply = useCallback(
    (e: ChangeEvent) => {
      switch (e.table) {
        case "nights":
          if (e.row.id === id) setNight(e.row);
          break;
        case "players":
          setPlayers((p) => upsert(p, e.row).sort((a, b) => a.name.localeCompare(b.name)));
          break;
        case "buyins":
          setData((d) => ({ ...d, buyins: upsert(d.buyins, e.row) }));
          break;
        case "cashouts":
          setData((d) => ({ ...d, cashouts: upsert(d.cashouts, e.row) }));
          break;
        case "expenses":
          setData((d) => ({ ...d, expenses: upsert(d.expenses, e.row) }));
          break;
      }
    },
    [id],
  );

  const refresh = useCallback(async () => {
    try {
      const [n, d, p] = await Promise.all([api.getNight(id), api.getNightData(id), api.listPlayers()]);
      setNight(n);
      setData(d);
      setPlayers(p);
      setError(n ? null : "Night not found");
      loaded.current = true;
    } catch (e) {
      if (!loaded.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    // Initial fetch from the backend; state is set only after the await resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const off = api.subscribe(id, apply, (s) => {
      setSync(s);
      // After any (re)connect, refetch so nothing written while offline is missed.
      if (s === "synced" && loaded.current) void refresh();
    });
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    const onOffline = () => setSync("reconnecting");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [api, id, apply, refresh]);

  return { night, data, players, loading, error, sync, apply, refresh };
}
