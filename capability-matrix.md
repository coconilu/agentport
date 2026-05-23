# Capability Matrix — Claude Code · OpenCode · Codex CLI

> 草稿 v0.1（2026-05-23）。来源：扫描 vsync / harnessbridge / agent-switchboard / syncode 四个竞品中针对这三款工具的适配器实现。
>
> 用途：作为 migrate-agent IR（中间表示）设计的输入。**先看第 5 节"语义陷阱"** —— 那里是 IR 设计需要拍板的地方。

---

## 1. 三款工具的存储位置（一图速览）

| 维度 | Claude Code | OpenCode | Codex CLI |
|---|---|---|---|
| **全局目录** | `~/.claude/` | `~/.config/opencode/` | `~/.codex/` + `~/.agents/` |
| **项目目录** | `.claude/` | `.opencode/` | `.codex/` + `.agents/` |
| **主配置文件** | `.claude/settings.json` + `.mcp.json` / `.claude.json` | `opencode.json` 或 `opencode.jsonc` | `~/.codex/config.toml` |
| **主格式** | JSON | JSON / JSONC | TOML |
| **Windows 全局目录** | `%APPDATA%/claude/` | `%APPDATA%/opencode/` | 未确认 |

---

## 2. 配置类型支持矩阵

> ✅ 原生支持 · ⚠️ 部分/非标准 · ❌ 不支持

| 类型 | Claude Code | OpenCode | Codex CLI |
|---|---|---|---|
| **MCP servers** | ✅ `.mcp.json` / `.claude.json` / `settings.json` | ✅ `opencode.json[c]` 里的 `mcp` 字段 | ✅ `config.toml` 里的 `[mcp_servers.*]` 段 |
| **Sub-agents** | ✅ `.claude/agents/{id}.md`（带 frontmatter） | ✅ `.opencode/agents/{id}.md` | ⚠️ `.codex/agents/`（无标准 frontmatter） |
| **Skills** | ✅ `.claude/skills/{id}/SKILL.md` + 文件 | ✅ `.opencode/skills/{id}/`，也读 Claude 的目录作为 fallback | ⚠️ `~/.agents/skills/{id}/`（用 open agent skills 标准路径，与工具解耦） |
| **Hooks** | ✅ 嵌在 `.claude/settings.json` | ❌ 无原生 hook 机制 | ⚠️ `.codex/hooks.json` 或 `.codex/hooks/`（非标准） |
| **Plugins** | ❌ | ✅ `.opencode/plugins/` 目录 | ❌ |
| **Slash commands** | ✅ `.claude/commands/{id}.md` | ✅ `.opencode/commands/{id}.md` | ⚠️ `~/.codex/prompts/`（已 deprecated） |
| **Rules / 系统提示** | ✅ `CLAUDE.md` 或 `.claude/CLAUDE.md` | ✅ `AGENTS.md` 或 `~/.config/opencode/AGENTS.md` | ✅ `AGENTS.md` 或 `.codex/AGENTS.md` |
| **Settings / 模型 / API key** | ✅ `.claude/settings.json` | ✅ `opencode.json` | ✅ `config.toml` |

---

## 3. 格式总览

| 工具 | 主配置 | Agents/Skills/Commands | Rules |
|---|---|---|---|
| Claude Code | JSON | Markdown + YAML frontmatter | 纯 Markdown |
| OpenCode | JSON / JSONC | Markdown + YAML frontmatter | 纯 Markdown |
| Codex CLI | TOML | Markdown（agents 无标准 frontmatter） | 纯 Markdown |

**含义：** Codex 用 TOML，其它两个用 JSON。JSON ↔ TOML 是结构等价的（都是 dict + list），但需要适配器层做格式转换。Markdown 类资源（agents/skills/commands）三家形态接近，frontmatter schema 不一致是主要差异。

---

## 4. MCP 配置字段细节对比

MCP 是最值得做、也是最容易出错的同步对象（field 名、env 表达式各家都不同）。

| 字段 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **顶层字段名** | `mcpServers` (camelCase) | `mcp` | `[mcp_servers.<name>]` (snake_case TOML 段) |
| **`type` 字段** | 不需要 | **必填**：`"local"`（stdio）或 `"remote"`（http/oauth） | 不需要（用 `url` 或 `command` 区分） |
| **命令 + 参数** | `command` + `args[]` 分开 | `command: ["npx", "-y", "pkg"]` 合并成数组 | `command` + `args[]` 分开 |
| **环境变量字典** | `env: { KEY: "value" }` | `environment: { KEY: "value" }` | `[mcp_servers.x.env] KEY = "value"` |
| **环境变量插值** | `${VAR}` 或 `${env:VAR}` | `{env:VAR}` | `env_vars = ["VAR"]` 数组语义化声明 |
| **HTTP headers** | `headers: {}` | `headers: {}` | `http_headers` + `env_http_headers` + `bearer_token_env_var` |
| **禁用** | 从 config 删除 | `enabled: false` | 从 config 删除 |

---

## 5. ⚠️ 语义陷阱（IR 必须正面回答的设计问题）

### 5.1 MCP 的 `type` 字段：OpenCode 强制要求，其他两家没有
- **问题**：从 Claude/Codex 同步到 OpenCode 时，必须推断 `type`（看是不是 stdio）。反向同步时要丢弃。
- **IR 决策**：IR 里**显式存 `transport: "stdio" | "http" | "sse"`**，所有适配器读写都强制带上。

### 5.2 环境变量表达式三家完全不兼容
- Claude: `${GITHUB_TOKEN}` / OpenCode: `{env:GITHUB_TOKEN}` / Codex: `env_vars = ["GITHUB_TOKEN"]`
- **问题**：字符串字面量 round-trip 不可能。把 OpenCode 的 `{env:X}` 写进 Claude，Claude 不会展开它。
- **IR 决策**：用 AST/结构化表示而非字符串。比如 `{ raw: "...", env_refs: ["GITHUB_TOKEN"] }`，每个适配器自己渲染成本工具的语法。

### 5.3 OpenCode 命令是数组、其他是分离字段
- Claude/Codex: `command: "npx", args: ["-y", "pkg"]`
- OpenCode: `command: ["npx", "-y", "pkg"]`
- **IR 决策**：IR 里用分离形式（`command` + `args[]`），OpenCode 适配器在写入时合并。

### 5.4 Rules 文件名分裂：`CLAUDE.md` vs `AGENTS.md`
- Claude 项目级用 `CLAUDE.md`，OpenCode/Codex 都用 `AGENTS.md`。
- **问题**：同一份 rules 同步到三家要分别写两个文件名。
- **IR 决策**：IR 里只存 `rules` 列表，每个适配器决定文件名。

### 5.5 Skills 路径三家不一致
- Claude: `~/.claude/skills/` · OpenCode: `~/.config/opencode/skills/`（也读 Claude 的） · Codex: `~/.agents/skills/`（"open agent skills"标准）
- **问题**：Codex 用的是工具无关的标准路径，理论上可以作为"公共池"。
- **IR 决策（建议）**：把 `~/.agents/skills/` 作为 migrate-agent 的事实存储池，三家适配器都从这里读/写（OpenCode 已经天然支持读 Claude；类似机制可推广）。

### 5.6 Hooks 是 Claude 独占能力
- OpenCode 完全没有 hook 机制；Codex 的 hook 是非标准的。
- **问题**：从 Claude 同步到 OpenCode 时，hook 会被静默丢失。
- **IR 决策**：IR 里保留 `hooks` 字段。**写入 OpenCode 时给用户显式 warning**，不要静默丢。

### 5.7 Plugins 是 OpenCode 独占
- 反向问题：Claude 没有 plugin 概念（它的"插件"通过 skill/sub-agent/MCP 实现）。
- **IR 决策**：IR 里 `plugins` 作为 OpenCode 专属字段，往 Claude 同步时尝试映射到 skill 或丢弃 + warning。

### 5.8 Codex 的 sub-agent 无标准 frontmatter
- Claude/OpenCode 的 agent 都有结构化 frontmatter（name, description, tools 等）；Codex 是原始 markdown。
- **IR 决策**：IR 用 Claude/OpenCode 的 frontmatter schema；同步到 Codex 时把 frontmatter 转成 Markdown 标题/段落写入正文。

### 5.9 Codex commands 已 deprecated
- 不建议同步到 Codex 的 `~/.codex/prompts/`，会被 Codex 视为旧路径。
- **IR 决策**：Codex 适配器**只导出 commands，不导入**；并在 UI 上标注"已 deprecated"。

---

## 6. IR Schema 提议（v0 草稿）

参考 harnessbridge 的 `canonical.ts`，结合上述陷阱：

```typescript
type CanonicalConfig = {
  version: "1.0";

  mcpServers: Record<string, {
    transport: "stdio" | "http" | "sse";  // 显式，解决 5.1
    command?: string;
    args?: string[];                       // 分离形式，解决 5.3
    env?: Record<string, EnvValue>;        // EnvValue 是结构化，解决 5.2
    headers?: Record<string, EnvValue>;
    enabled?: boolean;
    _extensions?: Record<string, unknown>; // 工具特定字段逃生口
  }>;

  agents: Array<{
    id: string;
    name: string;
    description?: string;
    tools?: string[];
    body: string;  // markdown 正文
  }>;

  skills: Array<{
    id: string;
    files: Record<string, string>;  // 相对路径 → 内容
  }>;

  commands: Array<{
    id: string;
    body: string;
  }>;

  hooks: Array<{
    event: string;
    matcher?: string;
    command: string;
    // 同步到 OpenCode 时 warning
  }>;

  plugins: Array<{
    id: string;
    config: unknown;
    // 仅 OpenCode 支持
  }>;

  rules: Array<{
    scope: "global" | "project";
    body: string;
  }>;

  settings: {
    model?: string;
    permissions?: unknown;
    _extensions?: Record<string, unknown>;
  };
};

type EnvValue =
  | { kind: "literal"; value: string }
  | { kind: "env_ref"; name: string }
  | { kind: "template"; parts: Array<EnvValue> };  // 解决 5.2
```

---

## 7. 适配器实现优先级建议

| 优先级 | 配置类型 | 难度 | 理由 |
|---|---|---|---|
| **P0** | MCP servers | 中 | 三家都有原生支持，语义可对齐，价值最高 |
| **P0** | Rules | 低 | 纯 Markdown，只是文件名不同 |
| **P1** | Agents | 中 | Claude/OpenCode frontmatter 接近，Codex 需要降级处理 |
| **P1** | Skills | 中 | 三家路径不一，但内容格式一致 |
| **P2** | Commands | 低 | Codex 已 deprecated，主要做 Claude ↔ OpenCode |
| **P2** | Settings | 低-中 | 主要做局部字段（model、permissions）的双向映射 |
| **P3** | Hooks | 高 | 只有 Claude 有，做不做都行；要做的话 IR 保留 + warning |
| **P3** | Plugins | 高 | 只有 OpenCode 有；优先级最低 |

---

## 8. 待确认 / 下一步

- [ ] **Windows 路径**确认（特别是 Codex 在 Windows 上的位置）
- [ ] **OpenCode 的 `enabled: false`** 是否对所有字段都通用，还是只 MCP
- [ ] **Codex 的 `.agents/skills/`**：项目级别是从 cwd 向上扫描还是必须在项目根
- [ ] **Claude `.mcp.json` vs `.claude.json`**：两个文件优先级 / 是否互斥
- [ ] **Settings schema 的细颗粒映射**（model alias、permission 规则、IDE-specific 字段）这部分还没做，建议先做 MCP 跑通再回头处理

---

## 附录：信源文件路径

- vsync 适配器：`vsync/cli/src/adapters/{claude-code,opencode,codex}.ts`
- syncode 适配器：`syncode/src/adapters/{claude,opencode,codex}.ts`
- harnessbridge IR：`harnessbridge/packages/schema/src/canonical.ts`
- agent-switchboard：`agent-switchboard/src/config/paths.ts`、`agent-switchboard/src/targets/builtin/{opencode,codex}.ts`
