import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractTargets, resolveTargets } from "../src/content/links.ts";
import { parseFile } from "../src/content/parse.ts";

const SITE = join(import.meta.dirname, "../../..");

function hugoAvailable(): boolean {
  try {
    execFileSync("hugo", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

type GraphLink = { source: string; target: string; kind: string };

/** Every note→note edge the site itself renders, as "from→to" strings. */
function siteEdges(): Set<string> {
  const out = mkdtempSync(join(tmpdir(), "studio-graph-"));
  try {
    execFileSync("hugo", ["--destination", out, "--buildDrafts", "--quiet"], {
      cwd: SITE,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const graph = JSON.parse(readFileSync(join(out, "notes", "graph.json"), "utf8")) as {
      links: GraphLink[];
    };
    return new Set(
      graph.links
        .filter((l) => l.kind === "wiki")
        .map((l) => `${l.source.replace(/^note:/, "")}→${l.target.replace(/^note:/, "")}`),
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** The same edge set, derived the way the editor derives it. */
function editorEdges(): Set<string> {
  const dir = join(SITE, "content", "notes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "_index.md");
  const slugs = new Set(files.map((f) => f.slice(0, -3).toLowerCase()));

  const edges = new Set<string>();
  for (const file of files) {
    const from = file.slice(0, -3).toLowerCase();
    const body = parseFile(readFileSync(join(dir, file), "utf8")).body;
    const { resolved } = resolveTargets(extractTargets(body, { bareTokens: true }), slugs, from);
    for (const to of resolved) edges.add(`${from}→${to}`);
  }
  return edges;
}

describe.skipIf(!hugoAvailable())("graph parity", () => {
  it("derives exactly the note→note edges the site renders into graph.json", () => {
    const site = siteEdges();
    const editor = editorEdges();

    expect(site.size).toBeGreaterThan(0);
    expect([...editor].sort()).toEqual([...site].sort());
  });
});
