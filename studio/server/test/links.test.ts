import { describe, expect, it } from "vitest";
import { extractTargets, resolveTargets, stripCode, buildBacklinks } from "../src/content/links.ts";

const NOTES = { bareTokens: true };
const POSTS = { bareTokens: false };

describe("stripCode", () => {
  it("removes fenced blocks so links inside samples are not edges", () => {
    expect(stripCode("a\n```\n[[ghost]]\n```\nb")).not.toContain("ghost");
  });

  it("removes tilde fences", () => {
    expect(stripCode("a\n~~~\n[[ghost]]\n~~~\nb")).not.toContain("ghost");
  });

  it("removes inline code spans", () => {
    expect(stripCode("use `[[ghost]]` here")).not.toContain("ghost");
  });

  it("does not let an inline span swallow across lines", () => {
    // A stray backtick on one line must not eat a real link on the next.
    expect(stripCode("a ` b\n[[real]]\n")).toContain("real");
  });
});

describe("extractTargets", () => {
  it("finds plain wikilinks", () => {
    expect(extractTargets("see [[tmux]] now", NOTES)).toEqual(["tmux"]);
  });

  it("finds labelled wikilinks and keeps the target, not the label", () => {
    expect(extractTargets("see [[tmux|the tmux note]]", NOTES)).toEqual(["tmux"]);
  });

  it("trims whitespace inside the brackets", () => {
    expect(extractTargets("[[  tmux  ]]", NOTES)).toEqual(["tmux"]);
  });

  it("lowercases targets", () => {
    expect(extractTargets("[[Tmux]] [[FORCE-layouts]]", NOTES)).toEqual(["tmux", "force-layouts"]);
  });

  it("finds bare-token markdown links in notes", () => {
    expect(extractTargets("[the pty note](pty)", NOTES)).toEqual(["pty"]);
  });

  it("ignores bare-token markdown links outside notes", () => {
    expect(extractTargets("[the pty note](pty)", POSTS)).toEqual([]);
  });

  it("leaves ordinary links alone", () => {
    const md = [
      "[abs](/posts/x/)",
      "[ext](https://example.com)",
      "[file](thing.png)",
      "[anchor](#section)",
      "[nested](a/b)",
      "[upper](Pty)",
    ].join(" ");
    expect(extractTargets(md, NOTES)).toEqual([]);
  });

  it("still sees a wikilink inside an ordinary markdown link's text", () => {
    expect(extractTargets("[[tmux]] and [text](https://x.com)", NOTES)).toEqual(["tmux"]);
  });

  it("dedupes while keeping first-seen order", () => {
    expect(extractTargets("[[b]] [[a]] [[b]]", NOTES)).toEqual(["b", "a"]);
  });

  it("ignores links inside code", () => {
    expect(extractTargets("```\n[[ghost]]\n```\n[[real]]", NOTES)).toEqual(["real"]);
  });
});

describe("resolveTargets", () => {
  const known = new Set(["tmux", "pty", "oklch"]);

  it("splits known from unknown", () => {
    const r = resolveTargets(["tmux", "nope", "pty"], known, "oklch");
    expect(r.resolved).toEqual(["tmux", "pty"]);
    expect(r.broken).toEqual(["nope"]);
  });

  it("drops self-links entirely rather than calling them broken", () => {
    const r = resolveTargets(["oklch", "tmux"], known, "oklch");
    expect(r.resolved).toEqual(["tmux"]);
    expect(r.broken).toEqual([]);
  });
});

describe("buildBacklinks", () => {
  it("reverses the edge list", () => {
    const outgoing = new Map([
      ["a", ["b", "c"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    const back = buildBacklinks(outgoing);
    expect(back.get("c")).toEqual(["a", "b"]);
    expect(back.get("b")).toEqual(["a"]);
    expect(back.get("a") ?? []).toEqual([]);
  });
});
