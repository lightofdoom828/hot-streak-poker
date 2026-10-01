import { describe, expect, it } from "vitest";
import {
  cashOutCheck,
  isLargeAmount,
  nightSummary,
  playerSummaries,
  settlementPreview,
  settlementText,
  validateClose,
  type NightData,
} from "./calc";
import type { BuyIn, CashOut, Expense, ExpenseCategory, PaymentStatus, PayoutStatus } from "./types";

// ---- tiny builders ---------------------------------------------------------
let seq = 0;
const meta = () => ({
  id: `id-${++seq}`,
  night_id: "n1",
  created_by: "host-a",
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
  deleted_at: null as string | null,
});
const buy = (player_id: string, dollars: number, status: PaymentStatus = "paid"): BuyIn => ({
  ...meta(),
  player_id,
  amount_cents: dollars * 100,
  payment_status: status,
  payment_method: status === "paid" ? "payid" : null,
  is_comp: false,
});
const comp = (player_id: string, dollars: number): BuyIn => ({
  ...meta(),
  player_id,
  amount_cents: dollars * 100,
  payment_status: null,
  payment_method: null,
  is_comp: true,
});
const out = (player_id: string, dollars: number, status: PayoutStatus = "pending"): CashOut => ({
  ...meta(),
  player_id,
  amount_cents: dollars * 100,
  payout_status: status,
  override_reason: null,
});
const exp = (category: ExpenseCategory, dollars: number, status: "paid" | "pending" = "paid"): Expense => ({
  ...meta(),
  category,
  amount_cents: dollars * 100,
  note: null,
  paid_by: "host-a",
  status,
});
const night = (p: Partial<NightData>): NightData => ({ buyins: [], cashouts: [], expenses: [], ...p });
const names = { sam: "Sam", priya: "Priya", dan: "Dan" };

// ---- Phase 1 acceptance tests 1-7 ------------------------------------------
describe("acceptance", () => {
  it("1. $200 paid in, $350 out -> result +$150, send $350", () => {
    const [sam] = playerSummaries(night({ buyins: [buy("sam", 200)], cashouts: [out("sam", 350)] }));
    expect(sam.player_result).toBe(15000);
    expect(sam.settlement).toBe(35000);
    expect(settlementPreview(sam, "Sam").headline).toBe("Send Sam $350");
  });

  it("2. $200 paid + $100 unpaid, $450 out -> send $350, unpaid netted off", () => {
    const [sam] = playerSummaries(
      night({ buyins: [buy("sam", 200), buy("sam", 100, "unpaid")], cashouts: [out("sam", 450)] }),
    );
    expect(sam.total_buyins).toBe(30000);
    expect(sam.unpaid_buyins).toBe(10000);
    expect(sam.player_result).toBe(15000);
    expect(sam.settlement).toBe(35000);
    const preview = settlementPreview(sam, "Sam");
    expect(preview.headline).toBe("Send Sam $350");
    expect(preview.detail).toBe("$100 unpaid netted off");
  });

  it("3. $300 unpaid, $0 out -> owes $300", () => {
    const [sam] = playerSummaries(night({ buyins: [buy("sam", 300, "unpaid")], cashouts: [out("sam", 0)] }));
    expect(sam.settlement).toBe(-30000);
    expect(sam.player_result).toBe(-30000);
    expect(settlementPreview(sam, "Sam").headline).toBe("Sam owes $300");
  });

  it("4. comp $50 -> chips issued +$50, comps expense $50, cash received unchanged", () => {
    const base = night({ buyins: [buy("sam", 200)] });
    const withComp = night({ buyins: [buy("sam", 200), comp("priya", 50)] });
    const a = nightSummary(base);
    const b = nightSummary(withComp);
    expect(b.chips_issued - a.chips_issued).toBe(5000);
    expect(b.comp_cost).toBe(5000);
    expect(b.expenses_by_category.comps).toBe(5000);
    expect(b.total_expenses - a.total_expenses).toBe(5000);
    expect(b.cash_received).toBe(a.cash_received);
    // a comp is never "owed" by the player
    const priya = playerSummaries(withComp).find((p) => p.player_id === "priya")!;
    expect(priya.unpaid_buyins).toBe(0);
    expect(priya.comp_buyins).toBe(5000);
  });

  it("5. $2,000 in, $1,900 out, $60 food -> revenue $100, net $40", () => {
    const s = nightSummary(
      night({
        buyins: [buy("sam", 1000), buy("priya", 600), buy("dan", 400)],
        cashouts: [out("sam", 1200, "sent"), out("priya", 500, "sent"), out("dan", 200, "sent")],
        expenses: [exp("food", 60)],
      }),
    );
    expect(s.chips_issued).toBe(200000);
    expect(s.chips_returned).toBe(190000);
    expect(s.book).toBe(10000);
    expect(s.revenue).toBe(10000);
    expect(s.revenue_final).toBe(true);
    expect(s.total_expenses).toBe(6000);
    expect(s.net_pnl).toBe(4000);
  });

  it("6. cash-outs exceed buy-ins -> book negative -> close blocked", () => {
    const data = night({ buyins: [buy("sam", 200)], cashouts: [out("sam", 250)] });
    const s = nightSummary(data);
    expect(s.book).toBe(-5000);
    const v = validateClose(data);
    expect(v.canClose).toBe(false);
    expect(v.errors.map((e) => e.code)).toContain("negative_book");
  });

  it("7. closed night: projected_final === NET_PNL across paid/unpaid/sent/pending", () => {
    const data = night({
      buyins: [
        buy("sam", 200),
        buy("sam", 100, "unpaid"),
        buy("priya", 300, "unpaid"),
        buy("dan", 500),
        comp("dan", 50),
      ],
      cashouts: [out("sam", 450), out("priya", 0), out("dan", 520, "sent")],
      expenses: [exp("food", 60), exp("dealer", 100, "pending"), exp("misc", 15)],
    });
    const s = nightSummary(data);
    expect(s.all_cashed_out).toBe(true);
    expect(s.projected_final).toBe(s.net_pnl);
    // spot-check the parts so a symmetric bug cannot hide
    expect(s.cash_received).toBe(70000); // 200 + 500 paid, non-comp
    expect(s.cash_sent).toBe(52000);
    expect(s.expenses_paid).toBe(7500);
    expect(s.receivables).toBe(40000);
    expect(s.payables).toBe(45000 + 10000);
    expect(s.book).toBe(115000 - 97000);
    expect(s.net_pnl).toBe(18000 - 5000 - 17500);
  });
});

// ---- invariant beyond the single fixture -----------------------------------
describe("projected_final === net_pnl invariant", () => {
  it("holds for many random closed nights", () => {
    let rnd = 42;
    const r = (n: number) => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31), rnd % n);
    for (let t = 0; t < 300; t++) {
      const players = ["a", "b", "c", "d", "e"].slice(0, 1 + r(5));
      const buyins: BuyIn[] = [];
      const cashouts: CashOut[] = [];
      for (const p of players) {
        for (let k = 0; k <= r(3); k++) {
          const cents = 100 * (1 + r(500)) + r(100);
          buyins.push(r(6) === 0 ? { ...comp(p, 0), amount_cents: cents } : { ...buy(p, 0, r(2) ? "paid" : "unpaid"), amount_cents: cents });
        }
        cashouts.push({ ...out(p, 0, r(2) ? "sent" : "pending"), amount_cents: 100 * r(600) + r(100) });
      }
      const expenses = Array.from({ length: r(4) }, () => ({
        ...exp("misc", 0, r(2) ? "paid" : "pending"),
        amount_cents: 1 + r(20000),
      }));
      const s = nightSummary({ buyins, cashouts, expenses });
      expect(s.projected_final).toBe(s.net_pnl);
    }
  });
});

// ---- per-player details -----------------------------------------------------
describe("playerSummaries", () => {
  it("counts buy-ins, marks seated until a cash-out exists, ignores soft-deleted rows", () => {
    const deleted = { ...buy("sam", 999), deleted_at: "2026-10-01T10:00:00Z" };
    const data = night({ buyins: [buy("sam", 200), buy("sam", 100), deleted, buy("dan", 200)], cashouts: [out("dan", 100)] });
    const rows = playerSummaries(data);
    const sam = rows.find((p) => p.player_id === "sam")!;
    const dan = rows.find((p) => p.player_id === "dan")!;
    expect(sam.buyin_count).toBe(2);
    expect(sam.total_buyins).toBe(30000);
    expect(sam.seated).toBe(true);
    expect(dan.seated).toBe(false);
  });

  it("partial cash-outs sum, and a payout already sent is not owed twice", () => {
    const [sam] = playerSummaries(
      night({ buyins: [buy("sam", 200)], cashouts: [out("sam", 100, "sent"), out("sam", 250)] }),
    );
    expect(sam.total_cashout).toBe(35000);
    expect(sam.payouts_sent).toBe(10000);
    expect(sam.settlement).toBe(25000);
  });

  it("a seated player who has not paid shows what they owe", () => {
    const [sam] = playerSummaries(night({ buyins: [buy("sam", 200, "unpaid")] }));
    expect(sam.seated).toBe(true);
    expect(sam.settlement).toBe(-20000);
  });
});

// ---- night-level -------------------------------------------------------------
describe("nightSummary", () => {
  it("while players are seated the book includes chips in play and revenue is not final", () => {
    const s = nightSummary(night({ buyins: [buy("sam", 200), buy("dan", 200)], cashouts: [out("dan", 150)] }));
    expect(s.book).toBe(25000);
    expect(s.players_seated).toBe(1);
    expect(s.players_cashed_out).toBe(1);
    expect(s.revenue_final).toBe(false);
  });

  it("groups expenses by category and adds the derived comps line", () => {
    const s = nightSummary(
      night({ buyins: [comp("sam", 25), comp("dan", 25)], expenses: [exp("food", 30), exp("food", 20), exp("dealer", 100)] }),
    );
    expect(s.expenses_by_category).toEqual({ comps: 5000, food: 5000, dealer: 10000 });
    expect(s.manual_expenses).toBe(15000);
  });

  it("an empty night is all zeros and square", () => {
    const s = nightSummary(night({}));
    expect(s.book).toBe(0);
    expect(s.net_pnl).toBe(0);
    expect(s.projected_final).toBe(0);
    expect(s.all_cashed_out).toBe(false);
  });
});

// ---- validation ----------------------------------------------------------------
describe("cashOutCheck", () => {
  it("blocks a cash-out bigger than the chips on the books and says by how much", () => {
    const data = night({ buyins: [buy("sam", 200), buy("dan", 100)], cashouts: [out("dan", 50)] });
    expect(cashOutCheck(data, 25000).ok).toBe(true);
    const bad = cashOutCheck(data, 30000);
    expect(bad.ok).toBe(false);
    expect(bad.exceeds_by).toBe(5000);
    expect(bad.message).toBe("This cash-out exceeds chips on the books by $50.00");
  });

  it("editing an existing cash-out excludes its old amount", () => {
    const existing = out("sam", 200);
    const data = night({ buyins: [buy("sam", 200)], cashouts: [existing] });
    expect(cashOutCheck(data, 200_00, existing.id).ok).toBe(true);
    expect(cashOutCheck(data, 200_01, existing.id).ok).toBe(false);
  });
});

describe("validateClose", () => {
  it("warns (does not block) on seated players, unpaid buy-ins and pending payouts", () => {
    const data = night({
      buyins: [buy("sam", 200, "unpaid"), buy("dan", 200)],
      cashouts: [out("dan", 150, "pending")],
    });
    const v = validateClose(data, names);
    expect(v.canClose).toBe(true);
    expect(v.errors).toEqual([]);
    const codes = v.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["players_seated", "unpaid_buyins", "pending_payouts"]));
    expect(v.warnings.find((w) => w.code === "players_seated")!.message).toContain("Sam");
  });

  it("a clean night has no errors or warnings", () => {
    const v = validateClose(night({ buyins: [buy("sam", 200)], cashouts: [out("sam", 150, "sent")] }));
    expect(v).toEqual({ canClose: true, errors: [], warnings: [] });
  });
});

describe("isLargeAmount", () => {
  it("flags anything over the threshold (default $2,000)", () => {
    expect(isLargeAmount(200000)).toBe(false);
    expect(isLargeAmount(200001)).toBe(true);
    expect(isLargeAmount(50001, 50000)).toBe(true);
  });
});

// ---- group-chat text -------------------------------------------------------------
describe("settlementText", () => {
  it("matches the spec format", () => {
    const data = night({
      buyins: [buy("sam", 200), buy("sam", 100, "unpaid"), buy("priya", 100), buy("dan", 200, "unpaid")],
      cashouts: [out("sam", 450), out("priya", 120), out("dan", 0)],
    });
    expect(settlementText("2026-10-01", data, names)).toBe(
      ["HOT STREAK POKER — Thu 1 Oct", "Settlements", "Send: Sam $350, Priya $120", "Owed to us: Dan $200"].join("\n"),
    );
  });

  it("says all square when nothing is outstanding", () => {
    const data = night({ buyins: [buy("sam", 200)], cashouts: [out("sam", 200, "sent")] });
    expect(settlementText("2026-10-02", data, names)).toBe("HOT STREAK POKER — Fri 2 Oct\nSettlements\nAll square");
  });
});
