import { describe, expect, it } from "vitest";
import { BALANCE, SCALE } from "@/content/balance";
import { buildSnapshot, generateCandidates } from "@/lib/game/candidates";
import { impactContext, optionImpact } from "@/lib/game/impact";
import { EVENT_BY_ID } from "@/content/events";
import { researchEffort } from "@/lib/game/stats";
import { growthPhrase, shareOfPeople } from "@/lib/game/summary";
import { isMatchOver } from "@/lib/game/turn";
import { TILE_COUNT, TRIBE_IDS, type GameState, type TribeId } from "@/lib/game/types";
import { newGame, optionFor, step } from "../support/fixtures";

const REST = { hearthwood: "rest", windstep: "rest", stonehaven: "rest", ironfang: "rest" } as const;

function ownsTiles(s: GameState, id: TribeId): number {
  let n = 0;
  const idx = TRIBE_IDS.indexOf(id);
  for (let i = 0; i < TILE_COUNT; i++) if (s.world.owner[i] === idx) n++;
  return n;
}

/** Put a plague (or another option) of E33 over the whole land for the next turn. */
function withSickness(s: GameState) {
  const turn = s.completedTurn + 1;
  s.currentEvent = { turn, eventId: "E33", source: "player", footprint: null, footprintLabel: "the whole land", natureOptionId: null, fallback: false };
  return s;
}

describe("collapse", () => {
  it("a tribe below the collapse threshold breaks apart, leaving ruins and no land", () => {
    const s = newGame("collapse");
    s.tribes.ironfang.population = BALANCE.population.collapseBelow - 1;
    s.tribes.ironfang.food = 100 * SCALE;
    const r = step(s, REST);
    const t = r.state.tribes.ironfang;
    expect(r.eliminated).toContain("ironfang");
    expect(t.alive).toBe(false);
    expect(t.fate).toBe("collapsed");
    expect(t.population).toBe(0);
    expect(ownsTiles(r.state, "ironfang")).toBe(0);
    expect(r.summary.headline).toMatch(/Ironfang was wiped out/);
  });
});

describe("unions", () => {
  function unionFixture(): GameState {
    for (let n = 0; n < 30; n++) {
      const s = newGame(`union-${n}`);
      s.tribes.hearthwood.population = 6000;
      s.tribes.hearthwood.food = 60_000;
      s.tribes.windstep.population = 1000;
      s.tribes.windstep.food = 100; // under one turn of food: declining
      const cands = generateCandidates(buildSnapshot(s, optionFor(s)), "hearthwood");
      if (cands.some((c) => c.id === "offer_union_windstep")) return s;
    }
    throw new Error("no union fixture found");
  }

  it("is only offered to a declining tribe at least the minimum size and a quarter of ours", () => {
    const s = unionFixture();
    s.tribes.windstep.population = BALANCE.union.minPopulation - 1;
    expect(generateCandidates(buildSnapshot(s, optionFor(s)), "hearthwood").some((c) => c.kind === "offer_union")).toBe(false);
    s.tribes.windstep.population = Math.floor(6000 / BALANCE.union.sizeRatio) + 1;
    expect(generateCandidates(buildSnapshot(s, optionFor(s)), "hearthwood").some((c) => c.kind === "offer_union")).toBe(false);
  });

  it("an offer accepted on a later turn merges the smaller tribe into the larger one", () => {
    let s = unionFixture();
    const tilesBefore = ownsTiles(s, "hearthwood") + ownsTiles(s, "windstep");
    let r = step(s, { ...REST, hearthwood: "offer_union_windstep" });
    s = r.state;
    expect(s.unionOffers).toEqual([{ from: "hearthwood", to: "windstep", turn: 1 }]);
    const smallCands = generateCandidates(buildSnapshot(s, optionFor(s)), "windstep");
    expect(smallCands.some((c) => c.id === "accept_union_hearthwood")).toBe(true);
    const joining = Math.floor(s.tribes.windstep.population * BALANCE.union.joinShare);
    const bigBefore = s.tribes.hearthwood.population;
    const windstepSettlement = s.tribes.windstep.settlement;
    r = step(s, { ...REST, windstep: "accept_union_hearthwood" });
    const w = r.state.tribes.windstep;
    expect(w.alive).toBe(false);
    expect(w.fate).toBe("joined");
    expect(w.absorbedBy).toBe("hearthwood");
    expect(ownsTiles(r.state, "windstep")).toBe(0);
    expect(ownsTiles(r.state, "hearthwood")).toBeGreaterThanOrEqual(tilesBefore);
    expect(r.state.tribes.hearthwood.outposts).toContain(windstepSettlement);
    // The joining people arrive before the economy; births and hunger then move the total a little.
    expect(r.state.tribes.hearthwood.population).toBeGreaterThan(bigBefore + joining * 0.8);
    expect(r.summary.headline).toMatch(/Windstep joined Hearthwood/);
    expect(r.state.unionOffers).toEqual([]);
  });

  it("offers expire after the stated number of turns", () => {
    let s = unionFixture();
    s = step(s, { ...REST, hearthwood: "offer_union_windstep" }).state;
    for (let i = 0; i < BALANCE.union.offerTurns; i++) {
      s.tribes.windstep.food = 10 * SCALE;
      s = step(s, REST).state;
    }
    if (!s.tribes.windstep.alive) return;
    expect(generateCandidates(buildSnapshot(s, optionFor(s)), "windstep").some((c) => c.kind === "accept_union")).toBe(false);
  });
});

describe("conquest", () => {
  it("a successful raid by a far larger tribe conquers a remnant below the union minimum", () => {
    for (let n = 0; n < 60; n++) {
      const s = newGame(`conquest-${n}`);
      s.tribes.ironfang.population = 5000;
      s.tribes.ironfang.militaryLevel = 5;
      s.tribes.ironfang.food = 50_000;
      const target = TRIBE_IDS.find((id) => id !== "ironfang" && generateCandidates(buildSnapshot(s, optionFor(s)), "ironfang").some((c) => c.id === `raid_${id}`));
      if (!target) continue;
      s.tribes[target].population = BALANCE.union.minPopulation - 20;
      const r = step(s, { ...REST, ironfang: `raid_${target}` });
      const t = r.state.tribes[target];
      if (t.fate !== "conquered") continue;
      expect(t.alive).toBe(false);
      expect(t.absorbedBy).toBe("ironfang");
      expect(ownsTiles(r.state, target)).toBe(0);
      expect(r.summary.headline).toMatch(/was conquered by Ironfang/);
      return;
    }
    throw new Error("no conquest fixture found");
  });
});

describe("epidemics", () => {
  it("settled farmers lose far fewer people than hunters to the same plague", () => {
    const s = withSickness(newGame("plague"));
    for (const id of TRIBE_IDS) s.tribes[id].food = 100 * SCALE;
    const before = { hearthwood: s.tribes.hearthwood.population, windstep: s.tribes.windstep.population };
    const r = step(s, REST, 2);
    const died = (id: TribeId) => -r.outcomes.filter((o) => o.kind === "epidemic" && o.tribeId === id).reduce((a, o) => a + (o.amounts?.population ?? 0), 0);
    expect(died("windstep")).toBe(Math.round(before.windstep * 0.4 * BALANCE.diseaseResistance.windstep));
    expect(died("hearthwood")).toBe(Math.round(before.hearthwood * 0.4 * BALANCE.diseaseResistance.hearthwood));
    expect(died("hearthwood")).toBeLessThan(died("windstep"));
  });

  it("every event card offers choices that matter to at least one tribe", () => {
    let events = 0;
    let allEmpty = 0;
    let options = 0;
    let emptyOptions = 0;
    for (let g = 0; g < 6; g++) {
      let s = newGame(`impact-${g}`, 100);
      for (let t = 1; t <= 40 && s.currentEvent; t++) {
        const p = s.currentEvent;
        const ctx = impactContext(s);
        const empty = EVENT_BY_ID[p.eventId]!.options.filter((o) => {
          const im = optionImpact(s, o, p.footprint, ctx);
          return im.helps.length === 0 && im.hurts.length === 0;
        }).length;
        events++;
        options += 3;
        emptyOptions += empty;
        if (empty === 3) allEmpty++;
        s = step(s, {}, t).state;
      }
    }
    expect(events).toBeGreaterThan(100);
    expect(allEmpty).toBe(0);
    expect(emptyOptions / options).toBeLessThanOrEqual(0.06);
  }, 120_000);

  it("the event card forecasts who a plague hurts", () => {
    const s = withSickness(newGame("plague-card"));
    const impact = optionImpact(s, EVENT_BY_ID.E33!.options[2]!, null);
    expect(impact.hurts).toContain("windstep");
    expect(impact.helps).toEqual([]);
  });
});

describe("growth and research", () => {
  it("fed tribes grow beyond their shelter until overcrowded", () => {
    let s = newGame("crowd");
    s.tribes.hearthwood.population = 1300; // above the 1,200 starting shelter
    s.tribes.hearthwood.food = 20_000;
    s.tribes.hearthwood.morale = 80;
    const r = step(s, REST);
    expect(r.reports.hearthwood.births).toBeGreaterThan(0);
    s = newGame("crowd");
    s.tribes.hearthwood.population = 3000; // far beyond 1.5 × shelter
    s.tribes.hearthwood.food = 60_000;
    s.tribes.hearthwood.morale = 80;
    expect(step(s, REST).reports.hearthwood.births).toBe(0);
  });

  it("larger tribes research faster", () => {
    const s = newGame("research-speed");
    const R = BALANCE.research;
    s.tribes.hearthwood.population = R.peoplePerExtraEffort - 1;
    expect(researchEffort(s, "hearthwood")).toBe(1);
    s.tribes.hearthwood.population = R.peoplePerExtraEffort * 2;
    expect(researchEffort(s, "hearthwood")).toBe(3);
    s.tribes.hearthwood.population = R.peoplePerExtraEffort * 20;
    expect(researchEffort(s, "hearthwood")).toBe(R.maxEffortPerTurn);
  });
});

describe("ending and summaries", () => {
  it("the match ends as soon as one tribe is left standing", () => {
    const s = newGame("last-standing");
    for (const id of ["windstep", "stonehaven", "ironfang"] as const) s.tribes[id].population = 10;
    const r = step(s, REST);
    expect(isMatchOver(r.state)).toBe(true);
    expect(r.state.currentEvent).toBeNull();
    expect(r.scores.hearthwood.total).toBeGreaterThan(0);
  });

  it("names big losses and their causes in plain words", () => {
    const s = newGame("summary");
    s.tribes.ironfang.food = 0;
    const r = step(s, REST);
    const line = r.summary.lines.find((l) => l.tribeId === "ironfang");
    expect(line?.text).toMatch(/Ironfang lost .* to hunger/);
    expect(r.summary.headline.length).toBeGreaterThan(10);
  });

  it("phrases shares of people plainly", () => {
    expect(shareOfPeople(0.5)).toBe("half of its people");
    expect(shareOfPeople(0.33)).toBe("a third of its people");
    expect(shareOfPeople(0.08)).toBe("8% of its people");
    expect(growthPhrase(1)).toBe("doubled in size");
    expect(growthPhrase(0.1)).toBe("grew by 10%");
  });
});
