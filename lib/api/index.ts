import { createDemoApi } from "./demo";
import { createSupabaseApi } from "./supabase";
import type { Api } from "./types";

let api: Api | null = null;

/** Supabase when NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set at build time, otherwise the local demo. */
export function getApi(): Api {
  if (api) return api;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  api = url && key ? createSupabaseApi(url, key) : createDemoApi();
  return api;
}

export * from "./types";
