// Serialization for persistence and transport. Typed arrays are base64-encoded; the asset index is rebuilt.

import { StateHasher, canonicalJson } from "./hash";
import { TILE_COUNT, TILE_RESOURCES, type Asset, type GameState, type TileResource, type WorldState } from "./types";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const parts: string[] = [];
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
    if (out.length > 8192) {
      parts.push(out);
      out = "";
    }
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = (bytes[i] as number) << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + "==";
  } else if (rem === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + "=";
  }
  parts.push(out);
  return parts.join("");
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)] as number;
    const b = LOOKUP[clean.charCodeAt(i + 1)] as number;
    const c = i + 2 < clean.length ? (LOOKUP[clean.charCodeAt(i + 2)] as number) : 0;
    const d = i + 3 < clean.length ? (LOOKUP[clean.charCodeAt(i + 3)] as number) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function enc(arr: ArrayBufferView): string {
  return bytesToBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

function decU8(s: string): Uint8Array {
  const b = base64ToBytes(s);
  if (b.length !== TILE_COUNT) throw new Error("bad layer length");
  return b;
}

function decI8(s: string): Int8Array {
  const b = base64ToBytes(s);
  if (b.length !== TILE_COUNT) throw new Error("bad layer length");
  return new Int8Array(b.buffer, b.byteOffset, b.length);
}

function decF32(s: string): Float32Array {
  const b = base64ToBytes(s);
  if (b.length !== TILE_COUNT * 4) throw new Error("bad float layer length");
  return new Float32Array(b.slice().buffer);
}

export interface SerializedWorld {
  width: number;
  height: number;
  terrain: string;
  owner: string;
  fertility: string;
  overlay: string;
  stock: Record<TileResource, string>;
  cap: Record<TileResource, string>;
  assets: Asset[];
  nextAssetId: number;
}

export type SerializedGameState = Omit<GameState, "world"> & { world: SerializedWorld };

export function serializeWorld(w: WorldState): SerializedWorld {
  const stock = {} as Record<TileResource, string>;
  const cap = {} as Record<TileResource, string>;
  for (const r of TILE_RESOURCES) {
    stock[r] = enc(w.stock[r]);
    cap[r] = enc(w.cap[r]);
  }
  return {
    width: w.width,
    height: w.height,
    terrain: enc(w.terrain),
    owner: enc(w.owner),
    fertility: enc(w.fertility),
    overlay: enc(w.overlay),
    stock,
    cap,
    assets: w.assets,
    nextAssetId: w.nextAssetId,
  };
}

export function deserializeWorld(s: SerializedWorld): WorldState {
  const stock = {} as Record<TileResource, Float32Array>;
  const cap = {} as Record<TileResource, Float32Array>;
  for (const r of TILE_RESOURCES) {
    stock[r] = decF32(s.stock[r]);
    cap[r] = decF32(s.cap[r]);
  }
  const assets = [...s.assets].sort((a, b) => a.id - b.id);
  const assetAt = new Int32Array(TILE_COUNT).fill(-1);
  for (const a of assets) {
    if (!Number.isInteger(a.tile) || a.tile < 0 || a.tile >= TILE_COUNT) throw new Error("asset tile out of bounds");
    if (assetAt[a.tile] !== -1) throw new Error("two assets on one tile");
    assetAt[a.tile] = a.id;
  }
  return {
    width: s.width,
    height: s.height,
    terrain: decU8(s.terrain),
    owner: decI8(s.owner),
    fertility: decU8(s.fertility),
    overlay: decU8(s.overlay),
    stock,
    cap,
    assetAt,
    assets,
    nextAssetId: s.nextAssetId,
  };
}

export function serializeState(state: GameState): SerializedGameState {
  return { ...state, world: serializeWorld(state.world) };
}

export function deserializeState(s: SerializedGameState): GameState {
  return { ...s, world: deserializeWorld(s.world) };
}

/** Stable hash over the full canonical state (world layers + everything else). */
export function hashState(state: GameState): string {
  const h = new StateHasher();
  const w = state.world;
  h.typed(w.terrain).typed(w.owner).typed(w.fertility).typed(w.overlay);
  for (const r of TILE_RESOURCES) h.typed(w.stock[r]).typed(w.cap[r]);
  const { world, ...rest } = state;
  h.string(canonicalJson({ rest, assets: world.assets, nextAssetId: world.nextAssetId }));
  return h.digest();
}

// ---- Client view projection ----

/** Quantized resource levels (0–255 of capacity) are enough for overlays and much smaller than raw stocks. */
export interface WorldView {
  terrain: string;
  owner: string;
  overlay: string;
  fertility: string;
  levels: Record<TileResource, string>;
  assets: Asset[];
}

export function quantizedLevels(w: WorldState): Record<TileResource, Uint8Array> {
  const out = {} as Record<TileResource, Uint8Array>;
  for (const r of TILE_RESOURCES) {
    const q = new Uint8Array(TILE_COUNT);
    const s = w.stock[r],
      c = w.cap[r];
    for (let i = 0; i < TILE_COUNT; i++) {
      const cap = c[i] as number;
      q[i] = cap > 0.05 ? Math.max(1, Math.min(255, Math.round(((s[i] as number) / cap) * 254) + 1)) : 0;
    }
    out[r] = q;
  }
  return out;
}

export function worldView(w: WorldState): WorldView {
  const levels = {} as Record<TileResource, string>;
  const q = quantizedLevels(w);
  for (const r of TILE_RESOURCES) levels[r] = bytesToBase64(q[r]);
  return {
    terrain: enc(w.terrain),
    owner: enc(w.owner),
    overlay: enc(w.overlay),
    fertility: enc(w.fertility),
    levels,
    assets: w.assets,
  };
}

/** Sparse per-turn delta of the client view: [tile, value] pairs per changed layer. */
export interface WorldViewDelta {
  terrain: number[];
  owner: number[];
  overlay: number[];
  fertility: number[];
  levels: Partial<Record<TileResource, number[]>>;
  /** Present only when the asset list changed this turn. */
  assets?: Asset[];
}

function diffLayer(a: Uint8Array | Int8Array, b: Uint8Array | Int8Array, tolerance = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const d = Math.abs((a[i] as number) - (b[i] as number));
    if (d > tolerance) out.push(i, b[i] as number);
  }
  return out;
}

export function diffWorldView(before: WorldState, after: WorldState): WorldViewDelta {
  const qa = quantizedLevels(before);
  const qb = quantizedLevels(after);
  const levels: Partial<Record<TileResource, number[]>> = {};
  for (const r of TILE_RESOURCES) {
    const d = diffLayer(qa[r], qb[r]);
    if (d.length) levels[r] = d;
  }
  return {
    terrain: diffLayer(before.terrain, after.terrain),
    owner: diffLayer(before.owner, after.owner),
    overlay: diffLayer(before.overlay, after.overlay),
    fertility: diffLayer(before.fertility, after.fertility),
    levels,
    ...(JSON.stringify(before.assets) !== JSON.stringify(after.assets) ? { assets: after.assets } : {}),
  };
}
