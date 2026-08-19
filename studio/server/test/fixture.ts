import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig, type SiteConfig } from "../src/config.ts";

export type Fixture = {
  cfg: SiteConfig;
  root: string;
  write(relPath: string, contents: string): void;
  cleanup(): void;
};

/**
 * A throwaway site tree. Keys are paths relative to the site root, so a test
 * reads as the directory layout it is exercising.
 */
export function makeSite(files: Record<string, string> = {}): Fixture {
  // loadConfig canonicalizes, and on macOS mkdtemp hands back /var/... for a
  // directory whose real path is /private/var/... . Everything here uses the
  // config's root so the fixture and the code under test name the same files.
  const cfg = loadConfig(mkdtempSync(join(tmpdir(), "studio-fixture-")));
  const root = cfg.root;

  const write = (relPath: string, contents: string) => {
    const abs = join(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  };

  mkdirSync(join(root, "content", "posts"), { recursive: true });
  mkdirSync(join(root, "content", "notes"), { recursive: true });
  mkdirSync(join(root, "static"), { recursive: true });
  for (const [path, contents] of Object.entries(files)) write(path, contents);

  return {
    cfg,
    root,
    write,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** A minimal well-formed page. */
export function page(
  opts: { title?: string; draft?: boolean; tags?: string[]; date?: string; body?: string } = {},
): string {
  const {
    title = "Untitled",
    draft = false,
    tags = [],
    date = "2026-01-01T00:00:00+0545",
    body = "Body.\n",
  } = opts;
  return [
    "---",
    `title: "${title}"`,
    `date: ${date}`,
    `draft: ${draft}`,
    `tags: [${tags.join(", ")}]`,
    "---",
    "",
    body,
  ].join("\n");
}
