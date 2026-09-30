// Step 6: simultaneous action resolution. Every tribe's action is evaluated against the common pre-action
// snapshot (`snap.state`), and effects are written to the next state. No step depends on tribe array order.

import { BALANCE } from "@/content/balance";
import { narrate } from "@/content/narration";
import { TECH_BY_ID } from "@/content/technologies";
import { tribeName } from "@/content/tribes";
import type { Snapshot } from "../candidates";
import { accessibleTiles, type TribeGeo } from "../geo";
import { adjustRelation, remember } from "../memory";
import { gatherPotential } from "../production";
import { draw } from "../rng";
import { shelterSummary } from "../shelter";
import { attackStrength, defenseStrength, raidChance, researchEffort } from "../stats";
import { TRIBE_IDS, type ActionCandidate, type GameOutcome, type GameState, type ResourceAmounts, type TribeId } from "../types";
import { tilesWithin } from "../world/grid";
import { addAsset, assetAtTile, assetById, isLand } from "../world/territory";
import { capturableBorderTiles, claimAround, surveySites } from "../settlements";
import { absorbTribe } from "../unions";
import { allocate, apportion, type Demand } from "./allocation";

export interface ActionResolution {
  relocated: Set<TribeId>;
  defending: Set<TribeId>;
}

function addStock(state: GameState, tribe: TribeId, amounts: Partial<ResourceAmounts>, sign = 1) {
  const t = state.tribes[tribe];
  t.food = Math.max(0, t.food + sign * (amounts.food ?? 0));
  t.timber = Math.max(0, t.timber + sign * (amounts.timber ?? 0));
  t.stone = Math.max(0, t.stone + sign * (amounts.stone ?? 0));
}

function moraleDelta(state: GameState, tribe: TribeId, d: number) {
  const t = state.tribes[tribe];
  t.morale = Math.max(BALANCE.morale.min, Math.min(BALANCE.morale.max, t.morale + d));
}

function amountsText(a: Partial<ResourceAmounts>): string {
  const parts = (["food", "timber", "stone"] as const).filter((k) => (a[k] ?? 0) > 0).map((k) => `${a[k]} ${k}`);
  return parts.length ? parts.join(", ") : "nothing";
}

export function resolveActions(
  next: GameState,
  snap: Snapshot,
  chosen: Partial<Record<TribeId, ActionCandidate>>,
  turn: number,
  outcomes: GameOutcome[],
  changedTiles: Set<number>,
): ActionResolution {
  const pre = snap.state;
  const actors = TRIBE_IDS.filter((id) => chosen[id] && pre.tribes[id].alive);
  const name = (id: TribeId) => tribeName(id);
  const M0 = BALANCE.morale;
  const log = (o: GameOutcome) => outcomes.push(o);

  // ---- 1. Reserve all costs; mark defenders ----
  const defending = new Set<TribeId>();
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    addStock(next, id, c.costs, -1);
    if (c.kind === "defend") defending.add(id);
    const t = next.tribes[id];
    t.recentActions = [...t.recentActions, { turn, kind: c.kind, label: c.id }].slice(-6);
  }

  // ---- 2. Relocations and competing location claims ----
  const relocTarget = new Map<TribeId, number>();
  const foundTarget = new Map<TribeId, number>();
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    if (c.kind === "relocate" && c.target?.type === "path") relocTarget.set(id, c.target.tile);
    if (c.kind === "found_settlement" && c.target?.type === "tile") foundTarget.set(id, c.target.tile);
  }
  // Relocations and foundings compete for settlement sites: a site chosen twice goes to nobody.
  const destCount = new Map<number, number>();
  for (const d of [...relocTarget.values(), ...foundTarget.values()]) destCount.set(d, (destCount.get(d) ?? 0) + 1);
  const relocated = new Set<TribeId>();
  const relocDests = new Set<number>();
  for (const [id, dest] of relocTarget) {
    const c = chosen[id] as ActionCandidate;
    if ((destCount.get(dest) ?? 0) > 1) {
      addStock(next, id, c.costs, 1);
      log({ kind: "relocate_conflict", tribeId: id, text: narrate("relocate_conflict", { tribe: name(id), place: c.target?.label ?? "" }) + ` ${amountsText(c.costs)} was refunded.` });
      continue;
    }
    relocDests.add(dest);
  }
  const claims = new Map<number, TribeId[]>();
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    if (c.kind === "expand" && c.target?.type === "tiles") for (const t of c.target.tiles) claims.set(t, [...(claims.get(t) ?? []), id]);
  }
  for (const [id, dest] of relocTarget) {
    if (!relocDests.has(dest)) continue;
    const c = chosen[id] as ActionCandidate;
    const from = pre.tribes[id].settlement;
    next.tribes[id].settlement = dest;
    relocated.add(id);
    const idx = TRIBE_IDS.indexOf(id);
    // The new center and adjacent unclaimed land come under the tribe's control.
    for (const t of tilesWithin(dest, 1)) {
      if (!isLand(next.world, t)) continue;
      if (t === dest || (next.world.owner[t] === -1 && !claims.has(t))) {
        next.world.owner[t] = idx;
        changedTiles.add(t);
      }
    }
    const path = c.target?.type === "path" ? c.target.path : [from, dest];
    const dist = snap.geo[id]?.move.dist[dest] ?? 0;
    log({ kind: "relocate", tribeId: id, text: narrate("relocate", { tribe: name(id), distance: dist, place: c.target?.label ?? "" }), path, from, to: dest });
    moraleDelta(next, id, 0);
  }
  for (const [id, site] of foundTarget) {
    const c = chosen[id] as ActionCandidate;
    const t = next.tribes[id];
    if ((destCount.get(site) ?? 0) > 1 || next.world.owner[site] !== -1 || claims.has(site)) {
      addStock(next, id, c.costs, 1);
      log({ kind: "found_conflict", tribeId: id, text: narrate("found_conflict", { tribe: name(id), refund: amountsText(c.costs) }), tiles: [site] });
      continue;
    }
    t.outposts = [...t.outposts, site];
    t.scoutedSites = t.scoutedSites.filter((x) => x.tile !== site);
    const tiles = claimAround(next, id, site, BALANCE.actions.found.territoryTiles);
    for (const x of tiles) changedTiles.add(x);
    const add = BALANCE.actions.found.campCapacity;
    if (t.camp) {
      const total = t.camp.capacity + add;
      t.camp.condition = Math.round((t.camp.capacity * t.camp.condition + add * 100) / total);
      t.camp.capacity = total;
    } else t.camp = { capacity: add, condition: 100 };
    moraleDelta(next, id, M0.construction * 2);
    t.milestones.push({ turn, text: `Founded settlement ${1 + t.outposts.length}` });
    remember(next, id, turn, "founded", `Founded a new settlement on turn ${turn}`);
    log({ kind: "found_settlement", tribeId: id, text: narrate("found_settlement", { tribe: name(id), count: tiles.length }), tiles, from: pre.tribes[id].settlement, to: site, path: [pre.tribes[id].settlement, site] });
  }
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    if (c.kind !== "expand" || c.target?.type !== "tiles") continue;
    const idx = TRIBE_IDS.indexOf(id);
    const won: number[] = [];
    let contested = 0;
    for (const t of c.target.tiles) {
      const who = claims.get(t) ?? [];
      if (who.length > 1 || relocDests.has(t) || next.world.owner[t] !== -1) {
        contested++;
        continue;
      }
      next.world.owner[t] = idx;
      won.push(t);
      changedTiles.add(t);
    }
    if (won.length === 0) {
      addStock(next, id, c.costs, 1);
      log({ kind: "expand", tribeId: id, text: narrate("cost_refund", { tribe: name(id), refund: amountsText(c.costs) }) + " Every targeted tile was contested." });
    } else {
      log({
        kind: "expand",
        tribeId: id,
        text: contested > 0 ? narrate("expand_conflict", { tribe: name(id), count: won.length, contested }) : narrate("expand", { tribe: name(id), count: won.length }),
        tiles: won,
      });
    }
  }

  // ---- 3. Gathering (shared pools, proportional), construction, research, training ----
  const foodDemands: Demand[] = [];
  const timberDemands: Demand[] = [];
  const stoneDemands: Demand[] = [];
  const access = new Map<TribeId, number[]>();
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    const g = snap.geo[id] as TribeGeo;
    if (!["gather_food", "gather_timber", "quarry_stone"].includes(c.kind)) continue;
    const tiles = accessibleTiles(pre, g);
    access.set(id, tiles);
    const settlement = pre.tribes[id].settlement;
    if (c.kind === "gather_food") foodDemands.push({ key: id, amount: gatherPotential(pre, id, "food", snap.mods, settlement), tiles });
    if (c.kind === "gather_timber") timberDemands.push({ key: id, amount: gatherPotential(pre, id, "timber", snap.mods, settlement), tiles });
    if (c.kind === "quarry_stone") stoneDemands.push({ key: id, amount: gatherPotential(pre, id, "stone", snap.mods, settlement), tiles });
  }
  // Food gathering draws forage first, then wildlife for any shortfall.
  const forageGot = allocate(next.world.stock.forage, foodDemands);
  const wildDemands = foodDemands.map((d) => ({ ...d, amount: Math.max(0, d.amount - (forageGot.get(d.key) ?? 0)) }));
  const wildGot = allocate(next.world.stock.wildlife, wildDemands);
  for (const d of foodDemands) {
    const id = d.key as TribeId;
    const got = Math.floor((forageGot.get(id) ?? 0) + (wildGot.get(id) ?? 0));
    next.tribes[id].food += got;
    log({ kind: "gather_food", tribeId: id, text: got > 0 ? narrate("gather_food", { tribe: name(id), food: got }) : narrate("gather_food_none", { tribe: name(id) }), amounts: { food: got } });
  }
  for (const [key, got] of allocate(next.world.stock.timber, timberDemands)) {
    const id = key as TribeId;
    const n = Math.floor(got);
    next.tribes[id].timber += n;
    log({ kind: "gather_timber", tribeId: id, text: narrate("gather_timber", { tribe: name(id), timber: n }), amounts: { timber: n } });
  }
  for (const [key, got] of allocate(next.world.stock.stone, stoneDemands)) {
    const id = key as TribeId;
    const n = Math.floor(got);
    next.tribes[id].stone += n;
    log({ kind: "quarry_stone", tribeId: id, text: narrate("quarry_stone", { tribe: name(id), stone: n }), amounts: { stone: n } });
  }

  const M = BALANCE.morale;
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    const t = next.tribes[id];
    switch (c.kind) {
      case "rest":
        moraleDelta(next, id, BALANCE.actions.restMorale);
        log({ kind: "rest", tribeId: id, text: narrate("rest", { tribe: name(id), morale: BALANCE.actions.restMorale }) });
        break;
      case "establish_farm":
      case "establish_hunt":
      case "establish_fishery": {
        const tile = c.target?.type === "tile" ? c.target.tile : -1;
        const kind = c.kind === "establish_farm" ? "farm" : c.kind === "establish_hunt" ? "hunt" : "fishery";
        const label = kind === "farm" ? "farm" : kind === "hunt" ? "hunting site" : "fishery";
        if (tile < 0 || next.world.assetAt[tile] !== -1 || next.world.owner[tile] !== TRIBE_IDS.indexOf(id)) {
          addStock(next, id, c.costs, 1);
          log({ kind: "cost_refund", tribeId: id, text: narrate("cost_refund", { tribe: name(id), refund: amountsText(c.costs) }) });
          break;
        }
        addAsset(next.world, { kind, tile, owner: id, builtTurn: turn });
        changedTiles.add(tile);
        moraleDelta(next, id, M.construction);
        log({ kind: "establish_site", tribeId: id, text: narrate("establish_site", { tribe: name(id), site: label, place: c.target?.label ?? "" }), tiles: [tile] });
        break;
      }
      case "build_housing": {
        if (c.target?.type !== "housing") break;
        const A = BALANCE.actions;
        if (c.target.housingType === "camp") {
          const add = A.campHousing.capacity;
          if (t.camp) {
            const total = t.camp.capacity + add;
            t.camp.condition = Math.round((t.camp.capacity * t.camp.condition + add * 100) / total);
            t.camp.capacity = total;
          } else t.camp = { capacity: add, condition: 100 };
          moraleDelta(next, id, M.construction);
          log({ kind: "build_housing", tribeId: id, text: narrate("build_housing", { tribe: name(id), housing: "portable camp shelter", capacity: add }) });
          break;
        }
        const tile = c.target.tile ?? -1;
        if (tile < 0 || next.world.assetAt[tile] !== -1) {
          addStock(next, id, c.costs, 1);
          log({ kind: "cost_refund", tribeId: id, text: narrate("cost_refund", { tribe: name(id), refund: amountsText(c.costs) }) });
          break;
        }
        const cap = c.target.housingType === "stone" ? A.stoneHousing.capacity : A.woodHousing.capacity;
        addAsset(next.world, { kind: "housing", housingType: c.target.housingType, capacity: cap, condition: 100, tile, owner: id, builtTurn: turn });
        changedTiles.add(tile);
        moraleDelta(next, id, M.construction);
        log({ kind: "build_housing", tribeId: id, text: narrate("build_housing", { tribe: name(id), housing: c.target.housingType === "stone" ? "stone houses" : "wooden homes", capacity: cap }), tiles: [tile] });
        break;
      }
      case "repair_shelter": {
        const R = BALANCE.actions.repair;
        const spent = c.costs.timber + c.costs.stone;
        const restore = Math.floor((spent * R.maxCondition) / R.maxMaterial);
        if (c.target?.type === "asset") {
          const a = assetById(next.world, c.target.assetId);
          if (!a) break;
          const before = a.condition ?? 100;
          a.condition = Math.min(100, before + restore);
          changedTiles.add(a.tile);
          log({ kind: "repair_shelter", tribeId: id, text: narrate("repair_shelter", { tribe: name(id), housing: `${a.housingType} housing`, condition: (a.condition ?? 100) - before }) });
        } else if (t.camp) {
          const before = t.camp.condition;
          t.camp.condition = Math.min(100, before + restore);
          log({ kind: "repair_shelter", tribeId: id, text: narrate("repair_shelter", { tribe: name(id), housing: "the portable camp", condition: t.camp.condition - before }) });
        }
        moraleDelta(next, id, M.construction);
        break;
      }
      case "build_defenses": {
        const tile = pre.tribes[id].settlement;
        const existing = assetAtTile(next.world, tile);
        let level = 1;
        if (existing && existing.kind === "defenses" && existing.owner === id) {
          existing.level = (existing.level ?? 0) + 1;
          level = existing.level;
        } else if (!existing) {
          addAsset(next.world, { kind: "defenses", tile, owner: id, level: 1, builtTurn: turn });
        } else {
          addStock(next, id, c.costs, 1);
          log({ kind: "cost_refund", tribeId: id, text: narrate("cost_refund", { tribe: name(id), refund: amountsText(c.costs) }) });
          break;
        }
        changedTiles.add(tile);
        moraleDelta(next, id, M.construction);
        log({ kind: "build_defenses", tribeId: id, text: narrate("build_defenses", { tribe: name(id), level }), tiles: [tile] });
        break;
      }
      case "train":
        t.militaryLevel = Math.min(BALANCE.actions.train.cap, t.militaryLevel + 1);
        log({ kind: "train", tribeId: id, text: narrate("train", { tribe: name(id), level: t.militaryLevel }) });
        break;
      case "research_start":
      case "research_continue": {
        if (c.kind === "research_start" && c.target?.type === "tech") {
          const tech = TECH_BY_ID[c.target.techId];
          if (!tech) break;
          t.project = { techId: tech.id, progress: 0, required: tech.effortTurns };
        }
        if (!t.project) break;
        t.project.progress = Math.min(t.project.required, t.project.progress + researchEffort(pre, id));
        const tech = TECH_BY_ID[t.project.techId];
        const techName = tech?.name ?? t.project.techId;
        if (t.project.progress >= t.project.required) {
          t.learned = [...t.learned, t.project.techId];
          t.memory = t.memory.filter((m) => m.kind !== "research");
          t.milestones.push({ turn, text: `Learned ${techName}` });
          log({ kind: "research_complete", tribeId: id, text: narrate("research_complete", { tribe: name(id), tech: techName }) });
          t.project = null;
          moraleDelta(next, id, M.researchComplete);
        } else {
          log({
            kind: c.kind,
            tribeId: id,
            text: narrate(c.kind, { tribe: name(id), tech: techName, progress: t.project.progress, required: t.project.required }),
          });
        }
        break;
      }
      case "research_cancel": {
        const techName = t.project ? (TECH_BY_ID[t.project.techId]?.name ?? t.project.techId) : "its";
        t.project = null;
        t.memory = t.memory.filter((m) => m.kind !== "research");
        moraleDelta(next, id, M.researchCancel);
        log({ kind: "research_cancel", tribeId: id, text: narrate("research_cancel", { tribe: name(id), tech: techName }) });
        break;
      }
      case "defend":
        log({ kind: "defend", tribeId: id, text: narrate("defend", { tribe: name(id) }) });
        break;
      case "send_scouts": {
        // The survey reads the common pre-action snapshot, so it never depends on other tribes' actions this turn.
        const geo = snap.geo[id] as TribeGeo;
        const sites = surveySites(pre, id, geo, turn);
        t.scoutedSites = sites;
        const summary = sites.length
          ? sites.map((x) => `${x.terrain} site ${x.distance} units away (${x.food} food potential)`).join("; ")
          : "no free land meeting the spacing rule";
        remember(next, id, turn, "scouting", `Scouts reported on turn ${turn}: ${summary}`);
        log({ kind: "send_scouts", tribeId: id, text: narrate(sites.length ? "scouts_found" : "scouts_none", { tribe: name(id), count: sites.length }), tiles: sites.map((x) => x.tile) });
        break;
      }
      default:
        break;
    }
    if (t.project && c.kind !== "research_continue" && c.kind !== "research_start" && c.kind !== "research_cancel") {
      const techName = TECH_BY_ID[t.project.techId]?.name ?? t.project.techId;
      remember(next, id, turn, "research", `${techName} research paused at ${t.project.progress} of ${t.project.required} effort turns`);
    }
  }

  // ---- 4. Raids, calculated as one batch from snapshot strengths ----
  resolveRaids(next, snap, chosen, actors, relocated, defending, turn, outcomes, changedTiles);

  // ---- 5. Recruitment, capped against post-combat populations ----
  resolveRecruitment(next, snap, chosen, actors, turn, outcomes);

  // ---- 6. Union offers and acceptances ----
  resolveUnions(next, chosen, actors, turn, outcomes, changedTiles);

  return { relocated, defending };
}

function resolveRaids(
  next: GameState,
  snap: Snapshot,
  chosen: Partial<Record<TribeId, ActionCandidate>>,
  actors: TribeId[],
  relocated: Set<TribeId>,
  defending: Set<TribeId>,
  turn: number,
  outcomes: GameOutcome[],
  changedTiles: Set<number>,
) {
  const pre = snap.state;
  const C = BALANCE.combat;
  const raids = actors
    .map((id) => ({ attacker: id, c: chosen[id] as ActionCandidate }))
    .filter((r) => r.c.kind === "raid" && r.c.target?.type === "settlement")
    .map((r) => ({ attacker: r.attacker, target: (r.c.target as { tribeId: TribeId }).tribeId, tile: (r.c.target as { tile: number }).tile }));
  if (raids.length === 0) return;

  const lossFrac = new Map<TribeId, number>();
  const addLoss = (id: TribeId, n: number) => lossFrac.set(id, (lossFrac.get(id) ?? 0) + n);
  const successes: { attacker: TribeId; target: TribeId }[] = [];
  const results = new Map<string, { success: boolean; escaped: boolean; chance: number }>();

  for (const r of raids) {
    const key = `${r.attacker}->${r.target}`;
    if (relocated.has(r.target) && r.tile === pre.tribes[r.target].settlement) {
      results.set(key, { success: false, escaped: true, chance: 0 });
      continue;
    }
    const atk = attackStrength(pre, r.attacker);
    const def = defenseStrength(pre, r.target, defending.has(r.target), r.tile);
    const chance = raidChance(atk, def);
    // Independent draw keyed by turn/attacker/target: array order never matters.
    const success = draw(pre.seed, "combat", turn, r.attacker, r.target) < chance;
    results.set(key, { success, escaped: false, chance });
    const ap = pre.tribes[r.attacker].population;
    const dp = pre.tribes[r.target].population;
    if (success) {
      successes.push({ attacker: r.attacker, target: r.target });
      addLoss(r.attacker, ap * C.successLoss.attacker);
      addLoss(r.target, dp * C.successLoss.defender);
    } else {
      addLoss(r.attacker, ap * C.failureLoss.attacker);
      addLoss(r.target, dp * C.failureLoss.defender);
    }
  }

  // Loot budgets: snapshot stocks minus the target's own reserved costs. Shared among successful raiders.
  const loot = new Map<string, Partial<ResourceAmounts>>();
  const targets = [...new Set(successes.map((s) => s.target))].sort();
  for (const target of targets) {
    const tc = chosen[target]?.costs ?? { food: 0, timber: 0, stone: 0 };
    const attackers = successes.filter((s) => s.target === target).map((s) => s.attacker).sort();
    for (const res of ["food", "timber", "stone"] as const) {
      const budget = Math.max(0, pre.tribes[target][res] - tc[res]);
      const cap = C.loot[res];
      const want = attackers.map((a) => ({ key: a, weight: Math.min(cap, budget) }));
      const totalWant = want.reduce((s, w) => s + w.weight, 0);
      const pool = Math.min(budget, totalWant);
      const shares = apportion(pool, want, (k) => draw(pre.seed, "alloc", turn, "loot", target, res, k));
      for (const a of attackers) {
        const key = `${a}->${target}`;
        const got = Math.min(shares.get(a) ?? 0, next.tribes[target][res]);
        next.tribes[target][res] -= got;
        next.tribes[a][res] += got;
        loot.set(key, { ...(loot.get(key) ?? {}), [res]: got });
      }
    }
  }

  // Aggregate losses, round once, cap at the living population.
  const losses = new Map<TribeId, number>();
  for (const [id, frac] of [...lossFrac.entries()].sort()) {
    const n = Math.min(next.tribes[id].population, Math.round(frac));
    next.tribes[id].population -= n;
    losses.set(id, n);
  }

  const M = BALANCE.morale;
  const Rl = BALANCE.relations;
  for (const r of raids) {
    const key = `${r.attacker}->${r.target}`;
    const res = results.get(key)!;
    const an = tribeName(r.attacker),
      tn = tribeName(r.target);
    const aLoss = losses.get(r.attacker) ?? 0,
      dLoss = losses.get(r.target) ?? 0;
    const path = snap.geo[r.attacker] ? pathFromMove(snap.geo[r.attacker] as TribeGeo, r.tile) : [];
    if (res.escaped) {
      outcomes.push({ kind: "raid", tribeId: r.attacker, success: false, text: narrate("raid_escaped", { tribe: an, target: tn }), path, from: pre.tribes[r.attacker].settlement, to: r.tile });
      remember(next, r.attacker, turn, "raid", `Raid on ${tn} on turn ${turn} found an empty settlement`);
      continue;
    }
    adjustRelation(next, r.target, r.attacker, Rl.raided);
    adjustRelation(next, r.attacker, r.target, Rl.raider);
    if (res.success) {
      const got = loot.get(key) ?? {};
      // Border pressure: a successful raid takes up to N defender border tiles touching the attacker's territory.
      const captured = capturableBorderTiles(next, r.attacker, r.target, BALANCE.territory.raidCaptureTiles);
      for (const tile of captured) next.world.owner[tile] = TRIBE_IDS.indexOf(r.attacker);
      if (captured.length) outcomes.push({ kind: "capture", tribeId: r.attacker, text: narrate("capture", { tribe: an, target: tn, count: captured.length }), tiles: captured });
      outcomes.push({
        kind: "raid",
        tribeId: r.attacker,
        success: true,
        text: narrate("raid_success", { tribe: an, target: tn, loot: amountsText(got), attackerLoss: aLoss, defenderLoss: dLoss }),
        path,
        from: pre.tribes[r.attacker].settlement,
        to: r.tile,
        amounts: got,
      });
      moraleDelta(next, r.attacker, M.raidVictory);
      moraleDelta(next, r.target, M.raidedSuccessfully);
      remember(next, r.target, turn, "raided", `Raided by ${an} on turn ${turn}; lost ${amountsText(got)}`);
      remember(next, r.attacker, turn, "raid", `Raided ${tn} successfully on turn ${turn}; took ${amountsText(got)}`);
    } else {
      outcomes.push({ kind: "raid", tribeId: r.attacker, success: false, text: narrate("raid_failure", { tribe: an, target: tn, attackerLoss: aLoss, defenderLoss: dLoss }), path, from: pre.tribes[r.attacker].settlement, to: r.tile });
      moraleDelta(next, r.attacker, M.raidDefeat);
      moraleDelta(next, r.target, M.repelledRaid);
      remember(next, r.target, turn, "raided", `Repelled a raid by ${an} on turn ${turn}`);
      remember(next, r.attacker, turn, "raid", `Raid on ${tn} failed on turn ${turn}`);
    }
  }
  // One casualty line per tribe, summing every raid it fought this turn.
  for (const [id, n] of [...losses.entries()].sort()) {
    if (n > 0) outcomes.push({ kind: "raid_losses", tribeId: id, text: narrate("raid_losses", { tribe: tribeName(id), count: n }), amounts: { population: -n } });
  }
  resolveConquests(next, pre, successes, turn, outcomes, changedTiles);
}

/**
 * A successful raid by a far larger tribe ends a remnant that is too small to negotiate a union: its survivors are
 * taken in. With several successful conquerors, the largest (then the first by name) takes it.
 */
function resolveConquests(next: GameState, pre: GameState, successes: { attacker: TribeId; target: TribeId }[], turn: number, outcomes: GameOutcome[], changedTiles: Set<number>) {
  const C = BALANCE.combat;
  for (const target of [...new Set(successes.map((s) => s.target))].sort()) {
    const d = next.tribes[target];
    if (!d.alive || d.population >= BALANCE.union.minPopulation) continue;
    const conquerors = successes
      .filter((s) => s.target === target && next.tribes[s.attacker].alive && pre.tribes[s.attacker].population >= pre.tribes[target].population * C.conquestRatio)
      .map((s) => s.attacker)
      .sort((a, b) => pre.tribes[b].population - pre.tribes[a].population || (a < b ? -1 : 1));
    const winner = conquerors[0];
    if (winner) absorbTribe(next, target, winner, C.conquestJoinShare, turn, "conquered", outcomes, changedTiles);
  }
}

/**
 * Offers are recorded for a later turn. Acceptances are settled after raids: the larger tribe takes in the smaller.
 * If two tribes accept offers from each other in one turn, only the smaller joins the larger.
 */
function resolveUnions(
  next: GameState,
  chosen: Partial<Record<TribeId, ActionCandidate>>,
  actors: TribeId[],
  turn: number,
  outcomes: GameOutcome[],
  changedTiles: Set<number>,
) {
  for (const id of actors) {
    const c = chosen[id] as ActionCandidate;
    if (c.kind !== "offer_union" || c.target?.type !== "settlement") continue;
    const to = c.target.tribeId;
    if (!next.tribes[id].alive || !next.tribes[to].alive) continue;
    const repeat = (next.unionOffers ?? []).some((o) => o.from === id && o.to === to);
    next.unionOffers = [...(next.unionOffers ?? []).filter((o) => !(o.from === id && o.to === to)), { from: id, to, turn }];
    remember(next, to, turn, "union_offer", `${tribeName(id)} offered on turn ${turn} to take in our people; we can accept for the next ${BALANCE.union.offerTurns} turns`);
    outcomes.push({ kind: "offer_union", tribeId: id, text: narrate(repeat ? "offer_union_repeat" : "offer_union", { tribe: tribeName(id), target: tribeName(to) }) });
  }
  const accepts = actors
    .filter((id) => chosen[id]?.kind === "accept_union" && chosen[id]?.target?.type === "settlement")
    .map((id) => ({ from: id, into: (chosen[id]!.target as { tribeId: TribeId }).tribeId }))
    .sort((a, b) => next.tribes[a.from].population - next.tribes[b.from].population || (a.from < b.from ? -1 : 1));
  for (const { from, into } of accepts) {
    if (!next.tribes[from].alive) continue;
    if (!next.tribes[into].alive) {
      outcomes.push({ kind: "accept_union", tribeId: from, success: false, text: narrate("accept_union_failed", { tribe: tribeName(from), target: tribeName(into) }) });
      continue;
    }
    absorbTribe(next, from, into, BALANCE.union.joinShare, turn, "joined", outcomes, changedTiles);
  }
}

function pathFromMove(geo: TribeGeo, target: number): number[] {
  const path: number[] = [];
  let cur = target;
  let guard = 0;
  while (cur !== -1 && guard++ < 400) {
    path.push(cur);
    cur = geo.move.prev[cur] as number;
  }
  return path.reverse();
}

function resolveRecruitment(
  next: GameState,
  snap: Snapshot,
  chosen: Partial<Record<TribeId, ActionCandidate>>,
  actors: TribeId[],
  turn: number,
  outcomes: GameOutcome[],
) {
  const R = BALANCE.actions.recruit;
  const pre = snap.state;
  const recs = actors
    .filter((id) => chosen[id]?.kind === "recruit" && chosen[id]?.target?.type === "settlement")
    .map((id) => ({ recruiter: id, source: (chosen[id]!.target as { tribeId: TribeId }).tribeId }));
  if (recs.length === 0) return;
  const bySource = new Map<TribeId, TribeId[]>();
  for (const r of recs) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r.recruiter]);
  for (const [source, recruiters] of [...bySource.entries()].sort()) {
    const src = next.tribes[source];
    const want = recruiters.sort().map((rec) => {
      const pre0 = pre.tribes[source];
      // Eligibility from the common snapshot; caps from the post-combat state.
      const eligible = pre0.alive && pre0.population > 0 && pre0.food / pre0.population < 1 && src.alive;
      const recT = next.tribes[rec];
      const spare = Math.max(0, shelterSummary(next, rec, snap.geo[rec]).effective - recT.population);
      const n = eligible ? Math.min(R.max, Math.floor(pre0.population * R.fraction), spare) : 0;
      return { key: rec, weight: n };
    });
    const available = Math.max(0, src.population - 1);
    const total = Math.min(available, want.reduce((s, w) => s + w.weight, 0));
    const shares = apportion(total, want, (k) => draw(pre.seed, "alloc", turn, "recruit", source, k));
    for (const rec of recruiters) {
      const n = Math.min(shares.get(rec) ?? 0, Math.max(0, src.population - 1));
      if (n <= 0) {
        outcomes.push({ kind: "recruit", tribeId: rec, success: false, text: narrate("recruit_failure", { tribe: tribeName(rec), source: tribeName(source) }) });
        continue;
      }
      src.population -= n;
      next.tribes[rec].population += n;
      adjustRelation(next, source, rec, BALANCE.relations.recruitedFrom);
      adjustRelation(next, rec, source, BALANCE.relations.recruiter);
      moraleDelta(next, rec, BALANCE.morale.recruitGain);
      moraleDelta(next, source, BALANCE.morale.recruitedFrom);
      remember(next, source, turn, "recruited", `${n} people left to join ${tribeName(rec)} on turn ${turn}`);
      outcomes.push({ kind: "recruited_away", tribeId: source, text: narrate("recruited_away", { tribe: tribeName(source), count: n, target: tribeName(rec) }), amounts: { population: -n } });
      outcomes.push({ kind: "recruit", tribeId: rec, success: true, text: narrate("recruit_success", { tribe: tribeName(rec), count: n, source: tribeName(source) }), amounts: { population: n }, from: pre.tribes[source].settlement, to: pre.tribes[rec].settlement });
    }
  }
}
