import { describe, expect, it } from "vitest";
import { melbourneToday, formatNightDate, formatTime } from "./dates";
import { centsToInput, formatCents, formatCentsShort, parseMoney } from "./money";

describe("money", () => {
  it("formats AUD from integer cents", () => {
    expect(formatCents(125000)).toBe("$1,250.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-35000)).toBe("-$350.00");
    expect(formatCentsShort(35000)).toBe("$350");
    expect(formatCentsShort(35050)).toBe("$350.50");
    expect(formatCentsShort(1234500)).toBe("$12,345");
  });

  it("refuses non-integer cents", () => {
    expect(() => formatCents(1.5)).toThrow();
  });

  it("parses keypad input without float error", () => {
    expect(parseMoney("350")).toBe(35000);
    expect(parseMoney("0.29")).toBe(29); // 0.29 * 100 = 28.999999999999996 in float
    expect(parseMoney("1,250.5")).toBe(125050);
    expect(parseMoney("$12.30")).toBe(1230);
    expect(parseMoney(" 7. ")).toBe(700);
    for (const bad of ["", "-5", "1.234", "abc", "1.2.3", "."]) expect(parseMoney(bad)).toBeNull();
  });

  it("round-trips input", () => {
    expect(centsToInput(20000)).toBe("200");
    expect(centsToInput(20050)).toBe("200.50");
    expect(parseMoney(centsToInput(123456))).toBe(123456);
  });
});

describe("dates", () => {
  it("uses the Melbourne calendar date, not UTC", () => {
    // 2026-10-01 14:30 UTC is 00:30 on 2 Oct in Melbourne (AEST, +10; DST starts 4 Oct 2026)
    expect(melbourneToday(new Date("2026-10-01T14:30:00Z"))).toBe("2026-10-02");
    expect(melbourneToday(new Date("2026-10-01T13:30:00Z"))).toBe("2026-10-01");
  });

  it("formats night dates like the spec", () => {
    expect(formatNightDate("2026-10-01")).toBe("Thu 1 Oct");
    expect(formatNightDate("2026-12-25")).toBe("Fri 25 Dec");
  });

  it("formats entry times in Melbourne", () => {
    expect(formatTime("2026-10-01T11:42:00Z")).toBe("9:42pm");
  });
});
