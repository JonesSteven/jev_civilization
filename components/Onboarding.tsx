"use client";

import { useEffect, useRef } from "react";

export default function Onboarding({ onClose, mode }: { onClose: () => void; mode: "live" | "mock" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="onboard-title" tabIndex={-1} ref={ref}>
        <h2 id="onboard-title">Welcome to the valley</h2>
        <ol className="onboard-steps">
          <li><strong>The map</strong> shows water, meadow, forest, and mountains. Drag to pan, scroll or pinch to zoom, click a tile to inspect it. Overlays show territory and resources.</li>
          <li><strong>The environment card</strong> is your only influence. On odd turns you pick one of three changes; its area glows on the map. On even turns Nature picks at random.</li>
          <li><strong>The tribes panel</strong> ranks all four tribes by civilization score. Select any tribe to see its food, shelter, technologies, and memories.</li>
          <li><strong>The turn indicator</strong> shows the turn (1–100), season, and who chooses the environment. Two turns make a season.</li>
          <li>
            <strong>The decision inspector</strong> shows exactly what {mode === "mock" ? "the mock policy (standing in for Jev)" : "Jev"} was given and the probability it assigned to each legal action. The game engine
            then calculates every result.
          </li>
        </ol>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Start watching</button>
        </div>
      </div>
    </div>
  );
}
