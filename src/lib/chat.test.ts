import { describe, expect, it } from "vitest";
import { dateLabel } from "./chat";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("message date grouping", () => {
  it("labels today's messages Today", () => {
    expect(dateLabel(new Date().toISOString())).toBe("Today");
  });
  it("labels yesterday's messages Yesterday", () => {
    expect(dateLabel(daysAgo(1))).toBe("Yesterday");
  });
  it("labels 2-6 day old messages with the weekday name", () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    expect(dateLabel(d.toISOString())).toBe(d.toLocaleDateString([], { weekday: "long" }));
  });
  it("labels 7-13 day old messages Last week", () => {
    expect(dateLabel(daysAgo(10))).toBe("Last week");
  });
  it("labels older messages with month and year", () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    expect(dateLabel(d.toISOString())).toBe(d.toLocaleDateString([], { month: "long", year: "numeric" }));
  });
  it("groups a future-dated message as Today", () => {
    const d = new Date();
    d.setHours(d.getHours() + 5);
    expect(dateLabel(d.toISOString())).toBe("Today");
  });
});
