import type { SkillHub, HubCatalog, HubCatalogEntry } from "./types.js";

// Bundled community catalog. Curated taxonomy for skills commonly seen in
// Claude Code / OpenCode / Codex ecosystems. Treat this as a v0 starter set;
// remote/community-maintained hubs can be added as additional SkillHub
// implementations (see issue #1 for the design).
const ENTRIES: HubCatalogEntry[] = [
  // Meta / skill authoring
  { id: "skill-creator", tags: ["meta", "authoring", "skills"], description: "Create new skills" },
  { id: "skill-downloader", tags: ["meta", "skills"], description: "Install skills from GitHub/URL/archive" },
  { id: "resource-scout", tags: ["meta", "discovery", "skills", "mcp"], description: "Discover skills/MCP servers" },

  // Frontend
  { id: "frontend-design", tags: ["frontend", "ui", "design"], description: "Production-grade frontend interfaces" },
  { id: "vercel-react-best-practices", tags: ["frontend", "react", "next.js", "performance"], description: "React/Next.js perf patterns" },

  // Code review / quality
  { id: "review-gen", tags: ["review", "code-quality", "refactor"], description: "Review recent generated code" },
  { id: "scan-index", tags: ["code-analysis", "review"], description: "Index project for reusability" },
  { id: "scan-reviewer", tags: ["review", "code-quality", "reusability"], description: "Detect duplication vs existing code" },
  { id: "post-generate-reviewer", tags: ["review", "code-quality"] },
  { id: "component-scanner", tags: ["code-analysis", "frontend", "scanning"] },

  // Anthropic-specific
  { id: "claude-api", tags: ["api", "anthropic", "sdk"], description: "Build / debug Claude API + Anthropic SDK apps" },
  { id: "claude-md-improver", tags: ["meta", "documentation", "claude-code"] },
  { id: "claude-md-management", tags: ["meta", "documentation", "claude-code"] },
  { id: "claude-automation-recommender", tags: ["meta", "claude-code"] },

  // Learning / docs
  { id: "oss-rebuild-coach", tags: ["learning", "oss", "tutorial"], description: "Decompose OSS projects step by step" },
  { id: "tech-tutorial-writer", tags: ["writing", "documentation", "tutorial"] },

  // Config / setup
  { id: "init", tags: ["setup", "claude-code"] },
  { id: "claude-code-setup", tags: ["setup", "claude-code", "onboarding"] },
  { id: "update-config", tags: ["config", "claude-code", "hooks"] },
  { id: "keybindings-help", tags: ["config", "claude-code", "keybindings"] },
  { id: "fewer-permission-prompts", tags: ["config", "claude-code", "permissions"] },
  { id: "statusline-setup", tags: ["config", "claude-code", "ui"] },

  // Reviewing / security
  { id: "review", tags: ["review", "pr"] },
  { id: "security-review", tags: ["review", "security"] },
  { id: "simplify", tags: ["refactor", "code-quality"] },

  // Automation / orchestration
  { id: "loop", tags: ["automation", "scheduling"] },
  { id: "schedule", tags: ["automation", "scheduling", "cron"] },

  // Browser / agent tooling
  { id: "agent-browser", tags: ["browser", "automation", "tooling"], description: "Browser automation tool for agents" },

  // Code modernization
  { id: "architecture-critic", tags: ["architecture", "modernization", "review"] },
];

// Bundled data is in-process — also expose a sync accessor so the sync read
// pipeline can apply tags without first running `agentport hub sync`.
export function getCommunityCatalog(): HubCatalog {
  return {
    hubId: "community",
    name: "Community (bundled)",
    fetchedAt: new Date().toISOString(),
    entries: ENTRIES,
  };
}

export const communityHub: SkillHub = {
  id: "community",
  name: "Community (bundled)",
  async fetchCatalog(): Promise<HubCatalog> {
    return getCommunityCatalog();
  },
};
