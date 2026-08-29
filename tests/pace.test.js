import { describe, it, expect } from "vitest";
import { paceLine } from "../lib/pace.js";
const now = new Date(2026, 7, 28);
describe("paceLine is kind in every branch", () => {
  const cases = [
    paceLine({ saved: 0, target: 100000 }, now),
    paceLine({ saved: 50000, target: 100000 }, now),
    paceLine({ saved: 90000, target: 100000 }, now),
    paceLine({ saved: 20000, target: 300000, target_date: "2026-12-20" }, now),
    paceLine({ saved: 290000, target: 300000, target_date: "2026-12-20" }, now),
    paceLine({ saved: 1000, target: 300000, target_date: "2026-01-01" }, now),
    paceLine({ saved: 1000, target: 300000, target_date: "2026-09-05" }, now),
    paceLine({ saved: 300000, target: 300000 }, now),
  ];
  it("never scolds", () => {
    for (const c of cases) {
      expect(c).toBeTruthy();
      expect(c).not.toMatch(/behind|late|fail|over|missed|only|should/i);
    }
  });
  it("gives a weekly number when there's a date", () => {
    expect(cases[3]).toMatch(/\/week/);
    expect(cases[3]).toMatch(/December/);
  });
  it("handles a passed date softly", () => expect(cases[5]).toMatch(/no rush/));
  it("celebrates full", () => expect(cases[7]).toMatch(/🎉/));
});
