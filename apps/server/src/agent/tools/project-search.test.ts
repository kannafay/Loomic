import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { FilesystemBackend } from "deepagents";
import { afterEach, beforeEach, expect, it } from "vitest";

import { createProjectSearchTool, runProjectSearch } from "./project-search.js";

const fixturePrefix = join(resolve(tmpdir()), "loomic-search-");
let fixtureRoot: string;
let backend: FilesystemBackend;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(fixturePrefix);
  await mkdir(join(fixtureRoot, "workspace"));
  await writeFile(join(fixtureRoot, "workspace", "a.md"), "alpha first\nbeta\nalpha second\n");
  await writeFile(join(fixtureRoot, "workspace", "b.txt"), "alpha third\n");
  backend = new FilesystemBackend({ rootDir: fixtureRoot, virtualMode: true });
});

afterEach(async () => {
  const target = resolve(fixtureRoot);
  if (!target.startsWith(fixturePrefix) || target.slice(fixturePrefix.length).includes(sep)) {
    throw new Error("Unexpected test fixture path");
  }
  await rm(target, { recursive: true, force: true });
});

it("searches a real v2 filesystem backend and limits the displayed matches", async () => {
  const result = await runProjectSearch(backend, { query: "alpha", maxMatches: 2 });
  expect(result.matchCount).toBe(3);
  expect(result.matches).toEqual([
    { path: "/workspace/a.md", line: 1, text: "alpha first" },
    { path: "/workspace/a.md", line: 3, text: "alpha second" },
  ]);
  expect(result.summary).toContain("across 2 file(s)");
});

it("passes the file filter to the filesystem backend", async () => {
  const result = await runProjectSearch(backend, { query: "alpha", glob: "*.txt" });
  expect(result.matchCount).toBe(1);
  expect(result.matches).toEqual([
    { path: "/workspace/b.txt", line: 1, text: "alpha third" },
  ]);
});

it("awaits an asynchronous backend factory before searching", async () => {
  const search = createProjectSearchTool(async () => backend);
  const result = await search.invoke({ query: "beta" });
  expect(result).toMatchObject({
    matchCount: 1,
    matches: [{ path: "/workspace/a.md", line: 2, text: "beta" }],
  });
});
