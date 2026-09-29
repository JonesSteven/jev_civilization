import { describe, expect, it } from "vitest";
import { BALANCE } from "@/content/balance";
import { EVENT_BY_ID } from "@/content/events";
import { affordable, buildSnapshot, generateAllCandidates, generateCandidates } from "@/lib/game/candidates";
import { ModifierIndex } from "@/lib/game/effects/modifiers";
import { computeGeo } from "@/lib/game/geo";
import { sitePotential } from "@/lib/game/production";
import { allocate, apportion } from "@/lib/game/resolve/allocation";
import { resolveActions } from "@/lib/game/resolve/actions";
import { scoreTribe, winners } from "@/lib/game/score";
import { hashState } from "@/lib/game/serialize";
import { cloneState, resolveTurn } from "@/lib/game/turn";
import { TILE_COUNT, TRIBE_IDS, Terrain, type ActionCandidate, type ActiveEffect, type GameState, type TribeId } from "@/lib/game/types";
import { newGame, optionFor, step } from "../support/fixtures";

function assertInvariants(s: GameState) {
  const w = s.world;
  for (const id of TRIBE_IDS) {
    const t = s.tribes[id];
    for (const v of [t.population, t.food, t.timber, t.stone]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(t.morale).toBeGreaterThanOrEqual(0);
    expect(t.morale).toBeLessThanOrEqual(100);
    expect(t.militaryLevel).toBeLessThanOrEqual(5);
    expect(t.settlement).toBeGreaterThanOrEqual(0);
    expect(t.settlement).toBeLessThan(TILE_COUNT);
    if (!t.alive) expect(t.population).toBe(0);
  }
  const seen = new Set<number>();
  for (const a of w.assets) {
    expect(seen.has(a.tile)).toBe(false);
    seen.add(a.tile);
    expect(w.assetAt[a.tile]).toBe(a.id);
    expect(w.terrain[a.tile]).not.toBe(Terrain.Water);
    if (a.owner) expect(s.tribes[a.owner].alive).toBe(true);
    if (a.kind === "housing") expect(a.condition).toBeGreaterThanOrEqual(0);
  }
  for (let i = 0; i < TILE_COUNT; i++) {
    const o = w.owner[i] as number;
    expect(o).toBeGreaterThanOrEqual(-1);
    expect(o).toBeLessThan(4);
    if (o >= 0) expect(s.tribes[TRIBE_IDS[o] as TribeId].alive).toBe(true);
    for (const r of ["forage", "wildlife", "fish", "timber", "stone"] as const) {
      expect(w.stock[r][i]).toBeGreaterThanOrEqual(0);
      expect(w.stock[r][i]!).toBeLessThanOrEqual((w.cap[r][i] as number) + 1e-3);
    }
  }
  for (const e of s.activeEffects) expect(e.remaining).toBeLessThanOrEqual(BALANCE.effects.maxDuration);
}

describe.each([50, 200])("full %i-turn match with the mock policy", (length) => {
  it("runs every turn, preserves invariants, and replays deterministically from recorded decisions (AC03, AC24)", () => {
    let s = newGame("full-match", length);
    const history: { option: string; choices: Partial<Record<TribeId, string>>; hash: string }[] = [];
    const start = cloneState(s);
    for (let turn = 1; turn <= length; turn++) {
      expect(s.currentEvent?.turn).toBe(turn);
      const option = optionFor(s, turn);
      const r = step(s, {}, turn);
      const choices: Partial<Record<TribeId, string>> = {};
      for (const id of TRIBE_IDS) {
        const last = r.state.tribes[id].recentActions.at(-1);
        if (last && last.turn === turn) choices[id] = last.label;
      }
      s = r.state;
      assertInvariants(s);
      history.push({ option, choices, hash: hashState(s) });
    }
    expect(s.completedTurn).toBe(length);
    expect(s.currentEvent).toBeNull();
    // Exact recorded replay: same inputs reproduce every state hash.
    let replay = start;
    for (const h of history) {
      replay = resolveTurn(replay, h.option, h.choices).state;
      expect(hashState(replay)).toBe(h.hash);
    }
  }, 300_000);
});

describe("simultaneous resolution", () => {
  it("does not depend on the order of the choices or candidate objects (AC07)", () => {
    const s = newGame("order");
    const option = optionFor(s);
    const snap = buildSnapshot(s, option);
    const cands = generateAllCandidates(snap);
    const pick: Partial<Record<TribeId, string>> = {};
    for (const id of TRIBE_IDS) {
      const raid = cands[id]!.find((c) => c.kind === "raid");
      pick[id] = raid?.id ?? cands[id]!.find((c) => c.kind === "gather_food")?.id ?? "rest";
    }
    const forward = resolveTurn(s, option, pick, cands);
    const reversedChoices = Object.fromEntries(Object.entries(pick).reverse());
    const reversedCands = Object.fromEntries(Object.entries(cands).reverse());
    const backward = resolveTurn(s, option, reversedChoices, reversedCands);
    expect(hashState(backward.state)).toBe(hashState(forward.state));
  });

  it("allocates shared pools proportionally regardless of demand order", () => {
    const stockA = new Float32Array([10, 10, 0, 0]);
    const stockB = new Float32Array([10, 10, 0, 0]);
    const d1 = { key: "a", amount: 30, tiles: [0, 1] };
    const d2 = { key: "b", amount: 10, tiles: [0, 1] };
    const g1 = allocate(stockA, [d1, d2]);
    const g2 = allocate(stockB, [d2, d1]);
    expect(g1.get("a")).toBeCloseTo(g2.get("a")!, 6);
    expect(g1.get("b")).toBeCloseTo(g2.get("b")!, 6);
    expect((g1.get("a") ?? 0) + (g1.get("b") ?? 0)).toBeCloseTo(20, 4);
    // Requests are capped at what each demand could reach (30 → 20), then scaled equally: 20:10.
    expect(g1.get("a")! / g1.get("b")!).toBeCloseTo(2, 4);
    expect(stockA[0]).toBeCloseTo(0, 5);
  });

  it("apportions integers with no loss and keyed tie-breaking", () => {
    const shares = apportion(10, [{ key: "x", weight: 1 }, { key: "y", weight: 1 }, { key: "z", weight: 1 }], (k) => (k === "y" ? 0.9 : 0.1));
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(10);
    expect(shares.get("y")).toBe(4);
  });
});

describe("economy and development", () => {
  it("keeps existing food sites producing while the tribe trains (AC08)", () => {
    const s = newGame("sites-keep");
    const r = step(s, { hearthwood: "train", windstep: "train", stonehaven: "train", ironfang: "rest" });
    expect(r.reports.hearthwood.farm).toBeGreaterThan(0);
    expect(r.reports.windstep.hunt).toBeGreaterThan(0);
    expect(r.reports.stonehaven.fish).toBeGreaterThan(0);
    expect(r.state.tribes.hearthwood.militaryLevel).toBe(1);
  });

  it("pauses and resumes research, charges once, and unlocks mechanics (AC09)", () => {
    let s = newGame("research");
    const before = cloneState(s).tribes.hearthwood;
    let r = step(s, { hearthwood: "research_masonry" });
    s = r.state;
    expect(s.tribes.hearthwood.project).toMatchObject({ techId: "masonry", progress: 1, required: 2 });
    expect(r.state.tribes.hearthwood.stone).toBeLessThanOrEqual(before.stone - 20 + BALANCE.production.routineStone);
    r = step(s, { hearthwood: "rest" });
    s = r.state;
    expect(s.tribes.hearthwood.project?.progress).toBe(1);
    expect(s.tribes.hearthwood.memory.some((m) => m.kind === "research")).toBe(true);
    const stoneBefore = s.tribes.hearthwood.stone;
    r = step(s, { hearthwood: "research_continue" });
    s = r.state;
    expect(s.tribes.hearthwood.learned).toContain("masonry");
    expect(s.tribes.hearthwood.project).toBeNull();
    expect(s.tribes.hearthwood.stone).toBeGreaterThanOrEqual(stoneBefore);
    s.tribes.hearthwood.stone = 100;
    s.tribes.hearthwood.timber = 100;
    const snap = buildSnapshot(s, optionFor(s));
    const cands = generateCandidates(snap, "hearthwood");
    // Masonry unlocks stone housing (not innate for Hearthwood).
    expect(cands.some((c) => c.id.startsWith("housing_wood_at_"))).toBe(true);
    expect(cands.some((c) => c.id.startsWith("housing_stone_at_"))).toBe(true);
  });

  it("applies the starvation formula from measured food", () => {
    const s = newGame("starve");
    s.tribes.ironfang.food = 50;
    const pop = s.tribes.ironfang.population;
    const r = step(s, { hearthwood: "rest", windstep: "rest", stonehaven: "rest", ironfang: "rest" });
    // Ironfang has no production: requirement = population, 50 eaten → starvation = ceil(pop × deficit × 0.1).
    const expected = Math.ceil(pop * ((pop - 50) / pop) * BALANCE.population.starvationRate);
    expect(r.reports.ironfang.starvation).toBe(expected);
    expect(r.state.tribes.ironfang.population).toBe(pop - expected);
    expect(r.state.tribes.ironfang.food).toBe(0);
  });

  it("applies winter exposure to unsheltered people", () => {
    let s = newGame("winter");
    const rest = { hearthwood: "rest", windstep: "rest", stonehaven: "rest", ironfang: "rest" } as const;
    for (let i = 0; i < 6; i++) s = step(s, rest).state;
    expect(s.currentEvent?.turn).toBe(7);
    s.tribes.hearthwood.population = 400;
    s.tribes.hearthwood.food = 5000;
    const r = step(s, rest);
    expect(r.reports.hearthwood.exposure).toBeGreaterThanOrEqual(Math.floor((400 - 60) * 0.02) - 1);
    expect(r.outcomes.some((o) => o.kind === "exposure" && o.tribeId === "hearthwood")).toBe(true);
  });

  it("eliminates a tribe at zero population; ruins stop producing and it scores zero (AC11)", () => {
    const s = newGame("eliminate");
    s.tribes.ironfang.population = 1;
    s.tribes.ironfang.food = 0;
    const r = step(s, { hearthwood: "rest", windstep: "rest", stonehaven: "rest", ironfang: "rest" });
    expect(r.eliminated).toContain("ironfang");
    expect(r.state.tribes.ironfang.alive).toBe(false);
    expect(r.scores.ironfang.total).toBe(0);
    for (let i = 0; i < TILE_COUNT; i++) expect(r.state.world.owner[i]).not.toBe(TRIBE_IDS.indexOf("ironfang"));
    const next = step(r.state);
    expect(next.reports.ironfang.foodTotal).toBe(0);
  });
});

describe("raids and recruitment (AC25)", () => {
  function findDoubleRaid(): { s: GameState; target: TribeId; attackers: TribeId[] } {
    for (let n = 0; n < 40; n++) {
      const s = newGame(`raid-${n}`);
      for (const id of TRIBE_IDS) s.tribes[id].militaryLevel = 3;
      const snap = buildSnapshot(s, optionFor(s));
      const cands = generateAllCandidates(snap);
      const byTarget = new Map<TribeId, TribeId[]>();
      for (const id of TRIBE_IDS)
        for (const c of cands[id] ?? []) if (c.kind === "raid" && c.target?.type === "settlement") byTarget.set(c.target.tribeId, [...(byTarget.get(c.target.tribeId) ?? []), id]);
      for (const [target, attackers] of byTarget) if (attackers.length >= 2) return { s, target, attackers: attackers.slice(0, 2) };
    }
    throw new Error("no double-raid fixture found");
  }

  it("shares one loot budget among successful raiders and never duplicates stocks", () => {
    const { s, target, attackers } = findDoubleRaid();
    s.tribes[target].militaryLevel = 0;
    const snap = buildSnapshot(s, optionFor(s));
    const cands = generateAllCandidates(snap);
    const chosen: Partial<Record<TribeId, ActionCandidate>> = {};
    for (const id of TRIBE_IDS) {
      const list = cands[id] ?? [];
      chosen[id] = attackers.includes(id) ? list.find((c) => c.id === `raid_${target}`)! : list.find((c) => c.id === "rest")!;
    }
    const next = cloneState(s);
    const outcomes: never[] = [];
    resolveActions(next, snap, chosen, 1, outcomes, new Set());
    for (const res of ["food", "timber", "stone"] as const) {
      const before = TRIBE_IDS.reduce((a, id) => a + s.tribes[id][res], 0);
      const after = TRIBE_IDS.reduce((a, id) => a + next.tribes[id][res], 0);
      const costs = res === "food" ? attackers.length * BALANCE.actions.raid.cost.food : 0;
      expect(after).toBe(before - costs);
      expect(s.tribes[target][res] - next.tribes[target][res]).toBeLessThanOrEqual(BALANCE.combat.loot[res]);
    }
    const popBefore = TRIBE_IDS.reduce((a, id) => a + s.tribes[id].population, 0);
    const popAfter = TRIBE_IDS.reduce((a, id) => a + next.tribes[id].population, 0);
    expect(popAfter).toBeLessThanOrEqual(popBefore);
    // Same inputs, different construction order → identical result.
    const again = cloneState(s);
    const reversed = Object.fromEntries(Object.entries(chosen).reverse()) as typeof chosen;
    resolveActions(again, snap, reversed, 1, [], new Set());
    expect(hashState(again)).toBe(hashState(next));
  });

  it("transfers recruits without creating people", () => {
    for (let n = 0; n < 40; n++) {
      const s = newGame(`recruit-${n}`);
      for (const id of TRIBE_IDS) {
        s.tribes[id].food = 400;
        s.tribes[id].camp = { capacity: 80, condition: 100 };
      }
      const source: TribeId = "ironfang";
      s.tribes[source].food = 10;
      const snap = buildSnapshot(s, optionFor(s));
      const cands = generateAllCandidates(snap);
      const recruiter = TRIBE_IDS.find((id) => cands[id]?.some((c) => c.id === `recruit_${source}`));
      if (!recruiter) continue;
      const chosen: Partial<Record<TribeId, ActionCandidate>> = {};
      for (const id of TRIBE_IDS) chosen[id] = cands[id]!.find((c) => c.id === (id === recruiter ? `recruit_${source}` : "rest"))!;
      const next = cloneState(s);
      resolveActions(next, snap, chosen, 1, [], new Set());
      const total = (st: GameState) => TRIBE_IDS.reduce((a, id) => a + st.tribes[id].population, 0);
      expect(total(next)).toBe(total(s));
      expect(next.tribes[recruiter].population).toBeGreaterThan(s.tribes[recruiter].population);
      expect(next.tribes[source].population).toBeGreaterThanOrEqual(1);
      return;
    }
    throw new Error("no recruitment fixture found");
  });
});

describe("candidates", () => {
  it("always include Rest, stay within the cap, and are affordable from the snapshot", () => {
    for (const seed of ["c1", "c2", "c3"]) {
      let s = newGame(seed);
      for (let t = 0; t < 12; t++) {
        const snap = buildSnapshot(s, optionFor(s, t));
        for (const id of TRIBE_IDS) {
          if (!s.tribes[id].alive) continue;
          const list = generateCandidates(snap, id);
          expect(list.some((c) => c.id === "rest")).toBe(true);
          expect(list.length).toBeLessThanOrEqual(BALANCE.actions.maxCandidates);
          expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
          for (const c of list) expect(affordable(s, id, c.costs)).toBe(true);
          if (s.tribes[id].militaryLevel < 1) expect(list.some((c) => c.kind === "raid")).toBe(false);
        }
        s = step(s, {}, t).state;
      }
    }
  });

  it("does not offer Ironfang food gathering until it learns Agriculture or Fishing", () => {
    const s = newGame("iron-food");
    const snap = buildSnapshot(s, optionFor(s));
    expect(generateCandidates(snap, "ironfang").some((c) => c.kind === "gather_food")).toBe(false);
    s.tribes.ironfang.learned = ["fishing"];
    const snap2 = buildSnapshot(s, optionFor(s));
    expect(generateCandidates(snap2, "ironfang").some((c) => c.kind === "gather_food")).toBe(true);
  });
});

describe("environment effects", () => {
  function fakeEffect(op: ActiveEffect["op"], remaining = 2): ActiveEffect {
    return { id: `t${Math.random()}`, sourceEventId: "E02", sourceOptionId: "E02_bitter", label: "test", op, footprint: null, activatedTurn: 1, remaining };
  }

  it("bounds stacked modifiers to 0.25–2.0", () => {
    const s = newGame("stack");
    const low = new ModifierIndex(s, Array.from({ length: 5 }, () => fakeEffect({ op: "yieldMult", channel: "farm", factor: 0.5, scope: "world", duration: 2 })));
    expect(low.yieldMultiplier("farm", 0, false)).toBe(0.25);
    const high = new ModifierIndex(s, Array.from({ length: 3 }, () => fakeEffect({ op: "yieldMult", channel: "farm", factor: 2, scope: "world", duration: 2 })));
    expect(high.yieldMultiplier("farm", 0, false)).toBe(2);
    const dry = new ModifierIndex(s, [fakeEffect({ op: "dryFarm", factor: 0.5, scope: "world", duration: 2 })]);
    expect(dry.yieldMultiplier("farm", 0, true)).toBe(BALANCE.production.irrigationDryFloor);
  });

  it("an event can harm one tribe's food source while leaving another's unchanged", () => {
    const s = newGame("asym");
    const base = new ModifierIndex(s, []);
    const bitter = new ModifierIndex(s, [fakeEffect({ op: "yieldMult", channel: "fish", factor: 0.6, scope: "world", duration: 2 })]);
    const fishery = s.world.assets.find((a) => a.owner === "stonehaven" && a.kind === "fishery")!;
    const farm = s.world.assets.find((a) => a.owner === "hearthwood" && a.kind === "farm")!;
    expect(sitePotential(s, "stonehaven", fishery, "winter", bitter)).toBeCloseTo(sitePotential(s, "stonehaven", fishery, "winter", base) * 0.6, 5);
    expect(sitePotential(s, "hearthwood", farm, "winter", bitter)).toBe(sitePotential(s, "hearthwood", farm, "winter", base));
  });

  it("a duration-2 effect applies on activation and the next turn, then expires", () => {
    let s = newGame("duration");
    for (let i = 0; i < 20; i++) {
      const ev = s.currentEvent!;
      const idx = EVENT_BY_ID[ev.eventId]!.options.findIndex((o) => o.duration === 2 && o.effects.some((e) => e.op === "yieldMult"));
      if (ev.source === "player" && idx >= 0) {
        const r = step(s, {}, idx);
        const mine = r.state.activeEffects.filter((e) => e.activatedTurn === ev.turn && e.op.op === "yieldMult");
        expect(mine.length).toBeGreaterThan(0);
        for (const e of mine) expect(e.remaining).toBe(1);
        const r2 = step(r.state);
        expect(r2.state.activeEffects.filter((e) => e.activatedTurn === ev.turn && e.op.op === "yieldMult").length).toBe(0);
        return;
      }
      s = step(s, {}, 0).state;
    }
    throw new Error("no duration-2 event found");
  });
});

describe("scoring (AC11)", () => {
  it("matches the documented formula at the start", () => {
    const s = newGame("score");
    const mods = new ModifierIndex(s, []);
    const geo = computeGeo(s, mods.travelDelta("spring"));
    const sc = scoreTribe(s, "hearthwood", geo.hearthwood);
    const S = BALANCE.score;
    expect(sc.population).toBeCloseTo(S.population.weight * Math.min(s.tribes.hearthwood.population / S.population.target, 1), 6);
    expect(sc.resilience).toBeCloseTo(25 * (0.6 * 1 + 0.4 * 1), 6);
    expect(sc.development).toBe(0);
    expect(sc.influence).toBeGreaterThan(0);
    expect(sc.influence).toBeLessThanOrEqual(S.influence.weight * (BALANCE.placement.startTerritoryTiles / S.influence.tiles) + 1e-9);
  });

  it("treats an exact highest-score tie as a shared victory", () => {
    const z = { population: 0, resilience: 0, development: 0, influence: 0, total: 0 };
    const w = winners({ hearthwood: { ...z, total: 50 }, windstep: { ...z, total: 50 }, stonehaven: { ...z, total: 49.9 }, ironfang: z });
    expect(w.sort()).toEqual(["hearthwood", "windstep"]);
    expect(winners({ hearthwood: z, windstep: z, stonehaven: z, ironfang: z })).toEqual([]);
  });
});
