import { BALANCE } from "@/content/balance";
import { Terrain, TRIBE_IDS, type Asset, type AssetKind, type TribeId, type WorldState } from "../types";
import { neighbors4, tilesWithin } from "./grid";

export function tribeIndex(id: TribeId): number {
  return TRIBE_IDS.indexOf(id);
}

export function tribeAt(index: number): TribeId | null {
  return index >= 0 ? (TRIBE_IDS[index] ?? null) : null;
}

export function isLand(world: WorldState, tile: number): boolean {
  return world.terrain[tile] !== Terrain.Water;
}

const nbBuf = new Int32Array(4);

export function isShore(world: WorldState, tile: number): boolean {
  if (!isLand(world, tile)) return false;
  const n = neighbors4(tile, nbBuf);
  for (let k = 0; k < n; k++) if (world.terrain[nbBuf[k] as number] === Terrain.Water) return true;
  return false;
}

/** True when a land tile lies within `radius` (Manhattan) of any water tile. */
export function nearWater(world: WorldState, tile: number, radius = 2): boolean {
  for (const t of tilesWithin(tile, radius)) if (world.terrain[t] === Terrain.Water) return true;
  return false;
}

export function addAsset(world: WorldState, asset: Omit<Asset, "id">): Asset {
  if (world.assetAt[asset.tile] !== -1) throw new Error(`tile ${asset.tile} already has an asset`);
  const full: Asset = { ...asset, id: world.nextAssetId++ };
  world.assets.push(full);
  world.assetAt[full.tile] = full.id;
  return full;
}

export function assetById(world: WorldState, id: number): Asset | undefined {
  // Assets are kept sorted by id (append-only), so binary search works.
  let lo = 0,
    hi = world.assets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const a = world.assets[mid] as Asset;
    if (a.id === id) return a;
    if (a.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

export function assetAtTile(world: WorldState, tile: number): Asset | undefined {
  const id = world.assetAt[tile] as number;
  return id === -1 ? undefined : assetById(world, id);
}

export function removeAsset(world: WorldState, id: number) {
  const idx = world.assets.findIndex((a) => a.id === id);
  if (idx === -1) return;
  const a = world.assets[idx] as Asset;
  world.assetAt[a.tile] = -1;
  world.assets.splice(idx, 1);
}

export function assetsOf(world: WorldState, tribe: TribeId, kind?: AssetKind): Asset[] {
  return world.assets.filter((a) => a.owner === tribe && (kind === undefined || a.kind === kind));
}

/** Fish stock available to a fishery at `tile`: water tiles within the site radius. */
export function siteTiles(world: WorldState, tile: number, kind: "hunt" | "fishery"): number[] {
  const r = BALANCE.territory.siteRadius;
  return tilesWithin(tile, r).filter((t) =>
    kind === "fishery" ? world.terrain[t] === Terrain.Water : world.terrain[t] !== Terrain.Water,
  );
}

export function sumStock(world: WorldState, tiles: number[], res: "forage" | "wildlife" | "fish" | "timber" | "stone"): number {
  let s = 0;
  const arr = world.stock[res];
  for (const t of tiles) s += arr[t] as number;
  return s;
}

export function sumCap(world: WorldState, tiles: number[], res: "forage" | "wildlife" | "fish" | "timber" | "stone"): number {
  let s = 0;
  const arr = world.cap[res];
  for (const t of tiles) s += arr[t] as number;
  return s;
}
