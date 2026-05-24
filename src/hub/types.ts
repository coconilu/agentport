export interface HubCatalogEntry {
  id: string;
  description?: string;
  tags: string[];
  source?: string;
  aliases?: string[];
}

export interface HubCatalog {
  hubId: string;
  name: string;
  fetchedAt: string;
  entries: HubCatalogEntry[];
}

export interface SkillHub {
  id: string;
  name: string;
  fetchCatalog(): Promise<HubCatalog>;
}
