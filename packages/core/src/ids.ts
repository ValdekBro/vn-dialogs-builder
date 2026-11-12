/** ID prefixes by entity type (SCHEMA.md, section 1.6). */
export const ID_PREFIX = {
  project: "prj",
  character: "chr",
  scene: "scn",
  block: "blk",
  line: "ln",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const ID_LENGTH = 10;

/** ID generator. Commands receive it from outside so IDs are predictable in tests. */
export type IdGenerator = (prefix: IdPrefix) => string;

/** Random IDs: `<prefix>_` + 10 characters from the nanoid alphabet. */
export const randomId: IdGenerator = (prefix) => {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 63];
  return `${prefix}_${out}`;
};

/** Deterministic generator for tests: `blk_0000000001`, `blk_0000000002`, ... */
export function sequentialIds(): IdGenerator {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(ID_LENGTH, "0")}`;
  };
}
