// Runs the real migration inside PGlite (in-process Postgres) with a minimal stand-in for
// Supabase's auth schema and roles, then proves the database itself enforces the rules.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text not null);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase's default privileges: every new public table/function is open to the API roles,
  -- and RLS + explicit revokes are what actually protect it.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const HOST_A = "00000000-0000-0000-0000-00000000000a";
const HOST_B = "00000000-0000-0000-0000-00000000000b";
const STRANGER = "00000000-0000-0000-0000-0000000000ff";

let db: PGlite;

type Q = Pick<Transaction, "query">;

/** Runs `fn` as a signed-in API user (role authenticated, auth.uid() = uid), then rolls back nothing: commits. */
async function as<T>(uid: string | null, fn: (tx: Q) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    return fn(tx);
  });
}

const one = async <T = Record<string, unknown>>(tx: Q, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0];

async function newNight(uid = HOST_A): Promise<string> {
  const row = await as(uid, (tx) => one<{ id: string }>(tx, `insert into nights (venue) values ('Test') returning id`));
  return row.id;
}

async function newPlayer(name: string): Promise<string> {
  const row = await as(HOST_A, (tx) => one<{ id: string }>(tx, `insert into players (name) values ($1) returning id`, [name]));
  return row.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.exec(`
    insert into host_allowlist (email, display_name) values
      ('host.a@example.com', 'Host A'), ('host.b@example.com', 'Host B');
    insert into auth.users (id, email) values
      ('${HOST_A}', 'Host.A@example.com'), ('${HOST_B}', 'host.b@example.com');
  `);
}, 60_000);

describe("sign-in allowlist", () => {
  it("allowlisted emails become hosts (case-insensitive)", async () => {
    const { rows } = await db.query<{ display_name: string }>(`select display_name from hosts order by display_name`);
    expect(rows.map((r) => r.display_name)).toEqual(["Host A", "Host B"]);
  });

  it("any other email is refused at sign-up", async () => {
    await expect(
      db.query(`insert into auth.users (id, email) values ($1, 'randoms@example.com')`, [STRANGER]),
    ).rejects.toThrow(/not on the Hot Streak host list/);
  });

  it("the allowlist itself is invisible to API users", async () => {
    await expect(as(HOST_A, (tx) => tx.query(`select * from host_allowlist`))).rejects.toThrow(/permission denied/);
  });
});

describe("host-only access (RLS)", () => {
  it("anon can read nothing", async () => {
    await newNight();
    await expect(as(null, (tx) => tx.query(`select * from nights`))).rejects.toThrow(/permission denied/);
  });

  it("a signed-in non-host sees no rows and cannot write", async () => {
    const { rows } = await as(STRANGER, (tx) => tx.query(`select * from nights`));
    expect(rows).toEqual([]);
    await expect(as(STRANGER, (tx) => tx.query(`insert into nights (venue) values ('x')`))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("both hosts see the same data", async () => {
    const id = await newNight(HOST_A);
    const row = await as(HOST_B, (tx) => one<{ id: string; opened_by: string }>(tx, `select * from nights where id = $1`, [id]));
    expect(row.opened_by).toBe(HOST_A);
  });
});

describe("buy-in / cash-out integrity", () => {
  it("records who created an entry", async () => {
    const night = await newNight();
    const p = await newPlayer("Creator Check");
    const row = await as(HOST_B, (tx) =>
      one<{ created_by: string }>(
        tx,
        `insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 20000, 'paid') returning created_by`,
        [night, p],
      ),
    );
    expect(row.created_by).toBe(HOST_B);
  });

  it("a comp has no payment status; a real buy-in must have one", async () => {
    const night = await newNight();
    const p = await newPlayer("Comp Check");
    await as(HOST_A, (tx) =>
      tx.query(`insert into buyins (night_id, player_id, amount_cents, is_comp) values ($1, $2, 5000, true)`, [night, p]),
    );
    await expect(
      as(HOST_A, (tx) =>
        tx.query(`insert into buyins (night_id, player_id, amount_cents, is_comp, payment_status) values ($1, $2, 5000, true, 'paid')`, [night, p]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(HOST_A, (tx) => tx.query(`insert into buyins (night_id, player_id, amount_cents) values ($1, $2, 5000)`, [night, p])),
    ).rejects.toThrow(/check constraint/);
  });

  it("money must be positive integer cents", async () => {
    const night = await newNight();
    const p = await newPlayer("Amount Check");
    await expect(
      as(HOST_A, (tx) =>
        tx.query(`insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 0, 'paid')`, [night, p]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("a cash-out that would take the book negative is refused unless a reason is typed", async () => {
    const night = await newNight();
    const p = await newPlayer("Book Guard");
    await as(HOST_A, async (tx) => {
      await tx.query(`insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 20000, 'paid')`, [night, p]);
      await tx.query(`insert into cashouts (night_id, player_id, amount_cents) values ($1, $2, 20000)`, [night, p]);
    });
    await expect(
      as(HOST_A, (tx) => tx.query(`insert into cashouts (night_id, player_id, amount_cents) values ($1, $2, 1)`, [night, p])),
    ).rejects.toThrow(/exceeds chips on the books by 1 cents/);
    await as(HOST_A, (tx) =>
      tx.query(`insert into cashouts (night_id, player_id, amount_cents, override_reason) values ($1, $2, 1, 'rounding chip')`, [night, p]),
    );
  });

  it("financial rows cannot be hard-deleted, even by the database owner", async () => {
    const night = await newNight();
    const p = await newPlayer("Delete Check");
    const b = await as(HOST_A, (tx) =>
      one<{ id: string }>(tx, `insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 100, 'paid') returning id`, [night, p]),
    );
    await expect(db.query(`delete from buyins where id = $1`, [b.id])).rejects.toThrow(/never hard-deleted/);
    await expect(as(HOST_A, (tx) => tx.query(`delete from buyins where id = $1`, [b.id]))).rejects.toThrow(/permission denied/);
  });
});

describe("audit log", () => {
  it("logs inserts and soft deletes with the acting host", async () => {
    const night = await newNight();
    const p = await newPlayer("Audit Check");
    const b = await as(HOST_A, (tx) =>
      one<{ id: string }>(tx, `insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 100, 'paid') returning id`, [night, p]),
    );
    await as(HOST_B, (tx) => tx.query(`update buyins set deleted_at = now() where id = $1`, [b.id]));
    const { rows } = await as(HOST_A, (tx) =>
      tx.query<{ action: string; actor: string }>(`select action, actor from audit_log where row_id = $1 order by id`, [b.id]),
    );
    expect(rows).toEqual([
      { action: "insert", actor: HOST_A },
      { action: "soft_delete", actor: HOST_B },
    ]);
  });

  it("hosts cannot write or rewrite the audit log", async () => {
    await expect(
      as(HOST_A, (tx) => tx.query(`insert into audit_log (table_name, row_id, action) values ('x', gen_random_uuid(), 'fake')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("closing and the read-only lock (acceptance 9)", () => {
  async function closedNight() {
    const night = await newNight();
    const p = await newPlayer(`Closed ${night.slice(0, 8)}`);
    const b = await as(HOST_A, async (tx) => {
      const row = await one<{ id: string }>(
        tx,
        `insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 20000, 'unpaid') returning id`,
        [night, p],
      );
      await tx.query(`insert into cashouts (night_id, player_id, amount_cents) values ($1, $2, 15000)`, [night, p]);
      await tx.query(`insert into expenses (night_id, category, amount_cents) values ($1, 'food', 3000)`, [night]);
      await tx.query(`select close_night($1)`, [night]);
      return row;
    });
    return { night, p, buyinId: b.id };
  }

  it("close_night stamps who and when", async () => {
    const { night } = await closedNight();
    const row = await as(HOST_B, (tx) => one<{ status: string; closed_by: string; closed_at: string | null }>(tx, `select * from nights where id = $1`, [night]));
    expect(row.status).toBe("closed");
    expect(row.closed_by).toBe(HOST_A);
    expect(row.closed_at).not.toBeNull();
  });

  it("a host cannot add, edit or soft-delete entries on a closed night", async () => {
    const { night, p, buyinId } = await closedNight();
    await expect(
      as(HOST_A, (tx) => tx.query(`insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 100, 'paid')`, [night, p])),
    ).rejects.toThrow(/row-level security|read-only/);
    // RLS hides the row from UPDATE, so zero rows change; the value is untouched.
    const res = await as(HOST_A, (tx) => tx.query(`update buyins set payment_status = 'paid' where id = $1`, [buyinId]));
    expect(res.affectedRows).toBe(0);
    await as(HOST_A, (tx) => tx.query(`update buyins set deleted_at = now() where id = $1`, [buyinId]));
    const row = await as(HOST_A, (tx) => one<{ payment_status: string; deleted_at: string | null }>(tx, `select * from buyins where id = $1`, [buyinId]));
    expect(row).toMatchObject({ payment_status: "unpaid", deleted_at: null });
    await expect(
      as(HOST_A, (tx) => tx.query(`insert into expenses (night_id, category, amount_cents) values ($1, 'misc', 100)`, [night])),
    ).rejects.toThrow(/row-level security|read-only/);
  });

  it("even the database owner (service role) cannot write to a closed night", async () => {
    const { night, p, buyinId } = await closedNight();
    await expect(
      db.query(`insert into cashouts (night_id, player_id, amount_cents) values ($1, $2, 100)`, [night, p]),
    ).rejects.toThrow(/closed and read-only/);
    await expect(db.query(`update buyins set amount_cents = 1 where id = $1`, [buyinId])).rejects.toThrow(/closed and read-only/);
    await expect(db.query(`update nights set venue = 'edited' where id = $1`, [night])).rejects.toThrow(/closed and read-only/);
  });

  it("a night can only be closed through close_night, never by a plain update", async () => {
    const night = await newNight();
    await expect(
      as(HOST_A, (tx) => tx.query(`update nights set status = 'closed', closed_at = now() where id = $1`, [night])),
    ).rejects.toThrow(/close_night/);
  });

  it("close_night refuses a negative book", async () => {
    const night = await newNight();
    const p = await newPlayer("Negative Close");
    await as(HOST_A, async (tx) => {
      await tx.query(`insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 10000, 'paid')`, [night, p]);
      await tx.query(
        `insert into cashouts (night_id, player_id, amount_cents, override_reason) values ($1, $2, 15000, 'testing negative')`,
        [night, p],
      );
    });
    await expect(as(HOST_A, (tx) => tx.query(`select close_night($1)`, [night]))).rejects.toThrow(/Book is negative/);
  });

  it("reopen needs a reason, logs it, and makes the night writable again", async () => {
    const { night, p } = await closedNight();
    await expect(as(HOST_B, (tx) => tx.query(`select reopen_night($1, '  ')`, [night]))).rejects.toThrow(/reason is required/);
    await as(HOST_B, (tx) => tx.query(`select reopen_night($1, 'Dan paid late')`, [night]));
    const audit = await as(HOST_A, (tx) =>
      one<{ actor: string; after: { reopen_reason: string; status: string } }>(
        tx,
        `select actor, after from audit_log where row_id = $1 and action = 'reopen'`,
        [night],
      ),
    );
    expect(audit.actor).toBe(HOST_B);
    expect(audit.after).toMatchObject({ reopen_reason: "Dan paid late", status: "open" });
    await as(HOST_A, (tx) =>
      tx.query(`insert into buyins (night_id, player_id, amount_cents, payment_status) values ($1, $2, 100, 'paid')`, [night, p]),
    );
  });

  it("non-hosts cannot close or reopen", async () => {
    const night = await newNight();
    await expect(as(STRANGER, (tx) => tx.query(`select close_night($1)`, [night]))).rejects.toThrow(/Only hosts/);
  });
});
