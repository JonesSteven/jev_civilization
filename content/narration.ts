// Committed narration templates. Placeholders are filled only with measured outcomes.
// Never claim to know why Jev chose an action.

export const NARRATION = {
  rest: "{tribe} rested and recovered {morale} morale.",
  gather_food: "{tribe} gathered {food} food.",
  gather_food_none: "{tribe} searched for food but found none within reach.",
  gather_timber: "{tribe} gathered {timber} timber.",
  quarry_stone: "{tribe} quarried {stone} stone.",
  establish_site: "{tribe} established a {site} at {place}.",
  build_housing: "{tribe} built {housing} for {capacity} people.",
  repair_shelter: "{tribe} repaired {housing}, restoring {condition} condition.",
  build_defenses: "{tribe} raised its defenses to level {level}.",
  train: "{tribe} trained its fighters to military level {level}.",
  research_start: "{tribe} began researching {tech} ({progress}/{required}).",
  research_continue: "{tribe} advanced {tech} research ({progress}/{required}).",
  research_complete: "{tribe} learned {tech}.",
  research_cancel: "{tribe} abandoned its {tech} research.",
  relocate: "{tribe} moved its settlement {distance} travel units to {place}.",
  relocate_conflict: "{tribe} could not settle at {place}: another tribe moved there at the same time.",
  expand: "{tribe} claimed {count} tiles of new territory.",
  expand_conflict: "{tribe} claimed {count} tiles; {contested} contested tiles went to nobody.",
  raid_success: "{tribe}'s raid on {target} succeeded: took {loot}; lost {attackerLoss} people while {target} lost {defenderLoss}.",
  raid_failure: "{tribe}'s raid on {target} failed: lost {attackerLoss} people; {target} lost {defenderLoss}.",
  raid_escaped: "{tribe}'s raid found {target}'s old settlement empty after it relocated; no loot or casualties.",
  defend: "{tribe} stood ready to defend its settlement.",
  recruit_success: "{tribe} welcomed {count} people from {source}.",
  recruit_failure: "{tribe}'s recruitment from {source} found no one able to move.",
  cost_refund: "{tribe}'s construction did not happen; {refund} was refunded.",
  starvation: "{tribe} lost {count} people to hunger.",
  exposure: "{tribe} lost {count} people to cold exposure.",
  births: "{tribe} welcomed {count} births.",
  eliminated: "{tribe} has disappeared. Its settlement and assets are now ruins.",
  environment: "{event}: {option} — {summary}",
  delayed: "Delayed effect: {label}.",
  settlementStock: "{tribe} collected {amount} {resource} from the {event}.",
  shelterDamage: "{tribe}'s shelters lost condition in the {event}.",
  forced: "{tribe} had only one legal action (Rest); it was applied as a forced action.",
} as const;

export type NarrationKey = keyof typeof NARRATION;

export function narrate(key: NarrationKey, values: Record<string, string | number>): string {
  return NARRATION[key].replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`));
}
