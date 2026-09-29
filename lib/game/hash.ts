// Non-cryptographic stable hashing for state integrity checks (replay verification).
// Two independent 32-bit FNV-1a lanes combined into a 64-bit hex digest.

export class StateHasher {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x9e3779b9;

  bytes(u8: Uint8Array): this {
    let a = this.a,
      b = this.b;
    for (let i = 0; i < u8.length; i++) {
      const v = u8[i] as number;
      a = Math.imul(a ^ v, 0x01000193);
      b = Math.imul(b ^ v, 0x5bd1e995);
      b ^= b >>> 15;
    }
    this.a = a >>> 0;
    this.b = b >>> 0;
    return this;
  }

  typed(arr: ArrayBufferView): this {
    return this.bytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
  }

  string(s: string): this {
    return this.bytes(new TextEncoder().encode(s));
  }

  digest(): string {
    return this.a.toString(16).padStart(8, "0") + this.b.toString(16).padStart(8, "0");
  }
}

/** Deterministic JSON serialization with sorted object keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}
