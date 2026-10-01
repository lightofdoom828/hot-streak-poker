import type { NextConfig } from "next";

// Static export: the app is all client-side (Supabase does auth, data and realtime), so the
// build output in `out/` can be hosted anywhere — Vercel, Netlify, GitHub Pages.
// NEXT_PUBLIC_BASE_PATH is only needed when hosting under a sub-path (e.g. GitHub Pages /repo).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
