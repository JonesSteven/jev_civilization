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

  it("ships 33 event families with exactly three options (≥99 options)", () => {
    expect(EVENTS.length).toBe(33);
    const ids = EVENTS.map((e) => e.id);
    for (let i = 1; i <= 33; i++) expect(ids).toContain(`E${String(i).padStart(2, "0")}`);
    const options = EVENTS.flatMap((e) => e.options);
    expect(options.length).toBeGreaterThanOrEqual(99);
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
    for (const e of EVENTS) expect(e.options.length).toBe(3);
  });

  it("scopes regional families to their area and world families to the whole map", () => {
    const regional = EVENTS.filter((e) => e.footprint.kind !== "world");
    expect(regional.length).toBeGreaterThanOrEqual(12);
    expect(EVENTS.length - regional.length).toBeGreaterThanOrEqual(12);
    for (const e of EVENTS) {
      const wanted = e.footprint.kind === "world" ? "world" : "footprint";
      for (const o of e.options) {
        const ops = o.effects.flatMap((x) => (x.op === "delayed" ? x.effects : [x]));
        for (const op of ops) if ("scope" in op) expect(op.scope).toBe(wanted);
      }
    }
  });

  it("includes a sickness family and at least one severe option in most regional families", () => {
    expect(EVENTS.some((e) => e.options.some((o) => o.effects.some((x) => x.op === "epidemic")))).toBe(true);
    const regional = EVENTS.filter((e) => e.footprint.kind !== "world");
    const withHarsh = regional.filter((e) => e.options.some((o) => o.tone === "harsh"));
    expect(withHarsh.length / regional.length).toBeGreaterThan(0.6);
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
    expect(Object.keys(ACTIONS).length).toBe(23);
    expect(Object.keys(NARRATION).length).toBeGreaterThan(20);
    expect(HELP.length).toBeGreaterThanOrEqual(5);
  });
});
