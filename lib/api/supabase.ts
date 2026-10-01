import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { NightData } from "../calc";
import type { AuditRow, BuyIn, CashOut, Expense, Host, Night, Player } from "../types";
import type { Api, ChangeEvent, Session, SyncStatus } from "./types";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function redirectUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${base}/`;
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      // Implicit flow: the magic link works even when the phone opens it in a different browser
      // from the one that asked for it (PKCE would need the same browser storage).
      flowType: "implicit",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
    s ? { userId: s.user.id, email: s.user.email ?? "" } : null;

  const tableOf = (t: string) => t as ChangeEvent["table"];

  return {
    mode: "supabase",

    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async sendMagicLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true },
      });
      if (error) throw new Error(error.message);
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async currentHost() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      const res = await sb.from("hosts").select("id, display_name").eq("id", data.user.id).maybeSingle();
      return unwrap<Host | null>(res);
    },

    async listHosts() {
      return unwrap<Host[]>(await sb.from("hosts").select("id, display_name").order("display_name"));
    },
    async listPlayers() {
      return unwrap<Player[]>(await sb.from("players").select("*").eq("archived", false).order("name"));
    },
    async createPlayer(p) {
      return unwrap<Player>(
        await sb.from("players").insert({ name: p.name.trim(), referred_by: p.referred_by }).select().single(),
      );
    },

    async listNights() {
      const nights = unwrap<Night[]>(await sb.from("nights").select("*").order("date", { ascending: false }).limit(200));
      const ids = nights.map((n) => n.id);
      const data: Record<string, NightData> = Object.fromEntries(ids.map((id) => [id, { buyins: [], cashouts: [], expenses: [] }]));
      if (ids.length) {
        const [b, c, e] = await Promise.all([
          sb.from("buyins").select("*").in("night_id", ids).is("deleted_at", null),
          sb.from("cashouts").select("*").in("night_id", ids).is("deleted_at", null),
          sb.from("expenses").select("*").in("night_id", ids).is("deleted_at", null),
        ]);
        for (const r of unwrap<BuyIn[]>(b)) data[r.night_id].buyins.push(r);
        for (const r of unwrap<CashOut[]>(c)) data[r.night_id].cashouts.push(r);
        for (const r of unwrap<Expense[]>(e)) data[r.night_id].expenses.push(r);
      }
      return { nights, data };
    },
    async getNight(id) {
      return unwrap<Night | null>(await sb.from("nights").select("*").eq("id", id).maybeSingle());
    },
    async getNightData(id) {
      const [b, c, e] = await Promise.all([
        sb.from("buyins").select("*").eq("night_id", id).order("created_at"),
        sb.from("cashouts").select("*").eq("night_id", id).order("created_at"),
        sb.from("expenses").select("*").eq("night_id", id).order("created_at"),
      ]);
      return { buyins: unwrap<BuyIn[]>(b), cashouts: unwrap<CashOut[]>(c), expenses: unwrap<Expense[]>(e) };
    },
    async createNight(n) {
      return unwrap<Night>(await sb.from("nights").insert(n).select().single());
    },
    async closeNight(id) {
      return unwrap<Night>(await sb.rpc("close_night", { p_night_id: id }).single());
    },
    async reopenNight(id, reason) {
      return unwrap<Night>(await sb.rpc("reopen_night", { p_night_id: id, p_reason: reason }).single());
    },
    async listAudit(nightId) {
      return unwrap<AuditRow[]>(
        await sb
          .from("audit_log")
          .select("*")
          .or(`row_id.eq.${nightId},after->>night_id.eq.${nightId},before->>night_id.eq.${nightId}`)
          .order("id", { ascending: false })
          .limit(500),
      );
    },

    async insertBuyIn(row) {
      return unwrap<BuyIn>(await sb.from("buyins").insert(row).select().single());
    },
    async updateBuyIn(id, patch) {
      return unwrap<BuyIn>(await sb.from("buyins").update(patch).eq("id", id).select().single());
    },
    async insertCashOut(row) {
      return unwrap<CashOut>(await sb.from("cashouts").insert(row).select().single());
    },
    async updateCashOut(id, patch) {
      return unwrap<CashOut>(await sb.from("cashouts").update(patch).eq("id", id).select().single());
    },
    async insertExpense(row) {
      return unwrap<Expense>(await sb.from("expenses").insert(row).select().single());
    },
    async updateExpense(id, patch) {
      return unwrap<Expense>(await sb.from("expenses").update(patch).eq("id", id).select().single());
    },

    subscribe(nightId, onChange, onStatus) {
      onStatus("connecting");
      const filter = nightId ? `night_id=eq.${nightId}` : undefined;
      let channel: RealtimeChannel = sb.channel(`hsp-${nightId ?? "all"}-${Math.random().toString(36).slice(2)}`);
      for (const table of ["buyins", "cashouts", "expenses"]) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
          (p) => p.new && Object.keys(p.new).length && onChange({ table: tableOf(table), row: p.new } as ChangeEvent),
        );
      }
      channel = channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "nights", ...(nightId ? { filter: `id=eq.${nightId}` } : {}) },
          (p) => p.new && Object.keys(p.new).length && onChange({ table: "nights", row: p.new as Night }),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "players" }, (p) =>
          p.new && Object.keys(p.new).length ? onChange({ table: "players", row: p.new as Player }) : undefined,
        );
      channel.subscribe((status) => {
        const s: SyncStatus = status === "SUBSCRIBED" ? "synced" : "reconnecting";
        onStatus(s);
      });
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
