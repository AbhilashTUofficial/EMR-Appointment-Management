import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeDays } from "./days";
import { age, formatDate, today } from "./format";

describe("formatDate", () => {
  it("shows the same calendar day whatever the browser's timezone", () => {
    const text = formatDate("2026-10-19");
    expect(text).toContain("19");
    expect(text).toContain("2026");
  });
});

describe("age", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12)); // 15 June 2026, local time
  });
  afterEach(() => vi.useRealTimers());

  it("counts whole years, not yet adding the year before the birthday", () => {
    expect(age("1990-06-15")).toBe(36);
    expect(age("1990-06-16")).toBe(35);
    expect(age("1990-05-01")).toBe(36);
    expect(age("2026-01-01")).toBe(0);
  });

  it("accepts a full ISO date, as the server sends", () => {
    expect(age("1990-05-01T00:00:00.000Z")).toBe(36);
  });

  it("is unknown without a date of birth", () => {
    expect(age(undefined)).toBeUndefined();
    expect(age("")).toBeUndefined();
  });

  it("gives today as YYYY-MM-DD", () => {
    expect(today()).toBe("2026-06-15");
  });
});

describe("summarizeDays", () => {
  const day = (n: number) => ({ day: n, sessions: [], breaks: [] });

  it("lists working days Monday to Sunday", () => {
    expect(summarizeDays([day(0), day(3), day(1)])).toBe("Mon, Wed, Sun");
  });

  it("says so when there are none", () => {
    expect(summarizeDays([])).toBe("No working days");
  });
});
