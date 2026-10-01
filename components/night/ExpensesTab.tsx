"use client";

import { useState } from "react";
import { isLargeAmount } from "@/lib/calc";
import { formatTime } from "@/lib/dates";
import { formatCents, formatCentsShort, parseMoney } from "@/lib/money";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type ExpenseStatus } from "@/lib/types";
import { useHost } from "../AuthGate";
import { MoneyInput } from "../bits";
import { Button, CheckIcon, ClockIcon, Field, inputClass, Pill, Segmented, Sheet, WarnIcon } from "../ui";
import { LARGE_AMOUNT_CENTS, useNightCtx } from "./context";

const QUICK: ExpenseCategory[] = ["food", "dealer", "referral_bonus", "new_player_bonus", "venue", "misc"];

function ExpenseForm({ category, onDone }: { category: ExpenseCategory; onDone: () => void }) {
  const { addExpense } = useNightCtx();
  const { host, hosts } = useHost();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paidBy, setPaidBy] = useState(host.id);
  const [status, setStatus] = useState<ExpenseStatus>("paid");
  const [confirmedLarge, setConfirmedLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  const large = !!cents && isLargeAmount(cents, LARGE_AMOUNT_CENTS);

  async function save() {
    if (!cents) return;
    if (large && !confirmedLarge) return setConfirmedLarge(true);
    setBusy(true);
    const saved = await addExpense(
      { category, amount_cents: cents, note: note.trim() || null, paid_by: paidBy, status },
      { message: `${EXPENSE_CATEGORY_LABELS[category]} ${formatCentsShort(cents)} added` },
    );
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <div className="space-y-4">
      <MoneyInput
        label="Expense amount"
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setConfirmedLarge(false);
        }}
        autoFocus
      />
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. pizza" className={inputClass} />
      </Field>
      <Field label="Paid by">
        <Segmented label="Paid by" value={paidBy} onChange={setPaidBy} options={hosts.map((h) => ({ value: h.id, label: h.display_name }))} />
      </Field>
      <Segmented
        label="Expense status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "paid", label: "Paid" },
          { value: "pending", label: "Still to pay" },
        ]}
      />
      {large && confirmedLarge && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-pending/50 p-3 text-sm text-pending">
          <WarnIcon className="mt-0.5 shrink-0" />
          {formatCents(cents!)} is a large expense. Check for an extra zero, then tap again to confirm.
        </p>
      )}
      <Button variant="primary" className="w-full" disabled={!cents || busy} onClick={() => void save()}>
        {large && confirmedLarge ? `Yes, add ${formatCents(cents!)}` : "Add expense"}
      </Button>
    </div>
  );
}

export function ExpensesTab() {
  const { data, summary, readOnly, patchExpense } = useNightCtx();
  const { hostName } = useHost();
  const [adding, setAdding] = useState<ExpenseCategory | null>(null);
  const expenses = data.expenses.filter((e) => !e.deleted_at);

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Quick add</p>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((c) => (
              <Button key={c} onClick={() => setAdding(c)} className="rounded-full">
                + {EXPENSE_CATEGORY_LABELS[c]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {summary.comp_cost > 0 && (
          <li className="flex items-center gap-3 rounded-2xl border border-dashed border-rail-border p-3">
            <div className="flex-1">
              <p className="font-semibold">Comp chips</p>
              <p className="text-xs text-muted">Automatic — the value of comp buy-ins given tonight</p>
            </div>
            <span className="tabular font-semibold">{formatCents(summary.comp_cost)}</span>
          </li>
        )}
        {expenses.map((e) => (
          <li key={e.id} className="rounded-2xl border border-rail-border bg-rail-raised p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {EXPENSE_CATEGORY_LABELS[e.category]}
                  {e.note && <span className="font-normal text-muted"> · {e.note}</span>}
                </p>
                <p className="text-xs text-muted">
                  Paid by {hostName(e.paid_by)} · added by {hostName(e.created_by)} at {formatTime(e.created_at)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="tabular font-semibold">{formatCents(e.amount_cents)}</span>
                {e.status === "paid" ? (
                  <Pill tone="ok">
                    <CheckIcon /> Paid
                  </Pill>
                ) : (
                  <Pill tone="pending">
                    <ClockIcon /> Pending
                  </Pill>
                )}
              </div>
            </div>
            {!readOnly && (
              <div className="mt-2 flex gap-2">
                <Button
                  onClick={() =>
                    void patchExpense(
                      e,
                      { status: e.status === "paid" ? "pending" : "paid" },
                      { message: e.status === "paid" ? "Marked pending" : "Marked paid" },
                    )
                  }
                >
                  {e.status === "paid" ? "Mark pending" : "Mark paid"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void patchExpense(e, { deleted_at: new Date().toISOString() }, { message: "Expense deleted" })}
                >
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {expenses.length === 0 && summary.comp_cost === 0 && (
        <div className="felt rounded-[1.75rem] p-8 text-center">
          <p className="font-display text-2xl">No expenses yet</p>
        </div>
      )}

      <div className="flex justify-between border-t border-rail-border pt-3 text-sm">
        <span className="text-muted">Total expenses (incl. comps)</span>
        <span className="tabular font-semibold">{formatCents(summary.total_expenses)}</span>
      </div>

      <Sheet open={adding !== null} onClose={() => setAdding(null)} title={adding ? EXPENSE_CATEGORY_LABELS[adding] : "Expense"}>
        {adding && <ExpenseForm category={adding} onDone={() => setAdding(null)} />}
      </Sheet>
    </div>
  );
}
