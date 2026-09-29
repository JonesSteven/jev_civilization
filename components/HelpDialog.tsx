"use client";

import { useEffect, useRef } from "react";
import { HELP } from "@/content/help";

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2 id="help-title">How Jev Civilizations works</h2>
        {HELP.map((s) => (
          <section key={s.id} style={{ marginBottom: 12 }}>
            <h3>{s.title}</h3>
            {s.body.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
