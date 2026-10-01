import type { Cents } from "./types";

const grouped = new Intl.NumberFormat("en-AU", { useGrouping: true });

function splitCents(cents: Cents): { sign: string; dollars: string; rem: string } {
  if (!Number.isInteger(cents)) throw new Error(`money must be integer cents, got ${cents}`);
  const abs = Math.abs(cents);
  return {
    sign: cents < 0 ? "-" : "",
    dollars: grouped.format(Math.floor(abs / 100)),
    rem: String(abs % 100).padStart(2, "0"),
  };
}

/** 125000 -> "$1,250.00", -500 -> "-$5.00" */
export function formatCents(cents: Cents): string {
  const { sign, dollars, rem } = splitCents(cents);
  return `${sign}$${dollars}.${rem}`;
}

/** Drops ".00" for whole dollars: 35000 -> "$350", 35050 -> "$350.50". For chat text and badges. */
export function formatCentsShort(cents: Cents): string {
  const { sign, dollars, rem } = splitCents(cents);
  return rem === "00" ? `${sign}$${dollars}` : `${sign}$${dollars}.${rem}`;
}

/**
 * Parses what a host types on a phone keypad into cents, without ever going through a float.
 * Accepts "350", "350.5", "$1,250.00", " 12.30 ". Returns null for anything else
 * (empty, negative, more than 2 decimals, letters).
 */
export function parseMoney(input: string): Cents | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const dollars = Number(m[1]);
  const cents = Number((m[2] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** 20000 -> "200", 20050 -> "200.50". Prefills a money input. */
export function centsToInput(cents: Cents): string {
  const { sign, rem } = splitCents(cents);
  const whole = Math.floor(Math.abs(cents) / 100);
  return rem === "00" ? `${sign}${whole}` : `${sign}${whole}.${rem}`;
}
