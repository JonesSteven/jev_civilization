"use client";
// Per-viewer UI preferences in localStorage, read through useSyncExternalStore so server and client
// renders agree (server snapshot = defaults) without syncing state inside effects.

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: preference lasts only for this render
  }
  for (const l of listeners) l();
}

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  let value = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  const set = useCallback((v: T) => writePref(key, v), [key]);
  return [value, set];
}

function subscribeMedia(query: string) {
  return (listener: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches, () => false);
}
