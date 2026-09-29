import { describe, expect, it } from "vitest";
import { ACTIONS } from "@/content/actions";
import { BALANCE } from "@/content/balance";
import { EVENTS } from "@/content/events";
import { HELP } from "@/content/help";
import { NARRATION } from "@/content/narration";
import { TECHNOLOGIES, TECH_BY_ID } from "@/content/technologies";
import { TRIBES } from "@/content/tribes";
import { validateCatalog } from "@/scripts/catalog-rules";
import { TRIBE_IDS } from "@/lib/game/types";

describe("content catalog (AC17)", () => {
  it("validates with no errors", () => {
    expect(validateCatalog()).toEqual([]);
  });

  it("ships 32 event families with exactly three options (≥96 options)", () => {
    expect(EVENTS.length).toBe(32);
    const ids = EVENTS.map((e) => e.id);
    for (let i = 1; i <= 32; i++) expect(ids).toContain(`E${String(i).padStart(2, "0")}`);
    const options = EVENTS.flatMap((e) => e.options);
    expect(options.length).toBeGreaterThanOrEqual(96);
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
    for (const e of EVENTS) expect(e.options.length).toBe(3);
  });

  it("applies every environmental choice to the whole map", () => {
    for (const e of EVENTS) {
      expect(e.footprint.kind).toBe("world");
      for (const o of e.options) {
        const ops = o.effects.flatMap((x) => (x.op === "delayed" ? x.effects : [x]));
        for (const op of ops) if ("scope" in op) expect(op.scope).toBe("world");
      }
    }
  });

  it("has every option wired to typed effects within bounds, with mechanically distinct options", () => {
    for (const e of EVENTS) {
      const sigs = new Set<string>();
      for (const o of e.options) {
        expect(o.effects.length).toBeGreaterThan(0);
        expect(o.description.length).toBeGreaterThan(10);
        expect(o.duration).toBeLessThanOrEqual(BALANCE.effects.maxDuration);
        sigs.add(JSON.stringify(o.effects));
      }
      expect(sigs.size).toBe(3);
    }
  });

  it("has four tribe profiles, eight technologies, the action catalog, narration, and help", () => {
    expect(Object.keys(TRIBES).sort()).toEqual([...TRIBE_IDS].sort());
    expect(TECHNOLOGIES.length).toBe(8);
    for (const t of TECHNOLOGIES) for (const p of t.prerequisites) expect(TECH_BY_ID[p]).toBeDefined();
    expect(Object.keys(ACTIONS).length).toBe(21);
    expect(Object.keys(NARRATION).length).toBeGreaterThan(20);
    expect(HELP.length).toBeGreaterThanOrEqual(5);
  });
});
