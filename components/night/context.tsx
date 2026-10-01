"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { friendlyError, getApi, type BuyInPatch, type CashOutPatch, type ChangeEvent, type ExpensePatch } from "@/lib/api";
import { DEFAULT_LARGE_AMOUNT_CENTS, nightSummary, playerSummaries, type NightData, type NightSummary, type PlayerSummary } from "@/lib/calc";
import type { BuyIn, CashOut, Expense, Night, Player } from "@/lib/types";
import { useHost } from "../AuthGate";
import { useToast } from "../Toast";

const envThreshold = Number(process.env.NEXT_PUBLIC_LARGE_AMOUNT_DOLLARS);
export const LARGE_AMOUNT_CENTS =
  Number.isFinite(envThreshold) && envThreshold > 0 ? Math.round(envThreshold) * 100 : DEFAULT_LARGE_AMOUNT_CENTS;

type NewBuyIn = Pick<BuyIn, "player_id" | "amount_cents" | "payment_status" | "payment_method" | "is_comp">;
type NewCashOut = Pick<CashOut, "player_id" | "amount_cents" | "payout_status" | "override_reason">;
type NewExpense = Pick<Expense, "category" | "amount_cents" | "note" | "paid_by" | "status">;

interface Opts {
  /** Toast text on success. Omit for a silent write (batches show one toast themselves). */
  message?: string;
}

export interface NightCtx {
  night: Night;
  data: NightData;
  players: Player[];
  readOnly: boolean;
  summary: NightSummary;
  playerRows: PlayerSummary[];
  names: Record<string, string>;
  playerName: (id: string) => string;
  apply: (e: ChangeEvent) => void;
  refresh: () => Promise<void>;
  addBuyIn: (row: NewBuyIn, o?: Opts) => Promise<BuyIn | null>;
  patchBuyIn: (row: BuyIn, patch: BuyInPatch, o?: Opts) => Promise<boolean>;
  addCashOut: (row: NewCashOut, o?: Opts) => Promise<CashOut | null>;
  patchCashOut: (row: CashOut, patch: CashOutPatch, o?: Opts) => Promise<boolean>;
  addExpense: (row: NewExpense, o?: Opts) => Promise<Expense | null>;
  patchExpense: (row: Expense, patch: ExpensePatch, o?: Opts) => Promise<boolean>;
}

const Ctx = createContext<NightCtx | null>(null);

export function useNightCtx(): NightCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNightCtx outside provider");
  return v;
}

type Table = "buyins" | "cashouts" | "expenses";

export function NightProvider({
  night,
  data,
  players,
  apply,
  refresh,
  children,
}: {
  night: Night;
  data: NightData;
  players: Player[];
  apply: (e: ChangeEvent) => void;
  refresh: () => Promise<void>;
  children: ReactNode;
}) {
  const api = getApi();
  const toast = useToast();
  const { host } = useHost();

  const value = useMemo<NightCtx>(() => {
    const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
    const now = () => new Date().toISOString();
    const emit = (table: Table, row: unknown) => apply({ table, row } as ChangeEvent);

    const fail = (e: unknown) => {
      toast({ message: friendlyError(e), tone: "error" });
      void refresh(); // drop whatever was applied optimistically
    };

    // Insert: show it immediately, confirm with the saved row, offer Undo (a soft delete).
    async function insert<T extends { id: string }>(
      table: Table,
      fields: object,
      call: (row: never) => Promise<T>,
      softDelete: (saved: T) => Promise<unknown>,
      o?: Opts,
    ): Promise<T | null> {
      const base = { id: crypto.randomUUID(), night_id: night.id, ...fields };
      emit(table, { ...base, created_by: host.id, created_at: now(), updated_at: now(), deleted_at: null });
      try {
        const saved = await call(base as never);
        emit(table, saved);
        if (o?.message) {
          toast({
            message: o.message,
            action: {
              label: "Undo",
              onClick: () =>
                void softDelete(saved)
                  .then((r) => emit(table, r))
                  .catch(fail),
            },
          });
        }
        return saved;
      } catch (e) {
        fail(e);
        return null;
      }
    }

    // Update: same pattern; Undo writes the previous values back.
    async function patch<T extends { id: string }, P extends object>(
      table: Table,
      row: T,
      p: P,
      call: (id: string, p: P) => Promise<T>,
      o?: Opts,
    ): Promise<boolean> {
      emit(table, { ...row, ...p, updated_at: now() });
      try {
        emit(table, await call(row.id, p));
        if (o?.message) {
          const previous = Object.fromEntries(Object.keys(p).map((k) => [k, (row as Record<string, unknown>)[k]])) as P;
          toast({
            message: o.message,
            action: {
              label: "Undo",
              onClick: () =>
                void call(row.id, previous)
                  .then((r) => emit(table, r))
                  .catch(fail),
            },
          });
        }
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    }

    return {
      night,
      data,
      players,
      readOnly: night.status === "closed",
      summary: nightSummary(data),
      playerRows: playerSummaries(data),
      names,
      playerName: (id) => names[id] ?? "Unknown",
      apply,
      refresh,
      addBuyIn: (row, o) => insert<BuyIn>("buyins", row, api.insertBuyIn, (s) => api.updateBuyIn(s.id, { deleted_at: now() }), o),
      patchBuyIn: (row, p, o) => patch("buyins", row, p, api.updateBuyIn, o),
      addCashOut: (row, o) => insert<CashOut>("cashouts", row, api.insertCashOut, (s) => api.updateCashOut(s.id, { deleted_at: now() }), o),
      patchCashOut: (row, p, o) => patch("cashouts", row, p, api.updateCashOut, o),
      addExpense: (row, o) => insert<Expense>("expenses", row, api.insertExpense, (s) => api.updateExpense(s.id, { deleted_at: now() }), o),
      patchExpense: (row, p, o) => patch("expenses", row, p, api.updateExpense, o),
    };
  }, [api, apply, data, host.id, night, players, refresh, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
