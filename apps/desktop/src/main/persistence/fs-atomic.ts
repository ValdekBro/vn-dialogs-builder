import { randomBytes } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";

/**
 * Атомарний запис: спершу тимчасовий файл поруч, потім перейменування.
 * Якщо процес впаде посеред запису, старий файл лишиться цілим.
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
