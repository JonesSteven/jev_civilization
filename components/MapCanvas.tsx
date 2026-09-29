"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { TRIBES } from "@/content/tribes";
import { MAP_HEIGHT, MAP_WIDTH, Overlay, TRIBE_IDS, type Asset, type TileResource, type TribeId } from "@/lib/game/types";
import type { DecodedWorld } from "@/lib/client/world";

export const TS = 12; // offscreen pixels per tile
const W = MAP_WIDTH * TS;
const H = MAP_HEIGHT * TS;

export type OverlayMode = "none" | "ownership" | TileResource | "fertility";

export interface MapSettlement {
  id: TribeId;
  tile: number;
  alive: boolean;
  /** Portable camp condition 0–100, or null when the tribe has no camp shelter. */
  camp?: number | null;
  /** Additional settlements founded after scouting. */
  outposts?: number[];
  /** Sites reported by scouts (shown as dashed rings). */
  scouted?: number[];
}

export type MapAnimation =
  | { kind: "path"; path: number[]; color: string; style: "raid" | "move" | "recruit"; success?: boolean }
  | { kind: "pulse"; tiles: number[]; color: string }
  | { kind: "flash"; tiles: number[] | null };

export interface MapHandle {
  focusTile: (tile: number) => void;
  fit: () => void;
}

interface Props {
  world: DecodedWorld;
  settlements: MapSettlement[];
  overlay: OverlayMode;
  showOwnership: boolean;
  footprint: number[] | null | undefined; // undefined = none; null = whole world
  selectedTile: number | null;
  supportedTribe: TribeId | null;
  onSelectTile: (tile: number | null) => void;
  animations: { id: number; items: MapAnimation[]; durationMs: number } | null;
  reducedMotion: boolean;
  handleRef?: Ref<MapHandle>;
  label: string;
  /** Tiles to frame on first render (e.g. living settlements). */
  initialFocus?: number[];
}

const TERRAIN_BASE = ["#5f93c4", "#a7c979", "#5f8f4a", "#9d9587"];

function hash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

function drawTerrain(ctx: CanvasRenderingContext2D, world: DecodedWorld) {
  ctx.clearRect(0, 0, W, H);
  const { terrain, overlay } = world;
  for (let i = 0; i < terrain.length; i++) {
    const x = (i % MAP_WIDTH) * TS;
    const y = Math.floor(i / MAP_WIDTH) * TS;
    const t = terrain[i] as number;
    const o = overlay[i] as number;
    const r = hash(i);
    ctx.fillStyle = shade(TERRAIN_BASE[t] as string, Math.round((r - 0.5) * 14));
    ctx.fillRect(x, y, TS, TS);
    if (t === 0) {
      if (r > 0.82) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 6);
        ctx.quadraticCurveTo(x + 5, y + 4, x + 8, y + 6);
        ctx.stroke();
      }
    } else if (t === 2) {
      const thinned = (o & Overlay.Thinned) !== 0;
      ctx.fillStyle = thinned ? "rgba(52,90,40,0.55)" : "#3d6b30";
      const n = thinned ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const tx = x + 2 + ((r * 97 + k * 5) % 7);
        const ty = y + 3 + ((r * 53 + k * 3) % 5);
        ctx.beginPath();
        ctx.moveTo(tx, ty + 6);
        ctx.lineTo(tx + 2.5, ty);
        ctx.lineTo(tx + 5, ty + 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (t === 3) {
      ctx.fillStyle = "#7c7468";
      ctx.beginPath();
      ctx.moveTo(x + 1, y + TS - 2);
      ctx.lineTo(x + TS / 2, y + 2 + r * 3);
      ctx.lineTo(x + TS - 1, y + TS - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(x + TS / 2 - 1.8, y + 5 + r * 3);
      ctx.lineTo(x + TS / 2, y + 2 + r * 3);
      ctx.lineTo(x + TS / 2 + 1.8, y + 5 + r * 3);
      ctx.fill();
    } else if (t === 1 && r > 0.9) {
      ctx.fillStyle = "rgba(80,120,50,0.35)";
      ctx.fillRect(x + 3, y + 5, 1, 3);
      ctx.fillRect(x + 6, y + 4, 1, 4);
    }
    if (o & Overlay.Flooded) {
      ctx.fillStyle = "rgba(70,120,200,0.45)";
      ctx.fillRect(x, y, TS, TS);
    }
    if (o & Overlay.Burned) {
      ctx.fillStyle = "rgba(50,30,20,0.55)";
      ctx.fillRect(x, y, TS, TS);
    }
    if (o & Overlay.Wheat) {
      ctx.fillStyle = "#e3c15a";
      ctx.fillRect(x + 3, y + 3, 2, 2);
      ctx.fillRect(x + 7, y + 7, 2, 2);
    }
    if (o & Overlay.Fruit) {
      ctx.fillStyle = "#c2415b";
      ctx.beginPath();
      ctx.arc(x + 4, y + 8, 1.4, 0, Math.PI * 2);
      ctx.arc(x + 8, y + 5, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o & Overlay.Cave) {
      ctx.fillStyle = "#2a2622";
      ctx.beginPath();
      ctx.arc(x + TS / 2, y + TS - 2, 3, Math.PI, 0);
      ctx.fill();
    }
    if (o & Overlay.Sheltered) {
      ctx.strokeStyle = "rgba(255,245,210,0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, TS - 5, TS - 5);
    }
    if (o & Overlay.Ruin) {
      ctx.strokeStyle = "rgba(60,40,30,0.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + TS - 2, y + TS - 2);
      ctx.moveTo(x + TS - 2, y + 2);
      ctx.lineTo(x + 2, y + TS - 2);
      ctx.stroke();
    }
  }
}

function drawOwnership(ctx: CanvasRenderingContext2D, world: DecodedWorld) {
  ctx.clearRect(0, 0, W, H);
  const { owner } = world;
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i] as number;
    if (o < 0) continue;
    const tribe = TRIBE_IDS[o] as TribeId;
    const x = (i % MAP_WIDTH) * TS;
    const y = Math.floor(i / MAP_WIDTH) * TS;
    ctx.fillStyle = TRIBES[tribe].color + "4d";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = TRIBES[tribe].colorDark;
    const col = i % MAP_WIDTH;
    if (i < MAP_WIDTH || owner[i - MAP_WIDTH] !== o) ctx.fillRect(x, y, TS, 1.5);
    if (i >= MAP_WIDTH * (MAP_HEIGHT - 1) || owner[i + MAP_WIDTH] !== o) ctx.fillRect(x, y + TS - 1.5, TS, 1.5);
    if (col === 0 || owner[i - 1] !== o) ctx.fillRect(x, y, 1.5, TS);
    if (col === MAP_WIDTH - 1 || owner[i + 1] !== o) ctx.fillRect(x + TS - 1.5, y, 1.5, TS);
  }
}

const RESOURCE_COLOR: Record<string, [number, number, number]> = {
  forage: [214, 120, 40],
  wildlife: [150, 80, 30],
  fish: [20, 80, 200],
  timber: [20, 90, 30],
  stone: [70, 70, 90],
  fertility: [180, 140, 20],
};

function drawResource(ctx: CanvasRenderingContext2D, world: DecodedWorld, mode: OverlayMode) {
  ctx.clearRect(0, 0, W, H);
  if (mode === "none" || mode === "ownership") return;
  const color = RESOURCE_COLOR[mode] as [number, number, number];
  const img = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
  for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
    let v = 0;
    let has = false;
    if (mode === "fertility") {
      const f = world.fertility[i] as number;
      has = f > 0 && world.terrain[i] === 1;
      v = Math.min(1, f / 160);
    } else {
      const q = world.levels[mode][i] as number;
      has = q > 0;
      v = (q - 1) / 254;
    }
    const p = i * 4;
    if (!has) {
      img.data[p + 3] = 90;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = 245;
      continue;
    }
    img.data[p] = color[0];
    img.data[p + 1] = color[1];
    img.data[p + 2] = color[2];
    img.data[p + 3] = Math.round(40 + v * 170);
  }
  const small = document.createElement("canvas");
  small.width = MAP_WIDTH;
  small.height = MAP_HEIGHT;
  (small.getContext("2d") as CanvasRenderingContext2D).putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
}

function drawFootprint(ctx: CanvasRenderingContext2D, footprint: number[] | null | undefined) {
  ctx.clearRect(0, 0, W, H);
  if (footprint === undefined) return;
  if (footprint === null) {
    ctx.strokeStyle = "rgba(255,215,90,0.95)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    return;
  }
  const mask = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (const t of footprint) mask[t] = 1;
  ctx.fillStyle = "rgba(255,226,120,0.28)";
  for (const t of footprint) ctx.fillRect((t % MAP_WIDTH) * TS, Math.floor(t / MAP_WIDTH) * TS, TS, TS);
  ctx.fillStyle = "rgba(200,140,0,0.95)";
  for (const t of footprint) {
    const x = (t % MAP_WIDTH) * TS,
      y = Math.floor(t / MAP_WIDTH) * TS,
      col = t % MAP_WIDTH;
    if (t < MAP_WIDTH || !mask[t - MAP_WIDTH]) ctx.fillRect(x, y, TS, 2);
    if (t >= MAP_WIDTH * (MAP_HEIGHT - 1) || !mask[t + MAP_WIDTH]) ctx.fillRect(x, y + TS - 2, TS, 2);
    if (col === 0 || !mask[t - 1]) ctx.fillRect(x, y, 2, TS);
    if (col === MAP_WIDTH - 1 || !mask[t + 1]) ctx.fillRect(x + TS - 2, y, 2, TS);
  }
}

function center(tile: number): [number, number] {
  return [(tile % MAP_WIDTH) * TS + TS / 2, Math.floor(tile / MAP_WIDTH) * TS + TS / 2];
}

function drawAsset(ctx: CanvasRenderingContext2D, a: Asset) {
  const [cx, cy] = center(a.tile);
  const color = a.owner ? TRIBES[a.owner].colorDark : "#5b4c40";
  const alpha = a.owner ? 1 : 0.5;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  switch (a.kind) {
    case "farm":
      ctx.fillStyle = "#e7c75d";
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      ctx.beginPath();
      for (let k = -3; k <= 3; k += 3) {
        ctx.moveTo(cx - 5, cy + k);
        ctx.lineTo(cx + 5, cy + k);
      }
      ctx.stroke();
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
      break;
    case "hunt":
      ctx.fillStyle = "#f3e7d3";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy + 3);
      ctx.lineTo(cx + 3, cy - 3);
      ctx.moveTo(cx + 3, cy - 3);
      ctx.lineTo(cx + 0.5, cy - 3);
      ctx.moveTo(cx + 3, cy - 3);
      ctx.lineTo(cx + 3, cy - 0.5);
      ctx.stroke();
      break;
    case "fishery":
      ctx.fillStyle = "#dcecf8";
      ctx.beginPath();
      ctx.ellipse(cx - 1, cy, 4.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy);
      ctx.lineTo(cx + 6, cy - 3);
      ctx.lineTo(cx + 6, cy + 3);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      break;
    case "housing": {
      const cond = (a.condition ?? 100) / 100;
      ctx.fillStyle = a.housingType === "stone" || a.housingType === "cave" ? "#c9c5d6" : "#d8a868";
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 1);
      ctx.lineTo(cx, cy - 6);
      ctx.lineTo(cx + 5, cy - 1);
      ctx.lineTo(cx + 5, cy + 5);
      ctx.lineTo(cx - 5, cy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (cond < 0.7) {
        ctx.strokeStyle = "#8a1c1c";
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy + 1);
        ctx.lineTo(cx + 3, cy + 4);
        ctx.stroke();
      }
      break;
    }
    case "defenses":
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = -5; k <= 5; k += 2.5) {
        ctx.moveTo(cx + k, cy + 6);
        ctx.lineTo(cx + k, cy - 6);
      }
      ctx.stroke();
      break;
  }
  ctx.globalAlpha = 1;
}

function drawOutposts(ctx: CanvasRenderingContext2D, s: MapSettlement, scale: number) {
  const p = TRIBES[s.id];
  const r = Math.max(6, 7 / Math.sqrt(scale));
  for (const tile of s.scouted ?? []) {
    const [sx, sy] = center(tile);
    ctx.strokeStyle = p.colorDark;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const tile of s.outposts ?? []) {
    const [ox, oy] = center(tile);
    ctx.fillStyle = s.alive ? p.color : "rgba(60,50,40,0.6)";
    ctx.strokeStyle = p.colorDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(ox - r, oy - r, r * 2, r * 2);
    ctx.fill();
    ctx.stroke();
    if (s.alive) {
      ctx.fillStyle = "#fffaf0";
      ctx.font = `bold ${Math.round(r * 1.2)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.name[0] as string, ox, oy + 0.5);
    }
  }
}

function drawSettlement(ctx: CanvasRenderingContext2D, s: MapSettlement, supported: boolean, scale: number) {
  const [cx, cy] = center(s.tile);
  const r = Math.max(8, 10 / Math.sqrt(scale));
  const p = TRIBES[s.id];
  drawOutposts(ctx, s, scale);
  if (!s.alive) {
    ctx.fillStyle = "rgba(60,50,40,0.6)";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (s.camp !== null && s.camp !== undefined) {
    // Portable camp tents travel with the settlement; a dark mark shows weather damage.
    for (const [dx, dy] of [[-r - 5, 4], [r + 5, 4], [0, r + 6]] as const) {
      ctx.fillStyle = "#efe2c4";
      ctx.strokeStyle = p.colorDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + dx - 4, cy + dy + 3);
      ctx.lineTo(cx + dx, cy + dy - 4);
      ctx.lineTo(cx + dx + 4, cy + dy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (s.camp < 70) {
        ctx.fillStyle = "#8a1c1c";
        ctx.fillRect(cx + dx - 1, cy + dy, 2, 2);
      }
    }
  }
  if (supported) {
    ctx.strokeStyle = "#fff6c8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.colorDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fffaf0";
  ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.name[0] as string, cx, cy + 0.5);
  ctx.font = `600 ${Math.round(Math.max(9, 11 / Math.sqrt(scale)))}px system-ui, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,250,240,0.9)";
  ctx.strokeText(p.name, cx, cy - r - 8);
  ctx.fillStyle = p.colorDark;
  ctx.fillText(p.name, cx, cy - r - 8);
}

export default function MapCanvas(props: Props) {
  const { world, settlements, overlay, showOwnership, footprint, selectedTile, supportedTribe, animations, reducedMotion, handleRef, label } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const layers = useRef<{ terrain: HTMLCanvasElement; own: HTMLCanvasElement; res: HTMLCanvasElement; foot: HTMLCanvasElement } | null>(null);
  const cam = useRef({ x: 0, y: 0, scale: 0.5 });
  const size = useRef({ w: 800, h: 520, dpr: 1 });
  const anim = useRef<{ start: number; items: MapAnimation[]; duration: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [hoverTile, setHoverTile] = useState<number | null>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const L = layers.current;
    if (!canvas || !L) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const { w, h, dpr } = size.current;
    const c = cam.current;
    const p = propsRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#e8e0cf";
    ctx.fillRect(0, 0, w * dpr, h * dpr);
    ctx.setTransform(c.scale * dpr, 0, 0, c.scale * dpr, -c.x * c.scale * dpr, -c.y * c.scale * dpr);
    ctx.imageSmoothingEnabled = c.scale < 1.5;
    ctx.drawImage(L.terrain, 0, 0);
    if (p.showOwnership) ctx.drawImage(L.own, 0, 0);
    if (p.overlay !== "none" && p.overlay !== "ownership") ctx.drawImage(L.res, 0, 0);
    ctx.drawImage(L.foot, 0, 0);
    if (c.scale > 0.45) for (const a of p.world.assets) drawAsset(ctx, a);
    // Animations
    const A = anim.current;
    if (A) {
      const t = Math.min(1, (performance.now() - A.start) / A.duration);
      for (const item of A.items) {
        if (item.kind === "path" && item.path.length > 1) {
          const n = Math.max(1, Math.floor(item.path.length * t));
          ctx.strokeStyle = item.color;
          ctx.lineWidth = item.style === "raid" ? 3 : 2.5;
          ctx.setLineDash(item.style === "raid" ? [6, 4] : item.style === "recruit" ? [2, 4] : []);
          ctx.beginPath();
          const [sx, sy] = center(item.path[0] as number);
          ctx.moveTo(sx, sy);
          for (let k = 1; k < n; k++) {
            const [px, py] = center(item.path[k] as number);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          const [hx, hy] = center(item.path[n - 1] as number);
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.arc(hx, hy, 5, 0, Math.PI * 2);
          ctx.fill();
          if (t >= 1 && item.style === "raid") {
            ctx.font = "bold 16px system-ui";
            ctx.fillStyle = item.success ? "#8a1c1c" : "#444";
            ctx.fillText(item.success ? "✕" : "○", hx + 8, hy - 8);
          }
        } else if (item.kind === "pulse") {
          const rr = 6 + 10 * t;
          ctx.strokeStyle = item.color;
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = 3;
          for (const tile of item.tiles) {
            const [px, py] = center(tile);
            ctx.beginPath();
            ctx.arc(px, py, rr, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else if (item.kind === "flash") {
          ctx.globalAlpha = 0.35 * (1 - t);
          ctx.fillStyle = "#fff2a8";
          if (item.tiles === null) ctx.fillRect(0, 0, W, H);
          else for (const tile of item.tiles) ctx.fillRect((tile % MAP_WIDTH) * TS, Math.floor(tile / MAP_WIDTH) * TS, TS, TS);
          ctx.globalAlpha = 1;
        }
      }
    }
    for (const s of p.settlements) drawSettlement(ctx, s, s.id === p.supportedTribe, c.scale);
    if (p.selectedTile !== null) {
      ctx.strokeStyle = "#1b1206";
      ctx.lineWidth = 2 / c.scale;
      ctx.strokeRect((p.selectedTile % MAP_WIDTH) * TS, Math.floor(p.selectedTile / MAP_WIDTH) * TS, TS, TS);
    }
  }, []);

  const startLoop = useCallback(() => {
    const tick = () => {
      draw();
      const A = anim.current;
      if (A && performance.now() - A.start < A.duration + 400) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        anim.current = null;
        rafRef.current = null;
        draw();
      }
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  const requestDraw = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  const clampCam = () => {
    const c = cam.current;
    const { w, h } = size.current;
    const viewW = w / c.scale,
      viewH = h / c.scale;
    c.x = viewW >= W ? (W - viewW) / 2 : Math.min(Math.max(0, c.x), W - viewW);
    c.y = viewH >= H ? (H - viewH) / 2 : Math.min(Math.max(0, c.y), H - viewH);
  };

  const fit = useCallback(() => {
    const { w, h } = size.current;
    const c = cam.current;
    c.scale = Math.min(w / W, h / H);
    clampCam();
    requestDraw();
  }, [requestDraw]);

  const focusTile = useCallback(
    (tile: number) => {
      const c = cam.current;
      const { w, h } = size.current;
      c.scale = Math.max(c.scale, 1.2);
      const [px, py] = center(tile);
      c.x = px - w / c.scale / 2;
      c.y = py - h / c.scale / 2;
      clampCam();
      requestDraw();
    },
    [requestDraw],
  );

  useImperativeHandle(handleRef, () => ({ focusTile, fit }), [focusTile, fit]);

  // Create layers once.
  useEffect(() => {
    layers.current = { terrain: makeCanvas(), own: makeCanvas(), res: makeCanvas(), foot: makeCanvas() };
  }, []);

  // Rebuild cached layers only when their inputs change.
  useEffect(() => {
    const L = layers.current;
    if (!L) return;
    drawTerrain(L.terrain.getContext("2d") as CanvasRenderingContext2D, world);
    drawOwnership(L.own.getContext("2d") as CanvasRenderingContext2D, world);
    requestDraw();
  }, [world, requestDraw]);

  useEffect(() => {
    const L = layers.current;
    if (!L) return;
    drawResource(L.res.getContext("2d") as CanvasRenderingContext2D, world, overlay);
    requestDraw();
  }, [world, overlay, requestDraw]);

  useEffect(() => {
    const L = layers.current;
    if (!L) return;
    drawFootprint(L.foot.getContext("2d") as CanvasRenderingContext2D, footprint);
    requestDraw();
  }, [footprint, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [settlements, selectedTile, showOwnership, supportedTribe, requestDraw]);

  useEffect(() => {
    if (!animations || reducedMotion || animations.items.length === 0) {
      requestDraw();
      return;
    }
    anim.current = { start: performance.now(), items: animations.items, duration: animations.durationMs };
    startLoop();
  }, [animations, reducedMotion, startLoop, requestDraw]);

  // Resize handling.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      if (first) {
        first = false;
        const focus = propsRef.current.initialFocus;
        if (focus && focus.length) {
          const xs = focus.map((t) => (t % MAP_WIDTH) * TS);
          const ys = focus.map((t) => Math.floor(t / MAP_WIDTH) * TS);
          const pad = 22 * TS;
          const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
          const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
          const c = cam.current;
          c.scale = Math.max(Math.min(rect.width / W, rect.height / H), Math.min(2.5, rect.width / (maxX - minX), rect.height / (maxY - minY)));
          c.x = (minX + maxX) / 2 - rect.width / c.scale / 2;
          c.y = (minY + maxY) / 2 - rect.height / c.scale / 2;
          clampCam();
          requestDraw();
        } else fit();
      } else {
        clampCam();
        requestDraw();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, requestDraw]);

  // Pointer interactions: drag to pan, wheel/pinch to zoom, click to inspect.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinchDist = 0;
    const toTile = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const c = cam.current;
      const wx = (clientX - rect.left) / c.scale + c.x;
      const wy = (clientY - rect.top) / c.scale + c.y;
      const tx = Math.floor(wx / TS),
        ty = Math.floor(wy / TS);
      if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return null;
      return ty * MAP_WIDTH + tx;
    };
    const zoomAt = (clientX: number, clientY: number, factor: number) => {
      const rect = canvas.getBoundingClientRect();
      const c = cam.current;
      const mx = clientX - rect.left,
        my = clientY - rect.top;
      const wx = mx / c.scale + c.x,
        wy = my / c.scale + c.y;
      const minScale = Math.min(size.current.w / W, size.current.h / H) * 0.9;
      c.scale = Math.min(5, Math.max(minScale, c.scale * factor));
      c.x = wx - mx / c.scale;
      c.y = wy - my / c.scale;
      clampCam();
      requestDraw();
    };
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        setHoverTile(toTile(e.clientX, e.clientY));
        return;
      }
      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
        pinchDist = d;
        moved = true;
        return;
      }
      const dx = e.clientX - prev.x,
        dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = cam.current;
      c.x -= dx / c.scale;
      c.y -= dy / c.scale;
      clampCam();
      requestDraw();
    };
    const onUp = (e: PointerEvent) => {
      const had = pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      if (had && !moved && pointers.size === 0) propsRef.current.onSelectTile(toTile(e.clientX, e.clientY));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    const onLeave = () => setHoverTile(null);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [requestDraw]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const c = cam.current;
    const step = 60 / c.scale;
    let handled = true;
    if (e.key === "ArrowLeft") c.x -= step;
    else if (e.key === "ArrowRight") c.x += step;
    else if (e.key === "ArrowUp") c.y -= step;
    else if (e.key === "ArrowDown") c.y += step;
    else if (e.key === "+" || e.key === "=") {
      const { w, h } = size.current;
      const cx = c.x + w / c.scale / 2,
        cy = c.y + h / c.scale / 2;
      c.scale = Math.min(5, c.scale * 1.25);
      c.x = cx - w / c.scale / 2;
      c.y = cy - h / c.scale / 2;
    } else if (e.key === "-") {
      const { w, h } = size.current;
      const cx = c.x + w / c.scale / 2,
        cy = c.y + h / c.scale / 2;
      c.scale = Math.max(Math.min(w / W, h / H) * 0.9, c.scale / 1.25);
      c.x = cx - w / c.scale / 2;
      c.y = cy - h / c.scale / 2;
    } else if (e.key === "0") fit();
    else handled = false;
    if (handled) {
      e.preventDefault();
      clampCam();
      requestDraw();
    }
  };

  const zoomButton = (factor: number) => {
    const c = cam.current;
    const { w, h } = size.current;
    const cx = c.x + w / c.scale / 2,
      cy = c.y + h / c.scale / 2;
    c.scale = Math.min(5, Math.max(Math.min(w / W, h / H) * 0.9, c.scale * factor));
    c.x = cx - w / c.scale / 2;
    c.y = cy - h / c.scale / 2;
    clampCam();
    requestDraw();
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
      />
      <div className="map-zoom" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomButton(1.3)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomButton(1 / 1.3)} aria-label="Zoom out">−</button>
        <button type="button" onClick={fit} aria-label="Fit whole map">⤢</button>
      </div>
      {hoverTile !== null && (
        <div className="map-hover" aria-hidden="true">
          ({hoverTile % MAP_WIDTH}, {Math.floor(hoverTile / MAP_WIDTH)})
        </div>
      )}
    </div>
  );
}
