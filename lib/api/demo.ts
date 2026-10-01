// Demo backend: no server, data lives in this browser's localStorage and syncs between tabs with
// BroadcastChannel. It enforces the same rules as the database (closed nights read-only, cash-out
// book guard, validated close, soft delete only) so the UI behaves identically.
import { nightSummary, type NightData } from "../calc";
import { melbourneToday } from "../dates";
import type { AuditRow, BuyIn, CashOut, Expense, Host, Night, Player } from "../types";
import type { Api, ChangeEvent, Session } from "./types";

const KEY = "hsp-demo-v1";
const SESSION_KEY = "hsp-demo-session";

interface DemoDb {
  hosts: Host[];
  players: Player[];
  nights: Night[];
  buyins: BuyIn[];
  cashouts: CashOut[];
  expenses: Expense[];
  audit: AuditRow[];
}

const DEMO_HOSTS: Host[] = [
  { id: "demo-host-a", display_name: "Jack" },
  { id: "demo-host-b", display_name: "Partner" },
];

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function seed(): DemoDb {
  const t = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
  const nightId = uuid();
  const players: Player[] = ["Sam", "Priya", "Dan", "Mei"].map((name, i) => ({
    id: uuid(),
    name,
    phone: null,
    referred_by: null,
    notes: null,
    created_at: t(300 - i),
    archived: false,
  }));
  const [sam, priya, dan, mei] = players;
  const meta = (mins: number, by = "demo-host-a") => ({
    id: uuid(),
    night_id: nightId,
    created_by: by,
    created_at: t(mins),
    updated_at: t(mins),
    deleted_at: null,
  });
  return {
    hosts: DEMO_HOSTS,
    players,
    nights: [
      {
        id: nightId,
        date: melbourneToday(),
        venue: "Home game",
        status: "open",
        opened_by: "demo-host-a",
        closed_by: null,
        closed_at: null,
        default_buyin_cents: 20000,
        notes: null,
        created_at: t(200),
      },
    ],
    buyins: [
      { ...meta(180), player_id: sam.id, amount_cents: 20000, payment_status: "paid", payment_method: "payid", is_comp: false },
      { ...meta(120, "demo-host-b"), player_id: sam.id, amount_cents: 10000, payment_status: "unpaid", payment_method: null, is_comp: false },
      { ...meta(175), player_id: priya.id, amount_cents: 20000, payment_status: "paid", payment_method: "bank_transfer", is_comp: false },
      { ...meta(170, "demo-host-b"), player_id: dan.id, amount_cents: 20000, payment_status: "unpaid", payment_method: null, is_comp: false },
      { ...meta(90), player_id: mei.id, amount_cents: 5000, payment_status: null, payment_method: null, is_comp: true },
      { ...meta(89), player_id: mei.id, amount_cents: 20000, payment_status: "paid", payment_method: "cash", is_comp: false },
    ],
    cashouts: [
      { ...meta(30), player_id: sam.id, amount_cents: 45000, payout_status: "pending", override_reason: null },
      { ...meta(20, "demo-host-b"), player_id: priya.id, amount_cents: 12000, payout_status: "pending", override_reason: null },
    ],
    expenses: [
      { ...meta(150), category: "food", amount_cents: 6000, note: "Pizza", paid_by: "demo-host-a", status: "paid" },
      { ...meta(140, "demo-host-b"), category: "dealer", amount_cents: 15000, note: null, paid_by: "demo-host-b", status: "pending" },
    ],
    audit: [],
  };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch {
    /* fall through to seed */
  }
  const db = seed();
  save(db);
  return db;
}

function save(db: DemoDb) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: demo keeps working in memory for this tab */
  }
}

export function createDemoApi(): Api {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("hsp-demo") : null;
  const localListeners = new Set<(e: ChangeEvent) => void>();
  const authListeners = new Set<(s: Session | null) => void>();

  const session = (): Session | null => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  };
  const actor = () => session()?.userId ?? null;

  const emit = (e: ChangeEvent) => {
    for (const l of localListeners) l(e);
    channel?.postMessage(e);
  };

  const audit = (db: DemoDb, table: string, action: string, before: unknown, after: unknown, rowId: string) => {
    db.audit.push({
      id: db.audit.length + 1,
      table_name: table,
      row_id: rowId,
      action,
      before: (before as Record<string, unknown>) ?? null,
      after: (after as Record<string, unknown>) ?? null,
      actor: actor(),
      at: now(),
    });
  };

  const ensureOpen = (db: DemoDb, nightId: string) => {
    const n = db.nights.find((x) => x.id === nightId);
    if (!n) throw new Error("Night not found");
    if (n.status === "closed") throw new Error("Night is closed and read-only. Reopen it first.");
  };

  const nightData = (db: DemoDb, id: string): NightData => ({
    buyins: db.buyins.filter((r) => r.night_id === id),
    cashouts: db.cashouts.filter((r) => r.night_id === id),
    expenses: db.expenses.filter((r) => r.night_id === id),
  });

  const actionFor = (before: { deleted_at: string | null }, after: { deleted_at: string | null }) =>
    !before.deleted_at && after.deleted_at ? "soft_delete" : before.deleted_at && !after.deleted_at ? "restore" : "update";

  function insertEntry<T extends { id: string; night_id: string }>(table: "buyins" | "cashouts" | "expenses", row: Omit<T, "created_by" | "created_at" | "updated_at" | "deleted_at">): T {
    const db = load();
    ensureOpen(db, row.night_id);
    const full = { ...row, created_by: actor(), created_at: now(), updated_at: now(), deleted_at: null } as unknown as T;
    if (table === "cashouts") guardCashOut(db, full as unknown as CashOut);
    (db[table] as unknown as T[]).push(full);
    audit(db, table, "insert", null, full, full.id);
    save(db);
    emit({ table, row: full } as unknown as ChangeEvent);
    return full;
  }

  function updateEntry<T extends { id: string; night_id: string; deleted_at: string | null }>(table: "buyins" | "cashouts" | "expenses", id: string, patch: Partial<T>): T {
    const db = load();
    const rows = db[table] as unknown as T[];
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error("Entry not found");
    ensureOpen(db, rows[i].night_id);
    const before = rows[i];
    const after = { ...before, ...patch, updated_at: now() };
    if (table === "cashouts") {
      const b = before as unknown as CashOut;
      const a = after as unknown as CashOut;
      if (!a.deleted_at && (b.deleted_at || a.amount_cents > b.amount_cents)) guardCashOut(db, a);
    }
    rows[i] = after;
    audit(db, table, actionFor(before, after), before, after, id);
    save(db);
    emit({ table, row: after } as unknown as ChangeEvent);
    return after;
  }

  function guardCashOut(db: DemoDb, row: CashOut) {
    const data = nightData(db, row.night_id);
    const others = { ...data, cashouts: data.cashouts.filter((c) => c.id !== row.id) };
    const after = nightSummary(others).book - row.amount_cents;
    if (after < 0 && !(row.override_reason ?? "").trim()) {
      throw new Error(`This cash-out exceeds chips on the books by ${-after} cents`);
    }
  }

  function setNightStatus(id: string, status: "open" | "closed", reason?: string): Night {
    const db = load();
    const i = db.nights.findIndex((n) => n.id === id);
    if (i < 0) throw new Error("Night not found");
    const before = db.nights[i];
    if (status === "closed") {
      if (before.status === "closed") return before;
      if (nightSummary(nightData(db, id)).book < 0) throw new Error("Book is negative; fix the entries before closing");
    } else if (before.status !== "closed") {
      throw new Error("Night not found or not closed");
    }
    const after: Night =
      status === "closed"
        ? { ...before, status, closed_at: now(), closed_by: actor() }
        : { ...before, status, closed_at: null, closed_by: null };
    db.nights[i] = after;
    audit(db, "nights", status === "closed" ? "close" : "reopen", before, reason ? { ...after, reopen_reason: reason } : after, id);
    save(db);
    emit({ table: "nights", row: after });
    return after;
  }

  return {
    mode: "demo",

    async getSession() {
      return session();
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async sendMagicLink(email) {
      // Demo: no email is sent; the first host signs straight in.
      const s = { userId: DEMO_HOSTS[0].id, email };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      for (const l of authListeners) l(s);
    },
    async verifyCode() {
      /* not used in demo */
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      for (const l of authListeners) l(null);
    },
    async currentHost() {
      const s = session();
      return s ? (load().hosts.find((h) => h.id === s.userId) ?? null) : null;
    },

    async listHosts() {
      return load().hosts;
    },
    async listPlayers() {
      return load()
        .players.filter((p) => !p.archived)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async createPlayer(p) {
      const db = load();
      const name = p.name.trim();
      if (!name) throw new Error("Name is required");
      if (db.players.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) throw new Error("duplicate key players_name_unique");
      const row: Player = { id: uuid(), name, phone: null, referred_by: p.referred_by, notes: null, created_at: now(), archived: false };
      db.players.push(row);
      save(db);
      emit({ table: "players", row });
      return row;
    },

    async listNights() {
      const db = load();
      const nights = [...db.nights].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
      const live = <T extends { deleted_at: string | null }>(r: T[]) => r.filter((x) => !x.deleted_at);
      const data = Object.fromEntries(
        nights.map((n) => {
          const d = nightData(db, n.id);
          return [n.id, { buyins: live(d.buyins), cashouts: live(d.cashouts), expenses: live(d.expenses) }];
        }),
      );
      return { nights, data };
    },
    async getNight(id) {
      return load().nights.find((n) => n.id === id) ?? null;
    },
    async getNightData(id) {
      return nightData(load(), id);
    },
    async createNight(n) {
      const db = load();
      const row: Night = {
        id: uuid(),
        date: n.date,
        venue: n.venue,
        status: "open",
        opened_by: actor(),
        closed_by: null,
        closed_at: null,
        default_buyin_cents: n.default_buyin_cents,
        notes: null,
        created_at: now(),
      };
      db.nights.push(row);
      audit(db, "nights", "insert", null, row, row.id);
      save(db);
      emit({ table: "nights", row });
      return row;
    },
    async closeNight(id) {
      return setNightStatus(id, "closed");
    },
    async reopenNight(id, reason) {
      if (!reason.trim()) throw new Error("A reason is required to reopen a night");
      return setNightStatus(id, "open", reason.trim());
    },
    async listAudit(nightId) {
      return load()
        .audit.filter(
          (a) => a.row_id === nightId || a.after?.night_id === nightId || a.before?.night_id === nightId,
        )
        .reverse();
    },

    async insertBuyIn(row) {
      return insertEntry<BuyIn>("buyins", row);
    },
    async updateBuyIn(id, patch) {
      return updateEntry<BuyIn>("buyins", id, patch);
    },
    async insertCashOut(row) {
      return insertEntry<CashOut>("cashouts", row);
    },
    async updateCashOut(id, patch) {
      return updateEntry<CashOut>("cashouts", id, patch);
    },
    async insertExpense(row) {
      return insertEntry<Expense>("expenses", row);
    },
    async updateExpense(id, patch) {
      return updateEntry<Expense>("expenses", id, patch);
    },

    subscribe(nightId, onChange, onStatus) {
      const relevant = (e: ChangeEvent) =>
        !nightId || e.table === "players" || (e.table === "nights" ? e.row.id === nightId : e.row.night_id === nightId);
      const onMessage = (m: MessageEvent<ChangeEvent>) => relevant(m.data) && onChange(m.data);
      channel?.addEventListener("message", onMessage);
      onStatus("synced");
      return () => channel?.removeEventListener("message", onMessage);
    },
  };
}
