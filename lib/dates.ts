export const TZ = "Australia/Melbourne";

/** Today's calendar date in Melbourne as YYYY-MM-DD. A night keeps the date it started on. */
export function melbourneToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseIsoDate(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`expected YYYY-MM-DD, got ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** "2026-10-01" -> "Thu 1 Oct". Pure calendar maths, independent of the device timezone. */
export function formatNightDate(date: string): string {
  const { y, m, d } = parseIsoDate(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]}`;
}

/** "2026-10-01" -> "October 2026" style key for grouping: "2026-10". */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function formatMonth(key: string): string {
  const { y, m } = parseIsoDate(`${key}-01`);
  return `${MONTHS[m - 1]} ${y}`;
}

/** An ISO timestamp -> "9:42pm" in Melbourne time. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\s/g, "")
    .toLowerCase();
}
