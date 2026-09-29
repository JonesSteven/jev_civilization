// Catalog validation rules shared by `npm run validate:catalog` (prebuild) and the test suite.
import { ACTIONS } from "@/content/actions";
import { BALANCE } from "@/content/balance";
import { EVENTS, type EventDef } from "@/content/events";
import { NARRATION } from "@/content/narration";
import { TECHNOLOGIES, TECH_BY_ID } from "@/content/technologies";
import { TRIBES } from "@/content/tribes";
import { SEASONS, TERRAIN_NAMES, TILE_RESOURCES, TRIBE_IDS, type EffectOp } from "@/lib/game/types";

const OPS = new Set(["yieldMult", "dryFarm", "travelMod", "regen", "stockAdjust", "capacityAdjust", "shelterDamage", "recurringShelterDamage", "exposure", "spoilage", "fertility", "convertTile", "overlay", "settlementStock", "delayed"]);
const CHANNELS = new Set(["farm", "hunt", "fish", "forage", "timber", "stone"]);

function checkEffect(op: EffectOp, where: string, errors: string[], depth = 0) {
  if (!OPS.has(op.op)) errors.push(`${where}: unknown op ${op.op}`);
  const anyOp = op as unknown as Record<string, unknown>;
  if ("scope" in anyOp && anyOp.scope !== "world" && anyOp.scope !== "footprint") errors.push(`${where}: bad scope`);
  if ("duration" in anyOp && anyOp.duration !== undefined) {
    const d = anyOp.duration as number;
    if (!Number.isInteger(d) || d < 1 || d > BALANCE.effects.maxDuration) errors.push(`${where}: duration ${d} outside 1–${BALANCE.effects.maxDuration}`);
  }
  if ("terrain" in anyOp && anyOp.terrain !== undefined) for (const t of anyOp.terrain as string[]) if (!TERRAIN_NAMES.includes(t as never)) errors.push(`${where}: bad terrain ${t}`);
  switch (op.op) {
    case "yieldMult":
      if (!CHANNELS.has(op.channel)) errors.push(`${where}: bad channel`);
      if (!(op.factor >= BALANCE.production.modifierMin && op.factor <= BALANCE.production.modifierMax)) errors.push(`${where}: factor out of bounds`);
      break;
    case "dryFarm":
    case "regen":
      if (!(op.factor >= 0.25 && op.factor <= 2)) errors.push(`${where}: factor out of bounds`);
      if (op.op === "regen" && !TILE_RESOURCES.includes(op.resource)) errors.push(`${where}: bad resource`);
      break;
    case "stockAdjust":
    case "capacityAdjust":
      if (!TILE_RESOURCES.includes(op.resource)) errors.push(`${where}: bad resource`);
      if (op.fraction < -BALANCE.effects.maxDestructionFraction) errors.push(`${where}: destruction above 20%`);
      break;
    case "convertTile":
      if (op.fraction > BALANCE.effects.maxDestructionFraction) errors.push(`${where}: conversion above 20%`);
      if ((op.to as string) === "water") errors.push(`${where}: water creation is out of scope`);
      break;
    case "delayed":
      if (depth > 0) errors.push(`${where}: nested delay`);
      if (op.afterTurns < 1 || op.afterTurns > 4) errors.push(`${where}: delay out of range`);
      for (const [i, e] of op.effects.entries()) checkEffect(e, `${where}.delayed[${i}]`, errors, depth + 1);
      break;
    default:
      break;
  }
}

function checkEvent(e: EventDef, errors: string[]) {
  if (e.options.length !== 3) errors.push(`${e.id}: must have exactly 3 options`);
  if (e.seasons !== "any") for (const s of e.seasons) if (!SEASONS.includes(s)) errors.push(`${e.id}: bad season ${s}`);
  const sigs = new Set<string>();
  for (const o of e.options) {
    if (!o.id.startsWith(`${e.id}_`)) errors.push(`${o.id}: id must start with ${e.id}_`);
    if (!/^E\d{2}_[a-z_]+$/.test(o.id)) errors.push(`${o.id}: id format`);
    if (o.effects.length === 0) errors.push(`${o.id}: decorative option (no effects)`);
    if (!o.label || !o.description) errors.push(`${o.id}: missing copy`);
    const maxDur = Math.max(0, ...o.effects.map((x) => ("duration" in x && typeof x.duration === "number" ? x.duration : 0)));
    if (o.duration !== maxDur) errors.push(`${o.id}: displayed duration ${o.duration} ≠ longest effect ${maxDur}`);
    sigs.add(JSON.stringify(o.effects));
    for (const [i, op] of o.effects.entries()) checkEffect(op, `${o.id}[${i}]`, errors);
  }
  if (sigs.size !== 3) errors.push(`${e.id}: options are not mechanically distinct`);
}

export function validateCatalog(): string[] {
  const errors: string[] = [];
  if (EVENTS.length < 32) errors.push(`expected ≥32 events, found ${EVENTS.length}`);
  const ids = new Set<string>();
  for (const e of EVENTS) {
    if (ids.has(e.id)) errors.push(`duplicate event ${e.id}`);
    ids.add(e.id);
    checkEvent(e, errors);
  }
  if (!ids.has(BALANCE.events.fallbackEventId)) errors.push("fallback event missing");
  const opts = EVENTS.flatMap((e) => e.options);
  if (opts.length < 96) errors.push(`expected ≥96 options, found ${opts.length}`);
  if (new Set(opts.map((o) => o.id)).size !== opts.length) errors.push("duplicate option ids");
  for (const id of TRIBE_IDS) if (!TRIBES[id]) errors.push(`tribe ${id} missing`);
  if (TECHNOLOGIES.length !== 8) errors.push("expected 8 technologies");
  for (const t of TECHNOLOGIES) for (const p of t.prerequisites) if (!TECH_BY_ID[p]) errors.push(`${t.id}: unknown prerequisite ${p}`);
  for (const k of Object.keys(ACTIONS)) if (!ACTIONS[k as keyof typeof ACTIONS].name) errors.push(`action ${k} missing name`);
  const neededTemplates = ["rest", "gather_food", "establish_site", "build_housing", "raid_success", "raid_failure", "raid_escaped", "recruit_success", "starvation", "exposure", "births", "eliminated", "environment"];
  for (const k of neededTemplates) if (!(k in NARRATION)) errors.push(`narration template ${k} missing`);
  return errors;
}
