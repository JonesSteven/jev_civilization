import type { ActionKind } from "@/lib/game/types";

export interface ActionDef {
  kind: ActionKind;
  name: string;
  summary: string;
  /** Documented deterministic target-selection rule for location/target actions. */
  targetRule?: string;
}

export const ACTIONS: Record<ActionKind, ActionDef> = {
  rest: { kind: "rest", name: "Rest", summary: "Spend no stocks; recover morale." },
  gather_food: {
    kind: "gather_food",
    name: "Gather food",
    summary: "Collect wild food from accessible forage and wildlife stocks in working range.",
  },
  gather_timber: { kind: "gather_timber", name: "Gather timber", summary: "Cut timber from reachable forests in working range." },
  quarry_stone: { kind: "quarry_stone", name: "Quarry stone", summary: "Quarry stone from reachable deposits in working range." },
  establish_farm: {
    kind: "establish_farm",
    name: "Establish farm",
    summary: "Build a farm on a claimed meadow tile.",
    targetRule: "Claimed meadow tiles in working range with no asset; offer the most fertile and the nearest.",
  },
  establish_hunt: {
    kind: "establish_hunt",
    name: "Establish hunting site",
    summary: "Build a hunting site that draws on nearby wildlife.",
    targetRule: "Claimed meadow/forest tiles in working range with no asset; offer the richest wildlife within radius 3 and the nearest.",
  },
  establish_fishery: {
    kind: "establish_fishery",
    name: "Establish fishery",
    summary: "Build a fishery on a claimed shore tile.",
    targetRule: "Claimed shore land tiles in working range with no asset; offer the richest fish within radius 3 and the nearest.",
  },
  build_housing: {
    kind: "build_housing",
    name: "Build housing",
    summary: "Add shelter capacity (wooden homes, stone houses, or portable camps).",
    targetRule: "Fixed housing goes on the nearest free claimed land tile to the settlement; camps travel with the settlement.",
  },
  repair_shelter: {
    kind: "repair_shelter",
    name: "Repair shelter",
    summary: "Restore condition to damaged housing.",
    targetRule: "Offer the most damaged active housing (and the portable camp if damaged).",
  },
  build_defenses: { kind: "build_defenses", name: "Build defenses", summary: "Raise the fortification level at the settlement." },
  train: { kind: "train", name: "Train fighters", summary: "Raise military level by one." },
  research_start: { kind: "research_start", name: "Start research", summary: "Pay a technology's cost and complete its first effort turn." },
  research_continue: { kind: "research_continue", name: "Continue research", summary: "Advance the current project by one effort turn." },
  research_cancel: { kind: "research_cancel", name: "Cancel research", summary: "Discard the current project without refund." },
  relocate: {
    kind: "relocate",
    name: "Relocate settlement",
    summary: "Move the settlement along a reachable path within the movement budget.",
    targetRule:
      "Reachable, unclaimed-or-own land within the movement budget; offer the destination with the most food resources in working range and the one farthest from other settlements.",
  },
  expand: {
    kind: "expand",
    name: "Expand territory",
    summary: "Claim up to eight contiguous unclaimed border tiles within working range.",
    targetRule: "Greedy frontier growth from current borders; offer the best food-resource set and the best material-resource set.",
  },
  raid: {
    kind: "raid",
    name: "Raid",
    summary: "Attack another settlement to take supplies.",
    targetRule: "Living settlements within 16 travel units; offer the weakest defense and the nearest.",
  },
  defend: { kind: "defend", name: "Defend", summary: "Temporary ×1.5 settlement defense this turn." },
  send_scouts: {
    kind: "send_scouts",
    name: "Send scouts",
    summary: "Survey distant land for sites that could support a new settlement.",
    targetRule:
      "Unclaimed land within 40 travel units of any own settlement and at least 26 from every settlement; report the two sites with the most food (then materials) within radius 6.",
  },
  found_settlement: {
    kind: "found_settlement",
    name: "Found settlement",
    summary: "Start an additional settlement at a site found by scouts (up to three settlements).",
    targetRule: "Only scouted sites that are still unclaimed, unexpired, and at least 26 travel units from every settlement.",
  },
  offer_union: {
    kind: "offer_union",
    name: "Offer union",
    summary: "Offer to take in a much smaller neighbour that is losing people; it may accept on a later turn.",
    targetRule: "Living tribes with at least 300 people and at most a quarter of our size that are declining (or at most an eighth of our size), when we can feed them; offer each such tribe.",
  },
  accept_union: {
    kind: "accept_union",
    name: "Accept union",
    summary: "Join the larger tribe that offered a union: most of our people, stores, land, and knowledge become part of it and our tribe ends.",
    targetRule: "Open offers made to us on the previous two turns by tribes that still exist.",
  },
  recruit: {
    kind: "recruit",
    name: "Recruit",
    summary: "Invite people from a distressed neighbor to join.",
    targetRule: "Living tribes within 16 travel units with under one turn of food; offer the two most distressed.",
  },
};

/** Plain-language groups the player sees instead of the 23 engine action kinds (Jev still sees every action). */
export const ACTION_GROUPS: Record<ActionKind, string> = {
  rest: "Resting",
  gather_food: "Working the land",
  gather_timber: "Working the land",
  quarry_stone: "Working the land",
  establish_farm: "Working the land",
  establish_hunt: "Working the land",
  establish_fishery: "Working the land",
  build_housing: "Building",
  repair_shelter: "Building",
  build_defenses: "Building",
  research_start: "Researching",
  research_continue: "Researching",
  research_cancel: "Researching",
  expand: "Expanding",
  send_scouts: "Expanding",
  found_settlement: "Expanding",
  relocate: "Moving",
  raid: "Fighting",
  train: "Fighting",
  defend: "Fighting",
  recruit: "Diplomacy",
  offer_union: "Diplomacy",
  accept_union: "Diplomacy",
};
