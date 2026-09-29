// Proportional, order-independent allocation of shared tile resource pools.
// Demands are processed in sorted key order, so the input array order never changes results.

export interface Demand {
  key: string;
  amount: number;
  tiles: number[];
}

/**
 * Each demand spreads its request across its tiles in proportion to the stock on each tile.
 * When requests on a tile exceed its stock, every request on that tile is scaled down equally.
 * Mutates `stock`; returns the (fractional) amount granted per demand key.
 */
export function allocate(stock: Float32Array, demands: Demand[]): Map<string, number> {
  const sorted = [...demands].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const requests = new Map<number, number>();
  const perDemand: { key: string; req: Map<number, number> }[] = [];
  for (const d of sorted) {
    const req = new Map<number, number>();
    if (d.amount > 0) {
      let available = 0;
      for (const t of d.tiles) available += stock[t] as number;
      if (available > 0) {
        const want = Math.min(d.amount, available);
        for (const t of d.tiles) {
          const s = stock[t] as number;
          if (s <= 0) continue;
          const r = (want * s) / available;
          req.set(t, (req.get(t) ?? 0) + r);
        }
      }
    }
    for (const [t, r] of req) requests.set(t, (requests.get(t) ?? 0) + r);
    perDemand.push({ key: d.key, req });
  }
  const scale = new Map<number, number>();
  for (const [t, total] of requests) {
    const s = stock[t] as number;
    scale.set(t, total > s ? s / total : 1);
  }
  const granted = new Map<string, number>();
  for (const { key, req } of perDemand) {
    let g = 0;
    for (const [t, r] of req) g += r * (scale.get(t) as number);
    granted.set(key, (granted.get(key) ?? 0) + g);
  }
  for (const [t, total] of requests) {
    const s = stock[t] as number;
    stock[t] = Math.max(0, s - Math.min(s, total));
  }
  return granted;
}

/**
 * Split an integer budget among claimants proportionally; leftover units go to claimants with the
 * largest remainders, ties broken by a keyed draw (never by array order).
 */
export function apportion(total: number, claims: { key: string; weight: number }[], tieBreak: (key: string) => number): Map<string, number> {
  const out = new Map<string, number>();
  const sumW = claims.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (total <= 0 || sumW <= 0) {
    for (const c of claims) out.set(c.key, 0);
    return out;
  }
  const rows = claims.map((c) => {
    const exact = (total * Math.max(0, c.weight)) / sumW;
    return { key: c.key, base: Math.floor(exact), rem: exact - Math.floor(exact), tb: tieBreak(c.key) };
  });
  let left = total - rows.reduce((s, r) => s + r.base, 0);
  rows.sort((a, b) => b.rem - a.rem || b.tb - a.tb || (a.key < b.key ? -1 : 1));
  for (const r of rows) {
    const extra = left > 0 && r.rem > 0 ? 1 : 0;
    left -= extra;
    out.set(r.key, r.base + extra);
  }
  return out;
}
