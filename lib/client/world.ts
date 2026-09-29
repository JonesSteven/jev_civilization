import type { Asset, TileResource } from "@/lib/game/types";
import { base64ToBytes, type WorldView, type WorldViewDelta } from "@/lib/game/serialize";

export interface DecodedWorld {
  terrain: Uint8Array;
  owner: Int8Array;
  overlay: Uint8Array;
  fertility: Uint8Array;
  levels: Record<TileResource, Uint8Array>;
  assets: Asset[];
  version: number;
}

let versionCounter = 0;

export function decodeWorld(v: WorldView): DecodedWorld {
  const levels = {} as Record<TileResource, Uint8Array>;
  for (const [k, s] of Object.entries(v.levels)) levels[k as TileResource] = base64ToBytes(s);
  const ownerBytes = base64ToBytes(v.owner);
  return {
    terrain: base64ToBytes(v.terrain),
    owner: new Int8Array(ownerBytes.buffer, ownerBytes.byteOffset, ownerBytes.length),
    overlay: base64ToBytes(v.overlay),
    fertility: base64ToBytes(v.fertility),
    levels,
    assets: v.assets,
    version: ++versionCounter,
  };
}

/** Apply a recorded replay delta (no engine rules involved). */
export function applyDelta(w: DecodedWorld, d: WorldViewDelta): DecodedWorld {
  const terrain = w.terrain.slice();
  const owner = w.owner.slice();
  const overlay = w.overlay.slice();
  const fertility = w.fertility.slice();
  const put = (arr: Uint8Array | Int8Array, pairs: number[]) => {
    for (let i = 0; i < pairs.length; i += 2) arr[pairs[i] as number] = pairs[i + 1] as number;
  };
  put(terrain, d.terrain);
  put(owner, d.owner);
  put(overlay, d.overlay);
  put(fertility, d.fertility);
  const levels = { ...w.levels };
  for (const [k, pairs] of Object.entries(d.levels)) {
    const arr = w.levels[k as TileResource].slice();
    put(arr, pairs as number[]);
    levels[k as TileResource] = arr;
  }
  return { terrain, owner, overlay, fertility, levels, assets: d.assets ?? w.assets, version: ++versionCounter };
}
