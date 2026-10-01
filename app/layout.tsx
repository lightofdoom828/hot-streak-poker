import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Hot Streak Poker — Host Book",
  description: "Live buy-ins, cash-outs, expenses and P&L for poker night hosts.",
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/brand/icon.svg`, type: "image/svg+xml" },
      { url: `${base}/brand/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    apple: `${base}/brand/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: "Host Book", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0F0F10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={`${anton.variable} ${inter.variable}`}>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
