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
          <li><strong>You shape the world, not the tribes.</strong> You choose what the weather and land do, on every turn or taking turns with the computer, depending on how you set up the match. Many events strike one highlighted region, and each option says which tribes it will likely help or hurt.</li>
          <li><strong>The tribes decide for themselves.</strong> {mode === "mock" ? "A local mock policy (standing in for Jev)" : "Jev"} chooses what each tribe does, and the game engine works out the results. The inspector shows exactly why.</li>
          <li><strong>Read the story.</strong> After every turn a short summary says who gained or lost people and why. Tribes can starve, break apart, be conquered, or join a larger neighbour; the last tribe standing wins.</li>
        </ol>
        <p className="small muted">Luck matters: a bitter winter or a plague in the wrong place can bring a thriving tribe down, and a good harvest can start a boom. Drag the map to pan, scroll to zoom, and click a tile or tribe for details.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Start watching</button>
        </div>
      </div>
    </div>
  );
}
