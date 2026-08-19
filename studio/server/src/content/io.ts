import { randomBytes } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write via a temporary file in the same directory, then rename.
 *
 * Autosave fires while the file is also being watched and may be open in
 * another editor; a partial write would be observable. Rename within a
 * directory is atomic on the platforms this runs on.
 */
export async function writeFileAtomic(path: string, contents: string | Buffer): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.studio-${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, contents);
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Run steps in order, undoing the ones that succeeded if a later one fails.
 *
 * Renaming a page touches two directory trees and every file that links to
 * it. Half of that is worse than none of it.
 */
export async function transaction<T>(
  run: (step: <R>(forward: () => Promise<R>, undo: () => Promise<void>) => Promise<R>) => Promise<T>,
): Promise<T> {
  const undos: (() => Promise<void>)[] = [];

  const step = async <R>(forward: () => Promise<R>, undo: () => Promise<void>): Promise<R> => {
    const result = await forward();
    undos.push(undo);
    return result;
  };

  try {
    return await run(step);
  } catch (err) {
    for (const undo of undos.reverse()) {
      await undo().catch(() => {
        // Nothing useful to do if rollback also fails; the original error is
        // the one worth reporting.
      });
    }
    throw err;
  }
}
