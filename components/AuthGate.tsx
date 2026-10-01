"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getApi, type Session } from "@/lib/api";
import type { Host } from "@/lib/types";
import { Wordmark } from "./bits";
import { Button } from "./ui";

interface HostCtx {
  session: Session;
  host: Host;
  hosts: Host[];
  hostName: (id: string | null) => string;
}

const Ctx = createContext<HostCtx | null>(null);

export function useHost(): HostCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHost outside AuthGate");
  return v;
}

/** Renders children only for a signed-in host; everyone else goes to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const api = getApi();
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" | "ready" | "not-host"; ctx?: HostCtx }>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    async function check(session: Session | null) {
      if (!session) {
        router.replace("/login");
        return;
      }
      try {
        const [host, hosts] = await Promise.all([api.currentHost(), api.listHosts()]);
        if (!alive) return;
        if (!host) {
          setState({ status: "not-host" });
          return;
        }
        const names = new Map(hosts.map((h) => [h.id, h.display_name]));
        setState({
          status: "ready",
          ctx: { session, host, hosts, hostName: (id) => (id && names.get(id)) || "Unknown" },
        });
      } catch {
        if (alive) setState({ status: "not-host" });
      }
    }
    void api.getSession().then(check);
    const off = api.onAuthChange((s) => {
      if (!s) router.replace("/login");
    });
    return () => {
      alive = false;
      off();
    };
  }, [api, router]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Wordmark className="animate-pulse opacity-60" />
      </div>
    );
  }
  if (state.status === "not-host" || !state.ctx) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-sm place-items-center p-6 text-center">
        <div className="space-y-4">
          <Wordmark />
          <p className="text-sm text-muted">This account isn&apos;t on the host list, or the connection dropped.</p>
          <Button variant="primary" onClick={() => void api.signOut().then(() => router.replace("/login"))}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  return <Ctx.Provider value={state.ctx}>{children}</Ctx.Provider>;
}

export function DemoBanner() {
  if (getApi().mode !== "demo") return null;
  return (
    <div className="border-b border-gold/30 bg-gold/10 px-4 py-1.5 text-center text-xs text-gold">
      Demo mode — sample data, saved on this device only
    </div>
  );
}
