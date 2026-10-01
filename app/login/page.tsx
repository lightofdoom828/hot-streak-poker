"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoBanner } from "@/components/AuthGate";
import { ChipBadge } from "@/components/ChipBadge";
import { Wordmark } from "@/components/bits";
import { Button, Field, inputClass, WarnIcon } from "@/components/ui";
import { friendlyError, getApi } from "@/lib/api";

export default function LoginPage() {
  const api = getApi();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getSession().then((s) => s && router.replace("/nights"));
    return api.onAuthChange((s) => s && router.replace("/nights"));
  }, [api, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const demo = api.mode === "demo";

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 p-6">
        <div className="felt rounded-[2rem] p-7">
          <div className="mb-4 flex -space-x-2">
            <ChipBadge label="♠" size={44} />
            <ChipBadge label="♦" variant="cashout" size={44} />
          </div>
          <Wordmark stacked />
          <div className="betting-line my-4" />
          <p className="font-display text-xl text-cream">Host Book</p>
        </div>

        {!sent ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.sendMagicLink(email);
                if (!demo) setSent(true);
              });
            }}
          >
            <Field label="Host email">
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Sending…" : demo ? "Enter demo" : "Email me a sign-in link"}
            </Button>
            <p className="text-center text-xs text-muted">
              {demo ? "Any email works in the demo." : "Hosts only. No password — we email you a link."}
            </p>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.verifyCode(email, code));
            }}
          >
            <p className="text-sm">
              Link sent to <span className="font-semibold text-cream">{email}</span>. Open it on this phone to sign in.
            </p>
            <Field label="Or enter the code from the email" hint="Use this if the link opens in a different browser.">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} tabular tracking-[0.3em]`}
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || code.length < 6}>
              {busy ? "Checking…" : "Sign in with code"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </form>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-error/50 p-3 text-sm text-error">
            <WarnIcon className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
