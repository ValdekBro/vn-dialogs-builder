/** Префікси ID за типом сутності (SCHEMA.md, розділ 1.6). */
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

/** Генератор ID. Команди отримують його ззовні, щоб у тестах ID були передбачуваними. */
export type IdGenerator = (prefix: IdPrefix) => string;

/** Випадкові ID: `<prefix>_` + 10 символів з алфавіту nanoid. */
export const randomId: IdGenerator = (prefix) => {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 63];
  return `${prefix}_${out}`;
};

/** Детермінований генератор для тестів: `blk_0000000001`, `blk_0000000002`, ... */
export function sequentialIds(): IdGenerator {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(ID_LENGTH, "0")}`;
  };
}
