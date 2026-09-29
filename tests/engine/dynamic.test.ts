import { describe, expect, it } from "vitest";
import { BALANCE } from "@/content/balance";
import { CONTENT_VERSION, contentHash } from "@/content/index";
import { buildSnapshot, generateCandidates } from "@/lib/game/candidates";
import { capturableBorderTiles, settlementBuffer } from "@/lib/game/settlements";
import { TILE_COUNT, TRIBE_IDS, type GameState, type TribeId } from "@/lib/game/types";
import { createInitialState } from "@/lib/game/world/generate";
import { buildCostField, dijkstra } from "@/lib/game/world/pathfinding";
import { newGame, optionFor, step } from "../support/fixtures";

const REST = { hearthwood: "rest", windstep: "rest", stonehaven: "rest", ironfang: "rest" } as const;

function scoutedGame(): { s: GameState; tribe: TribeId } {
  for (let n = 0; n < 20; n++) {
    const s0 = newGame(`scout-${n}`);
    for (const tribe of TRIBE_IDS) {
      const r = step(s0, { ...REST, [tribe]: "send_scouts" });
      if (r.state.tribes[tribe].scoutedSites.length > 0) return { s: r.state, tribe };
    }
  }
  throw new Error("no scouting fixture found");
}

describe("scouts and additional settlements", () => {
  it("scouting reports usable sites; founding creates an outpost with territory", () => {
    const { s, tribe } = scoutedGame();
    const site = s.tribes[tribe].scoutedSites[0]!;
    expect(settlementBuffer(s)[site.tile]).toBe(0);
    expect(s.tribes[tribe].memory.some((m) => m.kind === "scouting")).toBe(true);
    const snap = buildSnapshot(s, optionFor(s));
    const found = generateCandidates(snap, tribe).find((c) => c.id === `found_settlement_at_${site.tile}`);
    expect(found).toBeDefined();
    const campBefore = s.tribes[tribe].camp?.capacity ?? 0;
    const r = step(s, { ...REST, [tribe]: found!.id });
    const t = r.state.tribes[tribe];
    expect(t.outposts).toEqual([site.tile]);
    expect(t.camp?.capacity).toBe(campBefore + BALANCE.actions.found.campCapacity);
    expect(r.state.world.owner[site.tile]).toBe(TRIBE_IDS.indexOf(tribe));
    // The outpost is at least the minimum separation from every other settlement.
    const others = TRIBE_IDS.flatMap((id) => [r.state.tribes[id].settlement, ...r.state.tribes[id].outposts]).filter((x) => x !== site.tile);
    const dm = dijkstra(buildCostField(r.state.world.terrain, null), site.tile, BALANCE.placement.minSeparation);
    for (const o of others) {
      const d = dm.dist[o] as number;
      if (d !== -1) expect(d).toBeGreaterThanOrEqual(BALANCE.placement.minSeparation - 1);
    }
  });

  it("two tribes founding on the same site both fail and are refunded", () => {
    const { s, tribe } = scoutedGame();
    const site = s.tribes[tribe].scoutedSites[0]!;
    const other = TRIBE_IDS.find((id) => id !== tribe && s.tribes[id].alive)!;
    s.tribes[other].scoutedSites = [{ ...site }];
    const snap = buildSnapshot(s, optionFor(s));
    const id = `found_settlement_at_${site.tile}`;
    expect(generateCandidates(snap, other).some((c) => c.id === id)).toBe(true);
    const before = { a: s.tribes[tribe].timber, b: s.tribes[other].timber };
    const r = step(s, { ...REST, [tribe]: id, [other]: id });
    expect(r.state.tribes[tribe].outposts).toEqual([]);
    expect(r.state.tribes[other].outposts).toEqual([]);
    expect(r.outcomes.filter((o) => o.kind === "found_conflict").length).toBe(2);
    // Refunded: timber did not drop by the founding cost (it can only rise from routine collection).
    expect(r.state.tribes[tribe].timber).toBeGreaterThanOrEqual(before.a);
    expect(r.state.tribes[other].timber).toBeGreaterThanOrEqual(before.b);
  });
});

describe("shifting borders", () => {
  it("organic growth claims only unowned tiles and never takes another tribe's land", () => {
    let s = newGame("growth");
    let grew = 0;
    for (let i = 0; i < 6; i++) {
      const before = Int8Array.from(s.world.owner);
      const r = step(s, REST);
      for (let t = 0; t < TILE_COUNT; t++) {
        const b = before[t] as number;
        const a = r.state.world.owner[t] as number;
        if (b >= 0) expect(a).toBe(b);
        if (b === -1 && a >= 0) grew++;
      }
      s = r.state;
    }
    expect(grew).toBeGreaterThan(20);
    expect(s.tribes.hearthwood.population).toBeGreaterThan(100);
  });

  it("raids capture only building-free defender border tiles that touch the attacker", () => {
    const s = newGame("capture");
    const d = TRIBE_IDS.indexOf("windstep");
    const a = TRIBE_IDS.indexOf("ironfang");
    // Put an attacker tile beside every windstep border tile to create a shared border.
    const border: number[] = [];
    for (let t = 0; t < TILE_COUNT; t++) {
      if (s.world.owner[t] !== d) continue;
      for (const n of [t - 1, t + 1, t - 150, t + 150]) {
        if (n >= 0 && n < TILE_COUNT && s.world.owner[n] === -1 && s.world.terrain[n] !== 0) {
          s.world.owner[n] = a;
          border.push(t);
          break;
        }
      }
    }
    const tiles = capturableBorderTiles(s, "ironfang", "windstep", BALANCE.territory.raidCaptureTiles);
    expect(tiles.length).toBe(BALANCE.territory.raidCaptureTiles);
    for (const t of tiles) {
      expect(s.world.owner[t]).toBe(d);
      expect(s.world.assetAt[t]).toBe(-1);
      expect(t).not.toBe(s.tribes.windstep.settlement);
      expect(border).toContain(t);
    }
  });
});

describe("match length", () => {
  it("accepts 10–200 turns and rejects anything else", () => {
    expect(createInitialState("len", CONTENT_VERSION, contentHash(), 10).totalTurns).toBe(10);
    expect(createInitialState("len", CONTENT_VERSION, contentHash(), 200).totalTurns).toBe(200);
    expect(() => createInitialState("len", CONTENT_VERSION, contentHash(), 5)).toThrow();
    expect(() => createInitialState("len", CONTENT_VERSION, contentHash(), 201)).toThrow();
  });

  it("finishes exactly at the chosen length", () => {
    let s = newGame("short", 10);
    for (let i = 0; i < 10; i++) s = step(s).state;
    expect(s.completedTurn).toBe(10);
    expect(s.currentEvent).toBeNull();
  });
});
