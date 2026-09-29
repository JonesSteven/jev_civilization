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
  recruit: {
    kind: "recruit",
    name: "Recruit",
    summary: "Invite people from a distressed neighbor to join.",
    targetRule: "Living tribes within 16 travel units with under one turn of food; offer the two most distressed.",
  },
};
