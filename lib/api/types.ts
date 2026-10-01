import type { NightData } from "../calc";
import type {
  AuditRow,
  BuyIn,
  CashOut,
  Cents,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  Host,
  Night,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  Player,
} from "../types";

export interface Session {
  userId: string;
  email: string;
}

export type SyncStatus = "connecting" | "synced" | "reconnecting";

export type ChangeEvent =
  | { table: "nights"; row: Night }
  | { table: "buyins"; row: BuyIn }
  | { table: "cashouts"; row: CashOut }
  | { table: "expenses"; row: Expense }
  | { table: "players"; row: Player };

export interface NewNight {
  date: string;
  venue: string | null;
  default_buyin_cents: Cents;
}

export interface NewBuyIn {
  id: string;
  night_id: string;
  player_id: string;
  amount_cents: Cents;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  is_comp: boolean;
}
export type BuyInPatch = Partial<Pick<BuyIn, "amount_cents" | "payment_status" | "payment_method" | "is_comp" | "deleted_at">>;

export interface NewCashOut {
  id: string;
  night_id: string;
  player_id: string;
  amount_cents: Cents;
  payout_status: PayoutStatus;
  override_reason: string | null;
}
export type CashOutPatch = Partial<Pick<CashOut, "amount_cents" | "payout_status" | "override_reason" | "deleted_at">>;

export interface NewExpense {
  id: string;
  night_id: string;
  category: ExpenseCategory;
  amount_cents: Cents;
  note: string | null;
  paid_by: string | null;
  status: ExpenseStatus;
}
export type ExpensePatch = Partial<Pick<Expense, "category" | "amount_cents" | "note" | "paid_by" | "status" | "deleted_at">>;

export interface NewPlayer {
  name: string;
  referred_by: string | null;
}

export interface Api {
  mode: "supabase" | "demo";

  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  sendMagicLink(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  /** Null when signed in but not a host (should not happen: the allowlist blocks sign-up). */
  currentHost(): Promise<Host | null>;

  listHosts(): Promise<Host[]>;
  listPlayers(): Promise<Player[]>;
  createPlayer(p: NewPlayer): Promise<Player>;

  listNights(): Promise<{ nights: Night[]; data: Record<string, NightData> }>;
  getNight(id: string): Promise<Night | null>;
  getNightData(id: string): Promise<NightData>;
  createNight(n: NewNight): Promise<Night>;
  closeNight(id: string): Promise<Night>;
  reopenNight(id: string, reason: string): Promise<Night>;
  listAudit(nightId: string): Promise<AuditRow[]>;

  insertBuyIn(row: NewBuyIn): Promise<BuyIn>;
  updateBuyIn(id: string, patch: BuyInPatch): Promise<BuyIn>;
  insertCashOut(row: NewCashOut): Promise<CashOut>;
  updateCashOut(id: string, patch: CashOutPatch): Promise<CashOut>;
  insertExpense(row: NewExpense): Promise<Expense>;
  updateExpense(id: string, patch: ExpensePatch): Promise<Expense>;

  /** Live changes. nightId null = every night (home list). Returns unsubscribe. */
  subscribe(nightId: string | null, onChange: (e: ChangeEvent) => void, onStatus: (s: SyncStatus) => void): () => void;
}

/** Turns database/trigger errors into something a host can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const cents = /exceeds chips on the books by (\d+) cents/.exec(msg);
  if (cents) {
    const n = Number(cents[1]);
    return `This cash-out exceeds chips on the books by $${(n / 100).toFixed(2)}`;
  }
  if (/closed and read-only/i.test(msg) || /row-level security/i.test(msg)) return "This night is closed (read-only). Reopen it to make changes.";
  if (/Book is negative/i.test(msg)) return "Book is negative — fix the entries before closing.";
  if (/players_name_unique|duplicate key/i.test(msg)) return "A player with that name already exists.";
  if (/not on the Hot Streak host list|Database error saving new user|Signups not allowed/i.test(msg))
    return "That email isn't on the host list.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "No connection — check your signal and try again.";
  return msg || "Something went wrong.";
}
