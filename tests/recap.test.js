import { describe, it, expect } from "vitest";
import { buildRecap } from "../lib/recap.js";
const cats = [{ id: "f", name: "Food", emoji: "🍜" }, { id: "b", name: "Bills", emoji: "💡" }];
const goals = [{ id: "g1", name: "Hunza trip", emoji: "🏔" }];
const E = (amount, category_id, note = "") => ({ kind: "expense", amount, category_id, note });
describe("recap", () => {
  it("summarises the month and celebrates a real win", () => {
    const r = buildRecap({ monthKey: "2026-07", categories: cats, goals,
      entries: [E(18000, "f"), E(21000, "b", "internet + electricity"), { kind: "moment" }],
      prevEntries: [E(25000, "f"), E(20000, "b")],
      contribs: [{ goal_id: "g1", amount: 30000 }], prevContribs: [{ goal_id: "g1", amount: 10000 }], bestContribBefore: 20000 });
    expect(r.total).toBe(39000);
    expect(r.topCat.name).toBe("Bills");
    expect(r.biggest.amount).toBe(21000);
    expect(r.goalLines[0]).toEqual({ name: "Hunza trip", emoji: "🏔", amount: 30000 });
    expect(r.cheer).toMatch(/best saving month/);
  });
  it("falls back to a category drop, then a kind line — never blame", () => {
    const r = buildRecap({ monthKey: "2026-07", categories: cats, goals, entries: [E(9000, "f")], prevEntries: [E(12000, "f")], contribs: [], prevContribs: [] });
    expect(r.cheer).toMatch(/Food down 25%/);
    const r2 = buildRecap({ monthKey: "2026-07", categories: cats, goals, entries: [E(13000, "f")], prevEntries: [E(12000, "f")], contribs: [], prevContribs: [] });
    expect(r2.cheer).not.toMatch(/up|more|over/);
  });
  it("empty month", () => {
    const r = buildRecap({ monthKey: "2026-07", categories: cats, goals, entries: [], prevEntries: [], contribs: [], prevContribs: [] });
    expect(r.total).toBe(0); expect(r.topCat).toBeNull(); expect(r.cheer).toBeTruthy();
  });
});
