"use client";

import { useMemo, useState } from "react";
import { friendlyError, getApi } from "@/lib/api";
import { cashOutCheck, isLargeAmount, playerSummaries, settlementPreview, type PlayerSummary } from "@/lib/calc";
import { formatTime } from "@/lib/dates";
import { centsToInput, formatCents, formatCentsShort, parseMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type BuyIn, type CashOut, type PaymentMethod, type PaymentStatus, type PayoutStatus, type Player } from "@/lib/types";
import { useHost } from "../AuthGate";
import { MoneyInput } from "../bits";
import { ChipBadge } from "../ChipBadge";
import { useToast } from "../Toast";
import { Button, CheckIcon, ClockIcon, Field, inputClass, Pill, Segmented, WarnIcon } from "../ui";
import { LARGE_AMOUNT_CENTS, useNightCtx } from "./context";

const METHODS = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

function LargeAmountWarning({ cents }: { cents: number }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-pending/50 p-3 text-sm text-pending">
      <WarnIcon className="mt-0.5 shrink-0" />
      <span>
        {formatCents(cents)} is over {formatCentsShort(LARGE_AMOUNT_CENTS)}. Check for an extra zero, then tap again to confirm.
      </span>
    </p>
  );
}

export function SettlementLine({ p, name }: { p: PlayerSummary; name: string }) {
  const s = settlementPreview(p, name);
  const tone = s.kind === "send" ? "text-gold" : s.kind === "owes" ? "text-pending" : "text-ok";
  return (
    <div className="rounded-xl border border-rail-border bg-rail p-3">
      <p className="text-xs uppercase tracking-wide text-muted">Settlement</p>
      <p className={`font-display text-2xl ${tone}`}>{s.headline}</p>
      {s.detail && <p className="text-sm text-muted">{s.detail}</p>}
    </div>
  );
}

// ---- Buy-in -------------------------------------------------------------------------
export function BuyInForm({ player, onDone }: { player: Player; onDone: () => void }) {
  const { night, addBuyIn } = useNightCtx();
  const [amount, setAmount] = useState(centsToInput(night.default_buyin_cents));
  const [status, setStatus] = useState<PaymentStatus>("unpaid");
  const [method, setMethod] = useState<PaymentMethod>("payid");
  const [comp, setComp] = useState(false);
  const [confirmedLarge, setConfirmedLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  const large = !!cents && isLargeAmount(cents, LARGE_AMOUNT_CENTS);

  async function save() {
    if (!cents) return;
    if (large && !confirmedLarge) return setConfirmedLarge(true);
    setBusy(true);
    const saved = await addBuyIn(
      {
        player_id: player.id,
        amount_cents: cents,
        is_comp: comp,
        payment_status: comp ? null : status,
        payment_method: comp || status === "unpaid" ? null : method,
      },
      { message: `${comp ? "Comp" : "Buy-in"} ${formatCentsShort(cents)} for ${player.name}${comp ? "" : ` (${status})`}` },
    );
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        For <span className="font-semibold text-text">{player.name}</span>
      </p>
      <MoneyInput
        label="Buy-in amount"
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setConfirmedLarge(false);
        }}
        autoFocus
      />
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-rail-border bg-rail px-3">
        <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} className="size-5 accent-[var(--gold)]" />
        <span className="text-sm">
          Comp <span className="text-muted">— house gives the chips free (bonus / promo). Counts as an expense.</span>
        </span>
      </label>
      {!comp && (
        <>
          <Segmented
            label="Payment status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "unpaid", label: "Unpaid" },
              { value: "paid", label: "Paid" },
            ]}
          />
          {status === "paid" && <Segmented label="Payment method" value={method} onChange={setMethod} options={METHODS} />}
        </>
      )}
      {large && confirmedLarge && <LargeAmountWarning cents={cents!} />}
      <Button variant="primary" className="w-full" disabled={!cents || busy} onClick={() => void save()}>
        {large && confirmedLarge ? `Yes, add ${formatCents(cents!)}` : `Add ${comp ? "comp" : "buy-in"}`}
      </Button>
    </div>
  );
}

// ---- Cash-out -----------------------------------------------------------------------
export function CashOutForm({ player, editing, onDone }: { player: Player; editing?: CashOut; onDone: () => void }) {
  const { data, night, addCashOut, patchCashOut } = useNightCtx();
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amount_cents) : "");
  const [status, setStatus] = useState<PayoutStatus>(editing?.payout_status ?? "pending");
  const [reason, setReason] = useState(editing?.override_reason ?? "");
  const [confirmedLarge, setConfirmedLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  const large = cents !== null && isLargeAmount(cents, LARGE_AMOUNT_CENTS);

  // What the player's settlement becomes if this cash-out is saved.
  const preview = useMemo(() => {
    if (cents === null) return null;
    const draft: CashOut = {
      id: editing?.id ?? "draft",
      night_id: night.id,
      player_id: player.id,
      amount_cents: cents,
      payout_status: status,
      override_reason: null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: "",
      deleted_at: null,
    };
    const cashouts = [...data.cashouts.filter((c) => c.id !== draft.id), draft];
    return playerSummaries({ ...data, cashouts }).find((p) => p.player_id === player.id) ?? null;
  }, [cents, data, editing?.id, night.id, player.id, status]);

  const check = cents === null ? null : cashOutCheck(data, cents, editing?.id);
  const blocked = !!check && !check.ok && !reason.trim();

  async function save() {
    if (cents === null || blocked) return;
    if (large && !confirmedLarge) return setConfirmedLarge(true);
    setBusy(true);
    const override_reason = check && !check.ok ? reason.trim() : null;
    const message = `Cash-out ${formatCentsShort(cents)} for ${player.name}`;
    const ok = editing
      ? await patchCashOut(editing, { amount_cents: cents, payout_status: status, override_reason }, { message })
      : !!(await addCashOut({ player_id: player.id, amount_cents: cents, payout_status: status, override_reason }, { message }));
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Chip value returned by <span className="font-semibold text-text">{player.name}</span>
      </p>
      <MoneyInput
        label="Cash-out amount"
        value={amount}
        onChange={(v) => {
          setAmount(v);
          setConfirmedLarge(false);
        }}
        autoFocus
      />
      {preview && <SettlementLine p={preview} name={player.name} />}
      <Segmented
        label="Payout status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "pending", label: "Payout pending" },
          { value: "sent", label: "Payout sent" },
        ]}
      />
      {check && !check.ok && (
        <div role="alert" className="space-y-3 rounded-xl border border-error/60 p-3">
          <p className="flex items-start gap-2 text-sm font-medium text-error">
            <WarnIcon className="mt-0.5 shrink-0" />
            {check.message}
          </p>
          <Field label="Override reason (logged)" hint="Only override if you are sure. The book will be negative until it is fixed.">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this correct?" className={inputClass} />
          </Field>
        </div>
      )}
      {large && confirmedLarge && <LargeAmountWarning cents={cents!} />}
      <Button
        variant={check && !check.ok ? "danger" : "primary"}
        className="w-full"
        disabled={cents === null || blocked || busy}
        onClick={() => void save()}
      >
        {check && !check.ok
          ? "Override and save"
          : large && confirmedLarge
            ? `Yes, cash out ${formatCents(cents!)}`
            : editing
              ? "Save cash-out"
              : "Cash out"}
      </Button>
    </div>
  );
}

// ---- Settle / mark paid ------------------------------------------------------------
export function SettleForm({ player, p, onDone }: { player: Player; p: PlayerSummary; onDone: () => void }) {
  const { data, patchBuyIn, patchCashOut, refresh } = useNightCtx();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("payid");
  const [busy, setBusy] = useState(false);
  const unpaid = data.buyins.filter((b) => b.player_id === player.id && !b.deleted_at && !b.is_comp && b.payment_status === "unpaid");
  const pending = data.cashouts.filter((c) => c.player_id === player.id && !c.deleted_at && c.payout_status === "pending");
  const netting = unpaid.length > 0 && pending.length > 0;

  async function settle() {
    setBusy(true);
    const results = await Promise.all([
      // When an unpaid buy-in is netted against the payout, no separate payment was made.
      ...unpaid.map((b) => patchBuyIn(b, { payment_status: "paid", payment_method: netting ? "other" : method })),
      ...pending.map((c) => patchCashOut(c, { payout_status: "sent" })),
    ]);
    setBusy(false);
    if (results.every(Boolean)) {
      toast({
        message: `${player.name} settled`,
        action: {
          label: "Undo",
          onClick: () =>
            void Promise.all([
              ...unpaid.map((b) => getApi().updateBuyIn(b.id, { payment_status: "unpaid", payment_method: null })),
              ...pending.map((c) => getApi().updateCashOut(c.id, { payout_status: "pending" })),
            ])
              .catch((e) => toast({ message: friendlyError(e), tone: "error" }))
              .finally(() => void refresh()),
        },
      });
      onDone();
    }
  }

  return (
    <div className="space-y-4">
      <SettlementLine p={p} name={player.name} />
      <ul className="space-y-1 text-sm">
        {unpaid.map((b) => (
          <li key={b.id} className="flex justify-between">
            <span className="text-muted">Unpaid buy-in → paid</span>
            <span className="tabular">{formatCents(b.amount_cents)}</span>
          </li>
        ))}
        {pending.map((c) => (
          <li key={c.id} className="flex justify-between">
            <span className="text-muted">Pending payout → sent</span>
            <span className="tabular">{formatCents(c.amount_cents)}</span>
          </li>
        ))}
      </ul>
      {unpaid.length > 0 && !netting && (
        <Field label="How did they pay?">
          <Segmented label="Payment method" value={method} onChange={setMethod} options={METHODS} />
        </Field>
      )}
      {netting && <p className="text-sm text-muted">The unpaid buy-in is netted off the payout, so only the settlement amount changes hands.</p>}
      <Button variant="primary" className="w-full" disabled={busy} onClick={() => void settle()}>
        {p.settlement > 0
          ? `I've sent ${formatCentsShort(p.settlement)} — mark settled`
          : p.settlement < 0
            ? `Received ${formatCentsShort(-p.settlement)} — mark paid`
            : "Mark settled"}
      </Button>
    </div>
  );
}

// ---- Player detail: every entry, edit / soft delete, who entered it ---------------------
function EntryMeta({ by, at }: { by: string | null; at: string }) {
  const { hostName } = useHost();
  return (
    <p className="text-xs text-muted">
      Added by {hostName(by)} at {formatTime(at)}
    </p>
  );
}

function AmountEditor({ cents, onSave, onCancel }: { cents: number; onSave: (c: number) => void; onCancel: () => void }) {
  const [v, setV] = useState(centsToInput(cents));
  const parsed = parseMoney(v);
  return (
    <div className="mt-2 flex gap-2">
      <div className="flex-1">
        <MoneyInput label="New amount" value={v} onChange={setV} large={false} autoFocus />
      </div>
      <Button variant="primary" disabled={!parsed} onClick={() => parsed && onSave(parsed)}>
        Save
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export function PlayerDetail({ player, p, onEditCashOut }: { player: Player; p: PlayerSummary; onEditCashOut: (c: CashOut) => void }) {
  const { data, readOnly, patchBuyIn, patchCashOut } = useNightCtx();
  const [editing, setEditing] = useState<string | null>(null);
  const buyins = data.buyins.filter((b) => b.player_id === player.id && !b.deleted_at);
  const cashouts = data.cashouts.filter((c) => c.player_id === player.id && !c.deleted_at);
  const now = () => new Date().toISOString();

  const buyinStatus = (b: BuyIn) =>
    b.is_comp ? (
      <Pill tone="gold">Comp</Pill>
    ) : b.payment_status === "paid" ? (
      <Pill tone="ok">
        <CheckIcon /> Paid{b.payment_method ? ` · ${PAYMENT_METHOD_LABELS[b.payment_method]}` : ""}
      </Pill>
    ) : (
      <Pill tone="pending">
        <ClockIcon /> Unpaid
      </Pill>
    );

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Total in", formatCents(p.total_buyins)],
          ["Cashed out", formatCents(p.total_cashout)],
          ["Result", `${p.player_result > 0 ? "+" : ""}${formatCents(p.player_result)}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-rail-border bg-rail p-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="tabular text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <SettlementLine p={p} name={player.name} />

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Buy-ins</h3>
        <ul className="space-y-2">
          {buyins.map((b) => (
            <li key={b.id} className="rounded-xl border border-rail-border bg-rail p-3">
              <div className="flex items-center gap-2">
                <ChipBadge label="$" size={28} />
                <span className="tabular flex-1 font-semibold">{formatCents(b.amount_cents)}</span>
                {buyinStatus(b)}
              </div>
              <EntryMeta by={b.created_by} at={b.created_at} />
              {!readOnly &&
                (editing === b.id ? (
                  <AmountEditor
                    cents={b.amount_cents}
                    onCancel={() => setEditing(null)}
                    onSave={(c) => {
                      setEditing(null);
                      void patchBuyIn(b, { amount_cents: c }, { message: `Buy-in changed to ${formatCentsShort(c)}` });
                    }}
                  />
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!b.is_comp && (
                      <Button
                        onClick={() =>
                          void patchBuyIn(
                            b,
                            b.payment_status === "paid"
                              ? { payment_status: "unpaid", payment_method: null }
                              : { payment_status: "paid", payment_method: "payid" },
                            { message: b.payment_status === "paid" ? "Marked unpaid" : "Marked paid" },
                          )
                        }
                      >
                        {b.payment_status === "paid" ? "Mark unpaid" : "Mark paid"}
                      </Button>
                    )}
                    <Button onClick={() => setEditing(b.id)}>Edit amount</Button>
                    <Button variant="ghost" onClick={() => void patchBuyIn(b, { deleted_at: now() }, { message: "Buy-in deleted" })}>
                      Delete
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Cash-outs</h3>
        {cashouts.length === 0 ? (
          <p className="text-sm text-muted">Still seated — no cash-out yet.</p>
        ) : (
          <ul className="space-y-2">
            {cashouts.map((c) => (
              <li key={c.id} className="rounded-xl border border-rail-border bg-rail p-3">
                <div className="flex items-center gap-2">
                  <ChipBadge label="$" variant="cashout" size={28} />
                  <span className="tabular flex-1 font-semibold">{formatCents(c.amount_cents)}</span>
                  {c.payout_status === "sent" ? (
                    <Pill tone="ok">
                      <CheckIcon /> Sent
                    </Pill>
                  ) : (
                    <Pill tone="pending">
                      <ClockIcon /> Pending
                    </Pill>
                  )}
                </div>
                <EntryMeta by={c.created_by} at={c.created_at} />
                {c.override_reason && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-error">
                    <WarnIcon className="shrink-0" /> Override: {c.override_reason}
                  </p>
                )}
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        void patchCashOut(
                          c,
                          { payout_status: c.payout_status === "sent" ? "pending" : "sent" },
                          { message: c.payout_status === "sent" ? "Marked pending" : "Marked sent" },
                        )
                      }
                    >
                      {c.payout_status === "sent" ? "Mark pending" : "Mark sent"}
                    </Button>
                    <Button onClick={() => onEditCashOut(c)}>Edit</Button>
                    <Button variant="ghost" onClick={() => void patchCashOut(c, { deleted_at: now() }, { message: "Cash-out deleted" })}>
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---- Add player: search the roster or create ------------------------------------------
export function AddPlayerForm({ onPick }: { onPick: (p: Player) => void }) {
  const { players, playerRows, apply } = useNightCtx();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [busy, setBusy] = useState(false);
  const inNight = new Set(playerRows.map((r) => r.player_id));
  const query = q.trim().toLowerCase();
  const matches = players.filter((p) => !inNight.has(p.id) && p.name.toLowerCase().includes(query));
  const exact = players.find((p) => p.name.trim().toLowerCase() === query);

  async function create() {
    setBusy(true);
    try {
      const p = await getApi().createPlayer({ name: q.trim(), referred_by: referredBy || null });
      apply({ table: "players", row: p });
      onPick(p);
    } catch (e) {
      toast({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Player name">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new name" className={inputClass} />
      </Field>
      {matches.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-white/5"
              >
                <ChipBadge label={p.name.slice(0, 1).toUpperCase()} size={28} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {exact && inNight.has(exact.id) && <p className="text-sm text-muted">{exact.name} is already in tonight&apos;s game.</p>}
      {query && !exact && (
        <div className="space-y-3 rounded-xl border border-rail-border p-3">
          <p className="text-sm">
            New player: <span className="font-semibold text-cream">{q.trim()}</span>
          </p>
          <Field label="Referred by (optional)">
            <select value={referredBy} onChange={(e) => setReferredBy(e.target.value)} className={inputClass}>
              <option value="">Nobody</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => void create()}>
            Add {q.trim()} and buy in
          </Button>
        </div>
      )}
    </div>
  );
}
