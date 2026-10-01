"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Wordmark } from "@/components/bits";
import { getApi } from "@/lib/api";

// Entry point, and where a magic link lands: supabase-js reads the token from the URL,
// then we route on whether a session exists.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const api = getApi();
    let done = false;
    const go = (signedIn: boolean) => {
      if (done) return;
      done = true;
      router.replace(signedIn ? "/nights" : "/login");
    };
    const hasToken = window.location.hash.includes("access_token");
    const off = api.onAuthChange((s) => s && go(true));
    void api.getSession().then((s) => {
      if (s) go(true);
      else if (!hasToken) go(false);
      else window.setTimeout(() => go(false), 4000); // token in URL: give sign-in a moment
    });
    return off;
  }, [router]);
  return (
    <div className="grid min-h-dvh place-items-center">
      <Wordmark className="animate-pulse opacity-60" />
    </div>
  );
}
