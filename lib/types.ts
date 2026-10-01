// Row shapes mirror supabase/migrations/*. All money is integer cents.

export type Cents = number;

export type PaymentStatus = "paid" | "unpaid";
export type PaymentMethod = "payid" | "bank_transfer" | "cash" | "other";
export type PayoutStatus = "sent" | "pending";
export type ExpenseStatus = "paid" | "pending";
export type ExpenseCategory =
  | "food"
  | "dealer"
  | "referral_bonus"
  | "new_player_bonus"
  | "venue"
  | "misc";
export type NightStatus = "open" | "closed";

export interface Host {
  id: string;
  display_name: string;
}

export interface Player {
  id: string;
  name: string;
  phone: string | null;
  referred_by: string | null;
  notes: string | null;
  created_at: string;
  archived: boolean;
}

export interface Night {
  id: string;
  date: string; // YYYY-MM-DD, the Melbourne date the night started
  venue: string | null;
  status: NightStatus;
  opened_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  default_buyin_cents: Cents;
  notes: string | null;
  created_at: string;
}

interface EntryMeta {
  id: string;
  night_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BuyIn extends EntryMeta {
  player_id: string;
  amount_cents: Cents;
  /** null for comps: the house gave the chips, nothing is owed. */
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  is_comp: boolean;
}

export interface CashOut extends EntryMeta {
  player_id: string;
  amount_cents: Cents;
  payout_status: PayoutStatus;
  /** Set only when a host forced a cash-out that took the book negative. */
  override_reason: string | null;
}

export interface Expense extends EntryMeta {
  category: ExpenseCategory;
  amount_cents: Cents;
  note: string | null;
  paid_by: string | null;
  status: ExpenseStatus;
}

export interface AuditRow {
  id: number;
  table_name: string;
  row_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string | null;
  at: string;
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "Food",
  dealer: "Dealer",
  referral_bonus: "Referral bonus",
  new_player_bonus: "New player bonus",
  venue: "Venue",
  misc: "Misc",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  payid: "PayID",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};
