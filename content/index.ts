import { StateHasher, canonicalJson } from "@/lib/game/hash";
import { ACTIONS } from "./actions";
import { BALANCE, RULES_VERSION, STARTING } from "./balance";
import { EVENTS } from "./events";
import { HELP } from "./help";
import { NARRATION } from "./narration";
import { TECHNOLOGIES } from "./technologies";
import { TRIBES } from "./tribes";

export const CONTENT_VERSION = "content-1.0.0";
export { RULES_VERSION };

let cachedHash: string | null = null;

/** Stable hash of every committed catalog module; stored with each game. */
export function contentHash(): string {
  if (cachedHash) return cachedHash;
  cachedHash = new StateHasher()
    .string(canonicalJson({ ACTIONS, BALANCE, STARTING, EVENTS, HELP, NARRATION, TECHNOLOGIES, TRIBES }))
    .digest();
  return cachedHash;
}
