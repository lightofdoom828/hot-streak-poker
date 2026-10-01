// Every number the app shows is computed here. The UI never does its own maths.
// Definitions follow SPEC.md §3 exactly. All values are integer cents.

import { formatNightDate } from "./dates";
import { formatCents, formatCentsShort } from "./money";
import type { BuyIn, CashOut, Cents, Expense } from "./types";

export const DEFAULT_LARGE_AMOUNT_CENTS: Cents = 200000; // $2,000

export interface NightData {
  buyins: BuyIn[];
  cashouts: CashOut[];
  expenses: Expense[];
}

export interface PlayerSummary {
  player_id: string;
  buyin_count: number;
  total_buyins: Cents;
  paid_buyins: Cents;
  unpaid_buyins: Cents;
  comp_buyins: Cents;
  total_cashout: Cents;
  payouts_sent: Cents;
  cashout_count: number;
  /** total_cashout − total_buyins: the player's win/loss for the night. */
  player_result: Cents;
  /** > 0 house owes player · < 0 player owes house · 0 square. */
  settlement: Cents;
  /** Has bought in and has no cash-out yet. */
  seated: boolean;
}

export interface NightSummary {
  chips_issued: Cents;
  chips_returned: Cents;
  /** chips_issued − chips_returned. Includes chips still in play while anyone is seated. */
  book: Cents;
  players_total: number;
  players_seated: number;
  players_cashed_out: number;
  all_cashed_out: boolean;
  revenue: Cents;
  /** Revenue is only final once every player has cashed out. */
  revenue_final: boolean;
  comp_cost: Cents;
  manual_expenses: Cents;
  total_expenses: Cents;
  /** Derived "comps" line first, then each manual category that has spend. */
  expenses_by_category: Record<string, Cents>;
  net_pnl: Cents;
  cash_received: Cents;
  cash_sent: Cents;
  expenses_paid: Cents;
  cash_position: Cents;
  receivables: Cents;
  payables: Cents;
  projected_final: Cents;
}

const live = <T extends { deleted_at: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deleted_at);
const sum = <T>(rows: T[], pick: (r: T) => Cents): Cents => rows.reduce((acc, r) => acc + pick(r), 0);
const amt = (r: { amount_cents: Cents }) => r.amount_cents;

/** One summary per player who has any live buy-in or cash-out tonight, in first-entry order. */
export function playerSummaries(data: NightData): PlayerSummary[] {
  const buyins = live(data.buyins);
  const cashouts = live(data.cashouts);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const r of [...buyins, ...cashouts].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!seen.has(r.player_id)) {
      seen.add(r.player_id);
      order.push(r.player_id);
    }
  }

  return order.map((player_id) => {
    const b = buyins.filter((r) => r.player_id === player_id);
    const c = cashouts.filter((r) => r.player_id === player_id);
    const total_buyins = sum(b, amt);
    const unpaid_buyins = sum(b.filter((r) => !r.is_comp && r.payment_status === "unpaid"), amt);
    const total_cashout = sum(c, amt);
    const payouts_sent = sum(c.filter((r) => r.payout_status === "sent"), amt);
    return {
      player_id,
      buyin_count: b.length,
      total_buyins,
      paid_buyins: sum(b.filter((r) => !r.is_comp && r.payment_status === "paid"), amt),
      unpaid_buyins,
      comp_buyins: sum(b.filter((r) => r.is_comp), amt),
      total_cashout,
      payouts_sent,
      cashout_count: c.length,
      player_result: total_cashout - total_buyins,
      settlement: total_cashout - payouts_sent - unpaid_buyins,
      seated: b.length > 0 && c.length === 0,
    };
  });
}

export function nightSummary(data: NightData): NightSummary {
  const buyins = live(data.buyins);
  const cashouts = live(data.cashouts);
  const expenses = live(data.expenses);
  const players = playerSummaries(data);

  const chips_issued = sum(buyins, amt);
  const chips_returned = sum(cashouts, amt);
  const book = chips_issued - chips_returned;

  const players_seated = players.filter((p) => p.seated).length;
  const players_cashed_out = players.filter((p) => p.cashout_count > 0).length;
  const all_cashed_out = players.length > 0 && players_seated === 0;

  const comp_cost = sum(buyins.filter((r) => r.is_comp), amt);
  const manual_expenses = sum(expenses, amt);
  const total_expenses = comp_cost + manual_expenses;

  const expenses_by_category: Record<string, Cents> = {};
  if (comp_cost > 0) expenses_by_category.comps = comp_cost;
  for (const e of expenses) expenses_by_category[e.category] = (expenses_by_category[e.category] ?? 0) + e.amount_cents;

  const revenue = book;
  const net_pnl = revenue - total_expenses;

  const cash_received = sum(buyins.filter((r) => !r.is_comp && r.payment_status === "paid"), amt);
  const cash_sent = sum(cashouts.filter((r) => r.payout_status === "sent"), amt);
  const expenses_paid = sum(expenses.filter((r) => r.status === "paid"), amt);
  const cash_position = cash_received - cash_sent - expenses_paid;
  const receivables = sum(buyins.filter((r) => !r.is_comp && r.payment_status === "unpaid"), amt);
  const payables =
    sum(cashouts.filter((r) => r.payout_status === "pending"), amt) +
    sum(expenses.filter((r) => r.status === "pending"), amt);

  return {
    chips_issued,
    chips_returned,
    book,
    players_total: players.length,
    players_seated,
    players_cashed_out,
    all_cashed_out,
    revenue,
    revenue_final: all_cashed_out,
    comp_cost,
    manual_expenses,
    total_expenses,
    expenses_by_category,
    net_pnl,
    cash_received,
    cash_sent,
    expenses_paid,
    cash_position,
    receivables,
    payables,
    projected_final: cash_position + receivables - payables,
  };
}

// ---- settlement wording --------------------------------------------------------

export interface SettlementPreview {
  kind: "send" | "owes" | "square";
  headline: string;
  /** Explains any netting so nobody pays out the full cash-out and forgets the unpaid buy-in. */
  detail: string | null;
}

export function settlementPreview(p: PlayerSummary, name: string): SettlementPreview {
  const parts: string[] = [];
  if (p.unpaid_buyins > 0) parts.push(`${formatCentsShort(p.unpaid_buyins)} unpaid netted off`);
  if (p.payouts_sent > 0) parts.push(`${formatCentsShort(p.payouts_sent)} already sent`);
  const detail = parts.length ? parts.join(" · ") : null;
  if (p.settlement > 0) return { kind: "send", headline: `Send ${name} ${formatCentsShort(p.settlement)}`, detail };
  if (p.settlement < 0) return { kind: "owes", headline: `${name} owes ${formatCentsShort(-p.settlement)}`, detail };
  return { kind: "square", headline: `${name} is square`, detail };
}

/** Plain text for the group chat. `names` maps player_id -> display name. */
export function settlementText(nightDate: string, data: NightData, names: Record<string, string>): string {
  const players = playerSummaries(data);
  const label = (p: PlayerSummary) => `${names[p.player_id] ?? "Unknown"} ${formatCentsShort(Math.abs(p.settlement))}`;
  const send = players.filter((p) => p.settlement > 0).sort((a, b) => b.settlement - a.settlement);
  const owed = players.filter((p) => p.settlement < 0).sort((a, b) => a.settlement - b.settlement);
  const lines = [`HOT STREAK POKER — ${formatNightDate(nightDate)}`, "Settlements"];
  if (send.length) lines.push(`Send: ${send.map(label).join(", ")}`);
  if (owed.length) lines.push(`Owed to us: ${owed.map(label).join(", ")}`);
  if (!send.length && !owed.length) lines.push("All square");
  return lines.join("\n");
}

// ---- validation (SPEC §3.5) -------------------------------------------------------

export interface Issue {
  code: "negative_book" | "players_seated" | "unpaid_buyins" | "pending_payouts";
  message: string;
}

export interface CloseValidation {
  canClose: boolean;
  errors: Issue[];
  warnings: Issue[];
}

export const NEGATIVE_BOOK_CHECKLIST = [
  "A buy-in (or rebuy) wasn't logged",
  "A cash-out amount was mistyped (check for an extra zero)",
  "A comp/bonus buy-in wasn't logged as a buy-in",
  "A player was cashed out twice",
];

export function validateClose(data: NightData, names: Record<string, string> = {}): CloseValidation {
  const s = nightSummary(data);
  const players = playerSummaries(data);
  const nameOf = (id: string) => names[id] ?? "Unknown";
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  if (s.book < 0) {
    errors.push({ code: "negative_book", message: `Book is negative (${formatCents(s.book)}). Something is wrong.` });
  }
  const seated = players.filter((p) => p.seated);
  if (seated.length) {
    warnings.push({
      code: "players_seated",
      message: `Still seated (no cash-out): ${seated.map((p) => nameOf(p.player_id)).join(", ")}`,
    });
  }
  const unpaid = players.filter((p) => p.unpaid_buyins > 0);
  if (unpaid.length) {
    warnings.push({
      code: "unpaid_buyins",
      message: `Unpaid buy-ins: ${unpaid.map((p) => `${nameOf(p.player_id)} ${formatCentsShort(p.unpaid_buyins)}`).join(", ")}`,
    });
  }
  const pending = players.filter((p) => p.total_cashout - p.payouts_sent > 0);
  if (pending.length) {
    warnings.push({
      code: "pending_payouts",
      message: `Payouts not yet sent: ${pending
        .map((p) => `${nameOf(p.player_id)} ${formatCentsShort(p.total_cashout - p.payouts_sent)}`)
        .join(", ")}`,
    });
  }
  return { canClose: errors.length === 0, errors, warnings };
}

export interface CashOutCheck {
  ok: boolean;
  book_after: Cents;
  exceeds_by: Cents;
  message: string | null;
}

/**
 * Would saving a cash-out of `amount` push the book below zero?
 * Pass `replacingId` when editing, so the row's current amount is not counted twice.
 */
export function cashOutCheck(data: NightData, amount: Cents, replacingId?: string): CashOutCheck {
  const others = { ...data, cashouts: data.cashouts.filter((c) => c.id !== replacingId) };
  const book_after = nightSummary(others).book - amount;
  if (book_after >= 0) return { ok: true, book_after, exceeds_by: 0, message: null };
  return {
    ok: false,
    book_after,
    exceeds_by: -book_after,
    message: `This cash-out exceeds chips on the books by ${formatCents(-book_after)}`,
  };
}

export function isLargeAmount(amount: Cents, threshold: Cents = DEFAULT_LARGE_AMOUNT_CENTS): boolean {
  return amount > threshold;
}
