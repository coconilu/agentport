import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import { applyHubTags, collectTagCounts } from "../../src/hub/match.js";
import { communityHub } from "../../src/hub/communityHub.js";
import { loadCatalogs, tagSkills } from "../../src/hub/index.js";
import { readCachedCatalog, writeCachedCatalog, cacheFile } from "../../src/hub/cache.js";
import { readClaude } from "../../src/adapters/claude.js";
import { read } from "../../src/sync.js";
import type { SkillEntry } from "../../src/ir/types.js";

describe("M. Skill hub + tag matching", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("M1: applyHubTags attaches tags from community catalog by exact id match", async () => {
    const skills: SkillEntry[] = [
      { id: "skill-creator", scope: "global", files: [], source: "/x" },
      { id: "unknown-skill", scope: "global", files: [], source: "/y" },
    ];
    const catalog = await communityHub.fetchCatalog();
    const tagged = applyHubTags(skills, [catalog]);
    const created = tagged.find((s) => s.id === "skill-creator")!;
    expect(created.tags).toContain("meta");
    expect(created.hubMatch).toEqual({ hubId: "community", hubEntryId: "skill-creator" });
    // Non-matching skill is untouched
    const unknown = tagged.find((s) => s.id === "unknown-skill")!;
    expect(unknown.tags).toBeUndefined();
    expect(unknown.hubMatch).toBeUndefined();
  });

  it("M2: collectTagCounts orders by frequency desc then alpha", () => {
    const skills: SkillEntry[] = [
      { id: "a", scope: "global", files: [], source: "/", tags: ["frontend", "ui"] },
      { id: "b", scope: "global", files: [], source: "/", tags: ["frontend", "react"] },
      { id: "c", scope: "global", files: [], source: "/", tags: ["ui"] },
    ];
    const counts = collectTagCounts(skills);
    expect(counts[0]).toEqual({ tag: "frontend", count: 2 });
    expect(counts[1]).toEqual({ tag: "ui", count: 2 });
    expect(counts[2]).toEqual({ tag: "react", count: 1 });
  });

  it("M3: catalog cache round-trip + TTL expiry", () => {
    fx = makeFixture();
    const sample = {
      hubId: "test-hub",
      name: "Test",
      fetchedAt: new Date().toISOString(),
      entries: [{ id: "x", tags: ["t1"] }],
    };
    writeCachedCatalog(sample, { home: fx.home });
    expect(fs.existsSync(cacheFile("test-hub", { home: fx.home }))).toBe(true);

    // Fresh cache is returned
    const fresh = readCachedCatalog("test-hub", { home: fx.home });
    expect(fresh?.entries[0]?.id).toBe("x");

    // Expired cache (TTL = 0) returns null
    const expired = readCachedCatalog("test-hub", { home: fx.home, ttlMs: 0 });
    expect(expired).toBeNull();
  });

  it("M4: loadCatalogs writes cache on first call, reuses on second", async () => {
    fx = makeFixture();
    // First call — cache miss, should populate
    const first = await loadCatalogs({ home: fx.home });
    expect(first.length).toBeGreaterThan(0);
    expect(first.find((c) => c.hubId === "community")).toBeDefined();
    expect(fs.existsSync(cacheFile("community", { home: fx.home }))).toBe(true);
    // Mutate the cache file with a sentinel so we can prove the second call reads from it
    const file = cacheFile("community", { home: fx.home });
    const cached = JSON.parse(fs.readFileSync(file, "utf8"));
    cached.name = "MUTATED";
    fs.writeFileSync(file, JSON.stringify(cached));
    const second = await loadCatalogs({ home: fx.home });
    expect(second.find((c) => c.hubId === "community")?.name).toBe("MUTATED");
  });

  it("M5: read() applies cached hub tags to local skills", async () => {
    fx = makeFixture();
    // Pre-populate cache
    await loadCatalogs({ home: fx.home });
    // Seed a skill that exists in the community catalog
    writeFile(`${fx.home}/.claude/skills/skill-creator/SKILL.md`, `---\ndescription: ok\n---`);
    const cfg = read("claude-code", { home: fx.home, cwd: fx.project });
    const sk = cfg.skills.find((s) => s.id === "skill-creator")!;
    expect(sk.tags).toBeDefined();
    expect(sk.tags!).toContain("meta");
    expect(sk.hubMatch?.hubId).toBe("community");
  });
});
