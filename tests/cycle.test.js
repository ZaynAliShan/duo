import { describe, it, expect } from "vitest";
import { buildModel, cycleInfo, parseKey, nextOvulation } from "../lib/cycle.js";
const cycles = [
  { period_start: "2026-04-03", period_end: "2026-04-07" },
  { period_start: "2026-05-01", period_end: "2026-05-04" },
  { period_start: "2026-05-30", period_end: "2026-06-03" },
  { period_start: "2026-06-28", period_end: "2026-07-02" },
];
describe("cycle model", () => {
  const m = buildModel(cycles);
  it("averages cycle + period length", () => { expect(m.avgLen).toBe(29); expect(m.avgPeriod).toBe(5); });
  it("predicts the next start", () => expect(m.nextStart.getTime()).toBe(parseKey("2026-07-27").getTime()));
  it("phases for July 19 (prototype day)", () => {
    const i = cycleInfo(parseKey("2026-07-19"), m);
    expect(i.day).toBe(22); expect(i.phase).toBe("luteal"); expect(i.predicted).toBe(false);
  });
  it("period days are period", () => expect(cycleInfo(parseKey("2026-06-29"), m).phase).toBe("period"));
  it("predicted period after next start", () => {
    const i = cycleInfo(parseKey("2026-07-28"), m);
    expect(i.predicted).toBe(true); expect(i.phase).toBe("period");
  });
  it("ovulation ≈ 14 days before next period", () => {
    const i = cycleInfo(parseKey("2026-07-13"), m); expect(i.ovu).toBe(true); expect(i.fertile).toBe(true);
  });
  it("handles no logs / before first log", () => {
    expect(cycleInfo(parseKey("2026-01-01"), m)).toBeNull();
    expect(cycleInfo(parseKey("2026-07-01"), buildModel([]))).toBeNull();
  });
  it("single cycle falls back to defaults", () => {
    const one = buildModel([{ period_start: "2026-08-01", period_end: null }]);
    expect(one.avgLen).toBe(28); expect(one.avgPeriod).toBe(5); expect(one.nextStart.getDate()).toBe(29);
  });
  it("next ovulation is in the future", () => {
    const n = nextOvulation(parseKey("2026-07-19"), m); expect(n > parseKey("2026-07-19")).toBe(true);
  });
});
