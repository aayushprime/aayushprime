import { readFileSync, unlinkSync } from "node:fs";
import { PID_FILE } from "./config.ts";
import { isHugo } from "./hugo.ts";

/**
 * Stop the Hugo the studio left running.
 *
 * The server outlives the editor on purpose, so there has to be something that
 * ends it deliberately. `pnpm stop` from studio/, or read the pid out of the
 * file and signal it yourself — that is all this does.
 */
function main(): void {
  let pid: number;

  try {
    const record: unknown = JSON.parse(readFileSync(PID_FILE, "utf8"));
    pid = (record as { pid?: number }).pid ?? 0;
  } catch {
    console.log("studio: no hugo recorded as running");
    return;
  }

  if (!isHugo(pid)) {
    console.log(`studio: no hugo at pid ${pid}; clearing the record`);
    unlinkSync(PID_FILE);
    return;
  }

  process.kill(pid, "SIGTERM");
  unlinkSync(PID_FILE);
  console.log(`studio: stopped hugo (pid ${pid})`);
}

main();
