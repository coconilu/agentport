import type { SkillEntry } from "../ir/types.js";
import type { HubCatalog } from "./types.js";

// Apply hub tags to local skills. Strategy:
//   1. Exact id match
//   2. Alias match (hub entry's aliases[] includes skill id)
// Returns a new array (does not mutate input).
export function applyHubTags(skills: SkillEntry[], catalogs: HubCatalog[]): SkillEntry[] {
  return skills.map((s) => augmentSkill(s, catalogs));
}

function augmentSkill(skill: SkillEntry, catalogs: HubCatalog[]): SkillEntry {
  const tagSet = new Set<string>(skill.tags ?? []);
  let firstMatch: { hubId: string; hubEntryId: string } | undefined;

  for (const cat of catalogs) {
    for (const entry of cat.entries) {
      if (entry.id === skill.id || (entry.aliases?.includes(skill.id) ?? false)) {
        for (const t of entry.tags) tagSet.add(t);
        if (!firstMatch) firstMatch = { hubId: cat.hubId, hubEntryId: entry.id };
      }
    }
  }

  if (tagSet.size === 0 && !firstMatch) return skill;
  return {
    ...skill,
    tags: [...tagSet].sort(),
    ...(firstMatch ? { hubMatch: firstMatch } : {}),
  };
}

// Collect all unique tags from a list of skills, sorted by frequency desc then alpha.
export function collectTagCounts(skills: SkillEntry[]): Array<{ tag: string; count: number }> {
  const map = new Map<string, number>();
  for (const s of skills) {
    for (const t of s.tags ?? []) map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
