"use client";

import { TRIBES } from "@/content/tribes";
import { MAP_WIDTH, Overlay, TERRAIN_NAMES, TRIBE_IDS, type TribeId } from "@/lib/game/types";
import type { DecodedWorld } from "@/lib/client/world";

const FLAG_NAMES: [number, string][] = [
  [Overlay.Flooded, "flooded"],
  [Overlay.Burned, "burned"],
  [Overlay.Cave, "cave shelter"],
  [Overlay.Fruit, "fruit bushes"],
  [Overlay.Wheat, "wild wheat"],
  [Overlay.Ruin, "ruins"],
  [Overlay.Sheltered, "natural shelter"],
  [Overlay.Thinned, "thinned forest"],
];

function pct(q: number): string {
  return q === 0 ? "—" : `${Math.round(((q - 1) / 254) * 100)}%`;
}

export default function TileInspector({ world, tile, inFootprint, settlementOf, onClose }: { world: DecodedWorld; tile: number; inFootprint: boolean; settlementOf: TribeId | null; onClose: () => void }) {
  const owner = world.owner[tile] as number;
  const ownerId = owner >= 0 ? (TRIBE_IDS[owner] as TribeId) : null;
  const asset = world.assets.find((a) => a.tile === tile);
  const flags = FLAG_NAMES.filter(([f]) => ((world.overlay[tile] as number) & f) !== 0).map(([, n]) => n);
  const terrain = TERRAIN_NAMES[world.terrain[tile] as number];
  return (
    <section className="panel panel-pad" aria-labelledby="tile-title">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 id="tile-title">Tile ({tile % MAP_WIDTH}, {Math.floor(tile / MAP_WIDTH)}) · {terrain}</h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close tile inspector">✕</button>
      </div>
      <div className="stats small" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
        <div className="stat"><span>Owner</span><strong>{ownerId ? TRIBES[ownerId].name : "unclaimed"}</strong></div>
        <div className="stat"><span>Settlement</span><strong>{settlementOf ? TRIBES[settlementOf].name : "—"}</strong></div>
        <div className="stat"><span>Forage</span><strong>{pct(world.levels.forage[tile] as number)}</strong></div>
        <div className="stat"><span>Wildlife</span><strong>{pct(world.levels.wildlife[tile] as number)}</strong></div>
        <div className="stat"><span>Fish</span><strong>{pct(world.levels.fish[tile] as number)}</strong></div>
        <div className="stat"><span>Timber</span><strong>{pct(world.levels.timber[tile] as number)}</strong></div>
        <div className="stat"><span>Stone</span><strong>{pct(world.levels.stone[tile] as number)}</strong></div>
        <div className="stat"><span>Fertility</span><strong>{world.terrain[tile] === 1 ? `${world.fertility[tile]}%` : "—"}</strong></div>
      </div>
      <p className="small" style={{ marginTop: 6 }}>
        {asset ? `${asset.owner ? TRIBES[asset.owner].name : "Ruined"} ${asset.kind === "hunt" ? "hunting site" : asset.kind}${asset.housingType ? ` (${asset.housingType}, capacity ${asset.capacity}, condition ${asset.condition}%)` : ""}${asset.level ? ` level ${asset.level}` : ""}. ` : "No building. "}
        {flags.length ? `Features: ${flags.join(", ")}. ` : ""}
        {inFootprint ? "Inside the current event area." : ""}
      </p>
      <p className="small muted">Resource values are stock as a share of this tile&apos;s capacity.</p>
    </section>
  );
}
