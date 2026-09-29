import { describe, expect, it } from "vitest";
import { BALANCE } from "@/content/balance";
import { choiceSource, seasonOf, yearOf } from "@/lib/game/calendar";
import { draw, makeRng } from "@/lib/game/rng";
import { hashState } from "@/lib/game/serialize";
import { MAP_HEIGHT, MAP_WIDTH, TILE_COUNT, Terrain, TRIBE_IDS } from "@/lib/game/types";
import { fallbackWorld, generateWorld } from "@/lib/game/world/generate";
import { buildCostField, dijkstra, landComponents } from "@/lib/game/world/pathfinding";
import { validatePlacement } from "@/lib/game/world/placement";
import { newGame } from "../support/fixtures";

describe("calendar (AC03, AC04)", () => {
  it("alternates player/nature and gives both a turn in every season", () => {
    let player = 0,
      nature = 0;
    for (let t = 1; t <= 100; t++) {
      if (choiceSource(t) === "player") player++;
      else nature++;
    }
    expect(player).toBe(50);
    expect(nature).toBe(50);
    expect(seasonOf(1)).toBe("spring");
    expect(seasonOf(2)).toBe("spring");
    expect(choiceSource(1)).toBe("player");
    expect(choiceSource(2)).toBe("nature");
    for (let t = 1; t <= 100; t += 2) expect(seasonOf(t)).toBe(seasonOf(t + 1));
    expect(seasonOf(7)).toBe("winter");
    expect(yearOf(8)).toBe(1);
    expect(yearOf(9)).toBe(2);
    expect(yearOf(100)).toBe(13);
  });
});

describe("seeded randomness", () => {
  it("keyed draws do not depend on call order", () => {
    const a1 = draw("s", "combat", 3, "ironfang", "windstep");
    makeRng("s", "combat", 1).next();
    const a2 = draw("s", "combat", 3, "ironfang", "windstep");
    expect(a1).toBe(a2);
    expect(draw("s", "combat", 3, "windstep", "ironfang")).not.toBe(a1);
  });
});

describe("world generation", () => {
  it("is deterministic for a seed and independent of the supported tribe (AC02)", () => {
    // Supported tribe is not an input to createInitialState; two games with the same seed must hash equal.
    const a = newGame("same-seed");
    const b = newGame("same-seed");
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(newGame("other-seed"))).not.toBe(hashState(a));
  });

  it("produces a 150×100 map of the four terrains with connected biomes", () => {
    const { world } = generateWorld("biomes");
    expect(world.terrain.length).toBe(MAP_WIDTH * MAP_HEIGHT);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < TILE_COUNT; i++) counts[world.terrain[i] as number]!++;
    for (const c of counts) expect(c).toBeGreaterThan(300);
    // Connected biomes: most tiles share terrain with at least two of their four neighbours.
    let agree = 0;
    for (let y = 1; y < MAP_HEIGHT - 1; y++)
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const i = y * MAP_WIDTH + x;
        const t = world.terrain[i];
        const same = [i - 1, i + 1, i - MAP_WIDTH, i + MAP_WIDTH].filter((n) => world.terrain[n] === t).length;
        if (same >= 2) agree++;
      }
    expect(agree / ((MAP_WIDTH - 2) * (MAP_HEIGHT - 2))).toBeGreaterThan(0.85);
  });

  it("places four viable, separated settlements on one land component across many seeds", () => {
    for (let s = 0; s < 25; s++) {
      const g = generateWorld(`placement-${s}`);
      const { comp } = landComponents(g.world.terrain);
      const comps = new Set(TRIBE_IDS.map((id) => comp[g.settlements[id]]));
      expect(comps.size).toBe(1);
      expect(validatePlacement(g.world, g.settlements).ok).toBe(true);
      const cost = buildCostField(g.world.terrain, null);
      for (const a of TRIBE_IDS) {
        const dm = dijkstra(cost, g.settlements[a], 40);
        for (const b of TRIBE_IDS) if (a !== b) {
          const d = dm.dist[g.settlements[b]] as number;
          if (d !== -1) expect(d).toBeGreaterThanOrEqual(BALANCE.placement.minSeparation);
        }
      }
      // Starting assets: 2 sites for each producer, none for Ironfang; every asset on land and owned.
      const sites = (id: string, kind: string) => g.world.assets.filter((x) => x.owner === id && x.kind === kind).length;
      expect(sites("hearthwood", "farm")).toBe(2);
      expect(sites("windstep", "hunt")).toBe(2);
      expect(sites("stonehaven", "fishery")).toBe(2);
      expect(g.world.assets.filter((x) => x.owner === "ironfang").length).toBe(0);
      for (const a of g.world.assets) {
        expect(g.world.terrain[a.tile]).not.toBe(Terrain.Water);
        expect(g.world.assetAt[a.tile]).toBe(a.id);
      }
    }
  });

  it("has a committed fallback template that is valid for every mirror", () => {
    for (const s of ["a", "b", "c", "d", "e", "f"]) {
      const f = fallbackWorld(s);
      expect(f.usedFallback).toBe(true);
      expect(validatePlacement(f.world, f.settlements).ok).toBe(true);
    }
  });
});
