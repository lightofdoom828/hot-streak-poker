"use client";

import { useEffect, useState, type ReactNode } from "react";
import { friendlyError, getApi } from "@/lib/api";
import { NEGATIVE_BOOK_CHECKLIST, settlementText, validateClose } from "@/lib/calc";
import { formatNightDate, formatTime } from "@/lib/dates";
import { formatCents, formatCentsShort } from "@/lib/money";
import { EXPENSE_CATEGORY_LABELS, type AuditRow, type ExpenseCategory } from "@/lib/types";
import { useHost } from "../AuthGate";
import { Pnl } from "../bits";
import { useToast } from "../Toast";
import { Button, Field, inputClass, Sheet, WarnIcon } from "../ui";
import { useNightCtx } from "./context";

function Row({ label, value, strong, hint }: { label: string; value: ReactNode; strong?: boolean; hint?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "" : "text-muted"}>
        {label}
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </span>
      <span className="tabular whitespace-nowrap">{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-rail-border bg-rail-raised p-4">
      <h3 className="font-display mb-2 text-lg text-cream">{title}</h3>
      {children}
    </section>
  );
}

const categoryLabel = (k: string) => (k === "comps" ? "Comp chips (auto)" : (EXPENSE_CATEGORY_LABELS[k as ExpenseCategory] ?? k));

export function NegativeBookBanner() {
  const { summary } = useNightCtx();
  if (summary.book >= 0) return null;
  return (
    <div role="alert" className="rounded-2xl border-2 border-error bg-error/10 p-4">
      <p className="flex items-center gap-2 font-semibold text-error">
        <WarnIcon /> Book is negative ({formatCents(summary.book)}) — something is wrong
      </p>
      <p className="mt-2 text-sm">More chips came back than were issued. Check:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {NEGATIVE_BOOK_CHECKLIST.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">The night cannot be closed until the book is zero or positive.</p>
    </div>
  );
}

export function SummaryTab() {
  const { night, data, summary: s, playerRows, names, playerName, readOnly, apply } = useNightCtx();
  const { hostName } = useHost();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const validation = validateClose(data, names);
  const text = settlementText(night.date, data, names);
  const send = playerRows.filter((p) => p.settlement > 0).sort((a, b) => b.settlement - a.settlement);
  const owed = playerRows.filter((p) => p.settlement < 0).sort((a, b) => a.settlement - b.settlement);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: "Settlement copied — paste it in the group chat" });
    } catch {
      toast({ message: "Couldn't copy. Select the text below and copy it manually.", tone: "error" });
    }
  }

  async function act(fn: () => Promise<typeof night>, done: string) {
    setBusy(true);
    try {
      apply({ table: "nights", row: await fn() });
      toast({ message: done });
      setClosing(false);
      setReopening(false);
      setReason("");
    } catch (e) {
      toast({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="rounded-2xl border border-rail-border p-3 text-sm text-muted">
          Closed{night.closed_at ? ` at ${formatTime(night.closed_at)}` : ""} by {hostName(night.closed_by)}. This night is read-only.
        </p>
      )}

      <Card title="Profit & loss">
        <Row
          label={s.revenue_final ? "Revenue (the book)" : "Revenue (book incl. chips in play)"}
          value={formatCents(s.revenue)}
          hint={s.revenue_final ? "Chips issued − chips returned" : "Not final until every player has cashed out"}
        />
        {Object.entries(s.expenses_by_category).map(([k, v]) => (
          <Row key={k} label={categoryLabel(k)} value={`− ${formatCents(v)}`} />
        ))}
        <Row label="Total expenses" value={`− ${formatCents(s.total_expenses)}`} />
        <div className="my-1 border-t border-rail-border" />
        <Row label={s.revenue_final ? "Net P&L" : "Net P&L (estimate)"} value={<Pnl cents={s.net_pnl} />} strong />
      </Card>

      <Card title="Cash position">
        <Row label="Cash received" hint="Paid buy-ins (not comps)" value={formatCents(s.cash_received)} />
        <Row label="Cash sent" hint="Payouts marked sent" value={`− ${formatCents(s.cash_sent)}`} />
        <Row label="Expenses paid" value={`− ${formatCents(s.expenses_paid)}`} />
        <Row label="Cash position now" value={formatCents(s.cash_position)} strong />
        <div className="my-1 border-t border-rail-border" />
        <Row label="Receivables" hint="Unpaid buy-ins owed to us" value={`+ ${formatCents(s.receivables)}`} />
        <Row label="Payables" hint="Pending payouts and expenses we owe" value={`− ${formatCents(s.payables)}`} />
        <Row label="Projected final" hint="Once everything is settled — equals Net P&L" value={<Pnl cents={s.projected_final} />} strong />
      </Card>

      <Card title="Settlements">
        {send.length === 0 && owed.length === 0 ? (
          <p className="text-sm text-ok">All square — nobody owes anything.</p>
        ) : (
          <>
            {send.length > 0 && <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">We still owe</p>}
            {send.map((p) => (
              <Row key={p.player_id} label={`Send ${playerName(p.player_id)}`} value={<span className="text-gold">{formatCentsShort(p.settlement)}</span>} />
            ))}
            {owed.length > 0 && <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">Still owed to us</p>}
            {owed.map((p) => (
              <Row key={p.player_id} label={playerName(p.player_id)} value={<span className="text-pending">{formatCentsShort(-p.settlement)}</span>} />
            ))}
          </>
        )}
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-rail p-3 text-xs text-muted">{text}</pre>
        <Button className="mt-3 w-full" onClick={() => void copy()}>
          Copy settlement
        </Button>
      </Card>

      {readOnly ? (
        <Button className="w-full" onClick={() => setReopening(true)}>
          Reopen night
        </Button>
      ) : (
        <div>
          <Button variant="primary" className="min-h-14 w-full text-base" disabled={!validation.canClose} onClick={() => setClosing(true)}>
            Close night
          </Button>
          {!validation.canClose && (
            <p className="mt-2 flex items-center gap-2 text-sm text-error">
              <WarnIcon /> Can&apos;t close while the book is negative.
            </p>
          )}
        </div>
      )}

      <Sheet open={closing} onClose={() => setClosing(false)} title={`Close ${formatNightDate(night.date)}`}>
        <div className="space-y-4">
          {validation.warnings.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm">Check these before you lock the night:</p>
              {validation.warnings.map((w) => (
                <p key={w.code} className="flex items-start gap-2 rounded-xl border border-pending/50 p-3 text-sm text-pending">
                  <WarnIcon className="mt-0.5 shrink-0" />
                  {w.message}
                </p>
              ))}
              <p className="text-xs text-muted">You can still close. Outstanding amounts stay on the closing summary.</p>
            </div>
          ) : (
            <p className="text-sm text-ok">Everyone is cashed out and settled.</p>
          )}
          <div className="rounded-xl border border-rail-border bg-rail p-3">
            <Row label="Net P&L" value={<Pnl cents={s.net_pnl} />} strong />
          </div>
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => void act(() => getApi().closeNight(night.id), "Night closed")}>
            {validation.warnings.length ? "Close anyway" : "Close night"}
          </Button>
          <p className="text-center text-xs text-muted">Closed nights are read-only. Reopening is logged.</p>
        </div>
      </Sheet>

      <Sheet open={reopening} onClose={() => setReopening(false)} title="Reopen night">
        <div className="space-y-4">
          <Field label="Reason (logged in the audit trail)">
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Dan paid late" className={inputClass} />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            disabled={busy || !reason.trim()}
            onClick={() => void act(() => getApi().reopenNight(night.id, reason), "Night reopened")}
          >
            Reopen
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

// ---- Audit trail -----------------------------------------------------------------------
const TABLE_LABEL: Record<string, string> = { buyins: "Buy-in", cashouts: "Cash-out", expenses: "Expense", nights: "Night" };
const ACTION_LABEL: Record<string, string> = {
  insert: "added",
  update: "edited",
  soft_delete: "deleted",
  restore: "restored",
  close: "closed",
  reopen: "reopened",
};

function describe(a: AuditRow, playerName: (id: string) => string): string {
  const row = (a.after ?? a.before ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof row.player_id === "string") bits.push(playerName(row.player_id));
  if (typeof row.category === "string") bits.push(EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory] ?? row.category);
  if (a.table_name !== "nights" && typeof row.amount_cents === "number") {
    const before = a.before?.amount_cents;
    bits.push(
      a.action === "update" && typeof before === "number" && before !== row.amount_cents
        ? `${formatCents(before)} → ${formatCents(row.amount_cents)}`
        : formatCents(row.amount_cents),
    );
  }
  if (a.action === "update" && a.before) {
    for (const k of ["payment_status", "payout_status", "status"]) {
      if (a.before[k] !== row[k] && row[k] != null) bits.push(`${String(a.before[k] ?? "—")} → ${String(row[k])}`);
    }
  }
  if (typeof row.reopen_reason === "string") bits.push(`“${row.reopen_reason}”`);
  if (typeof row.override_reason === "string" && row.override_reason) bits.push(`override: “${row.override_reason}”`);
  return bits.join(" · ");
}

export function AuditTab() {
  const { night, data, playerName } = useNightCtx();
  const { hostName } = useHost();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Refetch whenever entries change, so the trail stays current while the tab is open.
  const version = `${night.status}:${data.buyins.length}:${data.cashouts.length}:${data.expenses.length}:${[
    ...data.buyins,
    ...data.cashouts,
    ...data.expenses,
  ]
    .map((r) => r.updated_at)
    .sort()
    .at(-1)}`;
  useEffect(() => {
    let alive = true;
    getApi()
      .listAudit(night.id)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [night.id, version]);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!rows) return <p className="py-8 text-center text-sm text-muted">Loading audit trail…</p>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted">Nothing logged yet.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((a) => (
        <li key={a.id} className="rounded-xl border border-rail-border bg-rail-raised p-3 text-sm">
          <p>
            <span className="font-semibold">{TABLE_LABEL[a.table_name] ?? a.table_name}</span> {ACTION_LABEL[a.action] ?? a.action}
            <span className="text-muted"> by {hostName(a.actor)}</span>
          </p>
          <p className="tabular text-muted">{describe(a, playerName)}</p>
          <p className="text-xs text-muted">
            {formatNightDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date(a.at)))} · {formatTime(a.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
