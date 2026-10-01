"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerSummary } from "@/lib/calc";
import { formatCentsShort } from "@/lib/money";
import type { CashOut, Player } from "@/lib/types";
import { ChipBadge } from "../ChipBadge";
import { Button, ClockIcon, Pill, Sheet } from "../ui";
import { useNightCtx } from "./context";
import { AddPlayerForm, BuyInForm, CashOutForm, PlayerDetail, SettleForm } from "./sheets";

type Open =
  | { kind: "add" }
  | { kind: "buyin"; player: Player }
  | { kind: "cashout"; player: Player; editing?: CashOut }
  | { kind: "settle"; player: Player }
  | { kind: "detail"; player: Player }
  | null;

/** Buy-in count chip that pops when the count goes up. */
function CountChip({ count, variant }: { count: number; variant: "buyin" | "cashout" }) {
  const prev = useRef(count);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (count > prev.current) {
      setPop(true);
      const t = window.setTimeout(() => setPop(false), 350);
      prev.current = count;
      return () => window.clearTimeout(t);
    }
    prev.current = count;
  }, [count]);
  return <ChipBadge label={`${count}×`} variant={variant} className={pop ? "chip-pop" : ""} title={`${count} buy-ins`} />;
}

function PlayerRow({ p, player, onOpen }: { p: PlayerSummary; player: Player; onOpen: (o: Open) => void }) {
  const { night, readOnly, addBuyIn } = useNightCtx();
  const longPress = useRef(0);
  const longFired = useRef(false);
  const pendingPayout = p.total_cashout - p.payouts_sent;
  const quick = night.default_buyin_cents;

  return (
    <li className="rounded-2xl border border-rail-border bg-rail-raised p-3">
      <button
        type="button"
        onClick={() => onOpen({ kind: "detail", player })}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl text-left"
        aria-label={`${player.name} details`}
      >
        <CountChip count={p.buyin_count} variant={p.seated ? "buyin" : "cashout"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{player.name}</span>
          <span className="tabular block text-sm text-muted">
            {formatCentsShort(p.total_buyins)} in
            {!p.seated && ` · ${formatCentsShort(p.total_cashout)} out`}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          {p.seated ? <Pill tone="gold">Seated</Pill> : <Pill tone="muted">Cashed out</Pill>}
          {p.unpaid_buyins > 0 && (
            <Pill tone="pending">
              <ClockIcon /> {formatCentsShort(p.unpaid_buyins)} unpaid
            </Pill>
          )}
          {pendingPayout > 0 && (
            <Pill tone="pending">
              <ClockIcon /> {formatCentsShort(pendingPayout)} to send
            </Pill>
          )}
        </span>
      </button>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={p.seated ? "primary" : "secondary"}
            aria-label={`Add ${formatCentsShort(quick)} buy-in for ${player.name}. Hold for a custom amount.`}
            onPointerDown={() => {
              longFired.current = false;
              longPress.current = window.setTimeout(() => {
                longFired.current = true;
                onOpen({ kind: "buyin", player });
              }, 500);
            }}
            onPointerUp={() => window.clearTimeout(longPress.current)}
            onPointerLeave={() => window.clearTimeout(longPress.current)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (longFired.current) return;
              void addBuyIn(
                { player_id: player.id, amount_cents: quick, payment_status: "unpaid", payment_method: null, is_comp: false },
                { message: `Buy-in ${formatCentsShort(quick)} for ${player.name} (unpaid)` },
              );
            }}
          >
            + {formatCentsShort(quick)}
          </Button>
          <Button onClick={() => onOpen({ kind: "buyin", player })}>Custom</Button>
          <Button variant={p.seated ? "primary" : "secondary"} onClick={() => onOpen({ kind: "cashout", player })}>
            Cash out
          </Button>
          {(p.unpaid_buyins > 0 || pendingPayout > 0) && (
            <Button onClick={() => onOpen({ kind: "settle", player })}>
              {pendingPayout > 0 ? (p.unpaid_buyins > 0 ? "Settle" : "Mark sent") : "Mark paid"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function PlayersTab() {
  const { playerRows, players, readOnly } = useNightCtx();
  const [open, setOpen] = useState<Open>(null);
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = [...playerRows].sort((a, b) => Number(b.seated) - Number(a.seated));
  const close = () => setOpen(null);
  // Sheets read the live summary so they update while open.
  const live = (player: Player) => playerRows.find((r) => r.player_id === player.id);

  return (
    <div className="space-y-3">
      {!readOnly && (
        <Button className="w-full border-dashed" onClick={() => setOpen({ kind: "add" })}>
          + Add player
        </Button>
      )}
      {rows.length === 0 ? (
        <div className="felt rounded-[1.75rem] p-8 text-center">
          <p className="font-display text-2xl">No players seated yet</p>
          {!readOnly && <p className="mt-1 text-sm text-cream/90">Add a player to log the first buy-in.</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => {
            const player = byId.get(p.player_id);
            return player ? <PlayerRow key={p.player_id} p={p} player={player} onOpen={setOpen} /> : null;
          })}
        </ul>
      )}

      <Sheet open={open?.kind === "add"} onClose={close} title="Add player">
        <AddPlayerForm onPick={(player) => setOpen({ kind: "buyin", player })} />
      </Sheet>
      <Sheet open={open?.kind === "buyin"} onClose={close} title="Buy-in">
        {open?.kind === "buyin" && <BuyInForm player={open.player} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "cashout"} onClose={close} title="Cash out">
        {open?.kind === "cashout" && <CashOutForm player={open.player} editing={open.editing} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "settle"} onClose={close} title="Settle up">
        {open?.kind === "settle" && live(open.player) && <SettleForm player={open.player} p={live(open.player)!} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "detail"} onClose={close} title={open?.kind === "detail" ? open.player.name : "Player"}>
        {open?.kind === "detail" &&
          (live(open.player) ? (
            <PlayerDetail
              player={open.player}
              p={live(open.player)!}
              onEditCashOut={(c) => setOpen({ kind: "cashout", player: open.player, editing: c })}
            />
          ) : (
            <p className="text-sm text-muted">No entries left for this player tonight.</p>
          ))}
      </Sheet>
    </div>
  );
}
