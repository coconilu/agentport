import { communityHub } from "./communityHub.js";
import { readCachedCatalog, writeCachedCatalog, type CacheOptions } from "./cache.js";
import { applyHubTags } from "./match.js";
import type { SkillHub, HubCatalog } from "./types.js";
import type { SkillEntry } from "../ir/types.js";

export const BUILTIN_HUBS: SkillHub[] = [communityHub];

// Get all available hub catalogs, using cache where fresh.
// Refresh from source if cache missing/stale (or refresh === true).
export async function loadCatalogs(
  opts: CacheOptions & { refresh?: boolean } = {}
): Promise<HubCatalog[]> {
  const out: HubCatalog[] = [];
  for (const hub of BUILTIN_HUBS) {
    let cat = opts.refresh ? null : readCachedCatalog(hub.id, opts);
    if (!cat) {
      try {
        cat = await hub.fetchCatalog();
        writeCachedCatalog(cat, opts);
      } catch {
        // Fall back to stale cache if fetch failed
        cat = readCachedCatalog(hub.id, { ...opts, ttlMs: Number.MAX_SAFE_INTEGER });
        if (!cat) continue;
      }
    }
    out.push(cat);
  }
  return out;
}

// Convenience: load catalogs and tag a skill list in one call.
export async function tagSkills(
  skills: SkillEntry[],
  opts: CacheOptions & { refresh?: boolean } = {}
): Promise<SkillEntry[]> {
  const catalogs = await loadCatalogs(opts);
  return applyHubTags(skills, catalogs);
}

export { applyHubTags, collectTagCounts } from "./match.js";
export type { SkillHub, HubCatalog, HubCatalogEntry } from "./types.js";
