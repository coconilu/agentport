export interface PersonaRecommendation {
  id: string;
  rationale: string;
  source?: string;
  install?: { command: string; args?: string[] };
}

export interface PersonaMcpRecommendation extends PersonaRecommendation {
  transport?: "stdio" | "http" | "sse";
  url?: string;
  env?: string[];
}

export interface PersonaManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  recommendations: {
    skills?: PersonaRecommendation[];
    agents?: PersonaRecommendation[];
    commands?: PersonaRecommendation[];
    mcp?: PersonaMcpRecommendation[];
  };
}

export type ItemKind = "skills" | "agents" | "commands" | "mcp";

export interface MatchedItem {
  kind: ItemKind;
  id: string;
  rationale: string;
  source?: string;
  status: "installed" | "missing";
  installedIn?: string[]; // tool ids where it's already present
}

export interface PersonaMatch {
  persona: PersonaManifest;
  items: MatchedItem[];
  totals: { total: number; installed: number; missing: number };
}
