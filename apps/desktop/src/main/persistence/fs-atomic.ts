import { randomBytes } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";

/**
 * Atomic write: first a temporary file next to it, then a rename.
 * If the process dies mid-write, the old file stays intact.
 */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } catch (e) {
    await handle.close();
    await rm(tmp, { force: true });
    throw e;
  }
  await handle.close();
  try {
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}
