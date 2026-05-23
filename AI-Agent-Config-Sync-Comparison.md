# AI Agent Configuration Sync Tools — 完整对比分析

> 对比项目：**vsync** · **HarnessBridge** · **Agent Switchboard** · **syncode**

---

## 目录

1. [项目概览](#1-项目概览)
2. [支持的工具矩阵](#2-支持的工具矩阵)
3. [同步功能矩阵](#3-同步功能矩阵)
4. [架构与数据模型对比](#4-架构与数据模型对比)
5. [CLI 命令与使用方式对比](#5-cli-命令与使用方式对比)
6. [MCP 配置转换能力对比](#6-mcp-配置转换能力对比)
7. [关键差异化特性](#7-关键差异化特性)
8. [代码质量与成熟度](#8-代码质量与成熟度)
9. [局限性与未来规划](#9-局限性与未来规划)
10. [适用场景推荐](#10-适用场景推荐)
11. [总结评分](#11-总结评分)

---

## 1. 项目概览

| 维度 | vsync | HarnessBridge | Agent Switchboard | syncode |
|---|---|---|---|---|
| **GitHub** | [nicepkg/vsync](https://github.com/nicepkg/vsync) | [yitianlian/harnessbridge](https://github.com/yitianlian/harnessbridge) | [qyhfrank/agent-switchboard](https://github.com/qyhfrank/agent-switchboard) | [donnes/syncode](https://github.com/donnes/syncode) |
| **核心理念** | 源 → 多目标，diff 预览 | 双向格式转换器（canonical.json） | 中央库 + 插件系统，三层 TOML 配置 | Git 仓库作为中央存储 + 智能 symlink/copy |
| **语言/运行时** | TypeScript / Node >=24 | TypeScript / Node | TypeScript / Node >=16 | TypeScript / Node >=20 或 Bun |
| **包管理器** | pnpm (monorepo) | pnpm (monorepo) | pnpm | Bun |
| **当前版本** | v1.2.x (稳定发布) | v0.1.0 (早期) | v0.4.19 (活跃开发中) | v1.1.9 (稳定发布) |
| **安装方式** | `npm i -g @nicepkg/vsync` | `npx harnessbridge` (零安装) | `npm i -g agent-switchboard` | `npm i -g @donnes/syncode` |
| **许可证** | MIT | MIT | MIT | MIT |
| **测试覆盖** | **612 tests** (Vitest) | ~40 tests (Vitest) | **38 tests** (node:test) | ~2 test files (自定义 runner) |
| **i18n** | ✅ 英文/中文 | ❌ | ❌ | ❌ |

---

## 2. 支持的工具矩阵

> ✅ = 完整支持 · ⚠️ = 部分支持 · 🚧 = 规划中 · — = 不支持

| 工具 | vsync | HarnessBridge | Agent Switchboard | syncode |
|---|---|---|---|---|
| **Claude Code** | ✅ | ✅ | ✅ | ✅ |
| **Cursor** | ✅ | ✅ | ✅ | ✅ |
| **OpenCode** | ✅ | ✅ | ✅ | ✅ |
| **Codex CLI** | ✅ | ✅ | ✅ | ✅ |
| **Windsurf** | — | ✅ | — | ✅ |
| **GitHub Copilot** | — | ✅ | — | ✅ |
| **Gemini CLI** | — | — | ✅ | ✅ |
| **Trae** | — | — | ✅ | ✅ |
| **Trae-CN** | — | — | ✅ | — |
| **Claude Desktop** | — | — | ✅ | — |
| **Roo Code** | — | — | — | ✅ |
| **VSCode** | — | — | — | ✅ |
| **Goose** | — | — | — | ✅ |
| **Kilo Code** | — | — | — | ✅ |
| **Kiro CLI** | — | — | — | ✅ |
| **Amp** | — | — | — | ✅ |
| **Antigravity** | — | — | — | ✅ |
| **Clawdbot** | — | — | — | ✅ |
| **Devin** | — | — | — | ✅ |
| **Droid (Factory)** | — | — | — | ✅ |
| **Kimi CLI** | — | — | — | ✅ |
| **Dotfiles** | — | — | — | ✅ |
| **总数** | **4** | **6** | **8** | **21** |

---

## 3. 同步功能矩阵

> ✅ = 完整支持 · ⚠️ = 仅导入/部分 · 🚧 = 规划中 · — = 不支持

| 功能 | vsync | HarnessBridge | Agent Switchboard | syncode |
|---|---|---|---|---|
| **Rules / Instructions** | — (通过 Skills/Agents 间接) | ✅ (核心功能) | ✅ (核心功能) | ✅ (按文件模式) |
| **Skills** | ✅ (核心功能) | ✅ | ✅ | ✅ (共享 Skills 系统) |
| **Agents / Sub-agents** | ✅ | ⚠️ (Copilot agents → Claude skills) | ✅ | — (文件级同步) |
| **Commands** | ✅ | — | ✅ | ✅ (按文件模式) |
| **MCP Servers** | ✅ (核心功能) | ✅ | ✅ | ✅ (Windsurf 等) |
| **Hooks** | — | ⚠️ (导入 only) | ⚠️ (仅 Claude Code + Codex) | — |
| **Memory** | — | ⚠️ (导入 only) | — | — |
| **Permissions** | — | ⚠️ (导入 only) | — | — |
| **Settings / 全局配置** | — | — | — | ✅ (settings.json 等) |
| **插件管理** | — | — | ✅ (核心特色) | — |
| **跨机器同步** | — | — | — | ✅ (核心特色) |
| **机器依赖安装** | — | — | — | ✅ (install.sh) |

---

## 4. 架构与数据模型对比

### vsync — 源真模型 + 3-Way Diff

```
Source Tool → Read & Normalize → 内部模型 → 3-Way Diff
→ 生成计划 → 原子写入 → 更新 Manifest
```

- **数据流**: 单向 (Source → Targets)。切换方向需重新 `vsync init`
- **内部模型**: 内存中的统一数据模型，通过 adapter 读入/写出
- **变更检测**: SHA-256 哈希 + Manifest 跟踪（存储于 `~/.vsync/cache/`）
- **安全机制**: 原子写入（temp file + fsync + rename）、回滚、备份
- **Diff 引擎**: 支持 Plan 预览（显示 hash、操作原因）
- **模式**: Safe 模式（默认，不删除）、Prune 模式（严格镜像）

### HarnessBridge — 双向转换器 + Canonical JSON

```
任一工具 ←→ Canonical JSON (.harnessbridge/canonical.json) ←→ 任一工具
```

- **数据流**: 任意双向 (任一工具 → 任一工具)
- **中间格式**: 人类可读的 `canonical.json`，可直接编辑
- **转换流程**: `import(from_tool) → canonical → export(to_tool)`
- **智能降级**: 当目标工具不支持某功能时，输出 WARNING 而非静默丢弃
- **溯源追踪**: 记录每个条目的来源工具和原始路径
- **合并策略**: 支持 `--merge` 将多次导入合并到同一 canonical

### Agent Switchboard — 中央库 + 三层 TOML + 插件

```
Library Entries → Config Layers (merge) → Per-App Overrides → Distribution to Targets
   (Markdown/JSON)   (TOML: User > Profile > Project)
```

- **数据流**: 单向 (中央库 → 各工具)，但支持 `load` 从平台导入
- **配置层**: User (`~/.agent-switchboard/config.toml`) → Profile (`<name>.toml`) → Project (`.asb.toml`)
- **深度合并**: 数值替换，对象合并，数组替换
- **每应用覆盖**: `codex.rules.remove = ["rule-a"]` 精细控制
- **插件系统**: 自动发现、启用/禁用，支持本地路径 + Git URL + Claude Code marketplace
- **变更检测**: Hash-based，仅目标内容变化时才重写
- **管理模式**: Manifest-driven，追踪 ASB 拥有哪些文件，清理时不误删

### syncode — Git 仓库 + 智能 Symlink/Copy

```
System Config Files ←→ Git Repo (~/.syncode/repo/) ←→ Other Machines
   (import/export)         (commit/push/pull)         (clone + export)
```

- **数据流**: 多机双向 (import = 系统→仓库, export = 仓库→系统)，但单次单向
- **存储后端**: 纯 Git 仓库，无专有格式
- **Sync 策略**:
  - **Symlink** (多数 CLI agent)：系统路径→仓库路径，实时同步
  - **Copy** (Claude Code)：选择性复制特定文件（排除 SQLite cache）
  - **Selective Symlink** (Cursor/VSCode)：仅 symlink 用户配置文件
- **共享 Skills**: `.agents/skills/` 通过 symlink 在所有 agent 间共享
- **机器级设置**: `install.sh` 模板提供完整的开发环境引导安装

---

## 5. CLI 命令与使用方式对比

### vsync

```
# 基本工作流
vsync init                          # 交互式初始化（检测工具、选源）
vsync sync                          # 执行同步（Safe 模式）
vsync sync --prune                  # 严格镜像模式
vsync plan                          # 预览变更（含 hash 详情）
vsync plan --prune                  # 预览 Prune 将删除什么
vsync status                        # 查看同步状态
vsync list [skills|mcp]             # 列表查看
vsync clean <name> [--from-source]  # 清理
vsync import <path>                 # 从其他项目导入配置
```

**使用体验**: 交互式向导 → `sync` → 完成。Plan 命令提供极详细的 diff 预览。

### HarnessBridge

```
# 直接转换
npx harnessbridge convert --from cursor --to claude
npx harnessbridge convert --from claude --to cursor --dry-run

# Canonical 工作流
npx harnessbridge init                   # 自动检测 → 创建 canonical.json
npx harnessbridge import --from claude --merge  # 追加导入
npx harnessbridge export --to opencode --dry-run # 预览导出

# 查看能力
npx harnessbridge list --features        # 工具能力矩阵
```

**使用体验**: 零安装 (`npx`)，命令行一行完成转换。适合一次性迁移场景。

### Agent Switchboard

```
# 交互式选择器
asb mcp                    # 交互式 MCP 选择（checkbox）
asb rule                   # 交互式规则选择（可排序）
asb skill                  # 交互式 Skill 选择

# 批量同步
asb sync                   # 推送所有库 + MCP 到所有活跃应用
asb sync --dry-run         # 预览不写入

# 从平台导入
asb rule load claude-code ~/project/CLAUDE.md

# 插件管理
asb plugin list
asb plugin enable context7@community
asb plugin marketplace add https://github.com/org/repo
```

**使用体验**: 最丰富的交互式 UX（checkbox、fuzzy search、可排序列表），面向日常管理。

### syncode

```
# 初始化
syncode new                   # 创建新仓库、检测 agent、导入现配
syncode init                  # 从已有远程仓库克隆

# 同步
syncode sync                  # 交互式选择方向 + agent
syncode unsync                # 反向操作（移除 symlink、恢复本地文件）
syncode status                # 查看同步状态 + git 状态

# Git 操作
syncode push                  # 提交并推送
syncode pull                  # 拉取更新

# 机器设置
syncode machine deps          # 安装开发依赖（执行 install.sh）
syncode machine status        # 查看机器平台和状态
```

**使用体验**: 以 Git 工作流为蓝本，对于熟悉 Git 的开发者非常自然。`machine deps` 提供超越了 agent 配置的机器级环境搭建。

---

## 6. MCP 配置转换能力对比

MCP 配置格式转换是这个领域最复杂的技术问题。每个工具使用完全不同的格式：

| 格式特性 | Claude Code | Cursor | OpenCode | Codex CLI |
|---|---|---|---|---|
| **文件** | `.mcp.json` | `.cursor/mcp.json` | `opencode.json(c)` | `.codex/config.toml` |
| **格式** | JSON | JSON | JSONC (with comments) | TOML |
| **MCP 字段名** | `mcpServers` | `mcpServers` | `mcp` | `mcp_servers` |
| **Type 字段** | 不需要 | 不需要 | **必须** (`local`/`remote`) | 不需要 |
| **Command 格式** | `{command, args: [...]}` | `{command, args: [...]}` | `{command: ["npx", "-y", ...]}` | `command="npx"` + `args=[...]` |
| **环境变量语法** | `${VAR}` | `${env:VAR}` | `{env:VAR}` | `env_vars` 数组 |

### 各工具的处理方式

| 项目 | MCP 转换策略 |
|---|---|
| **vsync** | `EnvVarTransformer` 统一变量转换，`jsonc-parser` 保存注释，`@iarna/toml` 处理 TOML。综合实力最强。 |
| **HarnessBridge** | 自定义 TOML 解析（line-by-line regex），功能较基础但覆盖所有目标工具。 |
| **Agent Switchboard** | 每个 target 实现独立的 MCP handler，格式转换分散在各适配器中。支持 Gemini/Trae 的独特格式。 |
| **syncode** | 不做格式转换——仅同步原始文件。依赖 symlink/copy 保持文件一致。不解决跨格式兼容问题。 |

---

## 7. 关键差异化特性

| 特性 | vsync | HarnessBridge | Agent Switchboard | syncode |
|---|---|---|---|---|
| **Diff 预览 (Plan)** | ✅ 非常详细 (hash/原因) | ❌ | ✅ (--dry-run) | ❌ |
| **原子写入 + 回滚** | ✅ | ❌ | ❌ | ✅ (备份) |
| **Safe/Prune 模式** | ✅ | ❌ | ✅ (exclusive/managed) | ❌ |
| **Symlink 支持** | ✅ (Skills) | ❌ | ❌ | ✅ (核心策略) |
| **Bidirectional** | ❌ | ✅ (全双向) | ⚠️ (load + sync) | ⚠️ (import + export) |
| **插件/扩展系统** | ✅ (Adapter Registry) | ❌ | ✅ (完整插件系统) | ❌ |
| **交互式 CLI** | ✅ (init + list) | ❌ | ✅ (全面交互) | ✅ (全部交互) |
| **跨机器同步** | ❌ | ❌ | ❌ | ✅ (Git 原生) |
| **机器环境搭建** | ❌ | ❌ | ❌ | ✅ (install.sh) |
| **i18n 多语言** | ✅ (中/英) | ❌ | ❌ | ❌ |
| **零安装 (npx)** | ❌ | ✅ | ✅ | ❌ |
| **Per-app 覆盖** | ❌ | ❌ | ✅ (精细控制) | ❌ |
| **Canonical 中间格式** | ❌ | ✅ (可编辑 JSON) | ❌ | ❌ |
| **智能降级/警告** | ❌ | ✅ (Feature gaps) | ❌ | ❌ |
| **Config layering** | ❌ | ❌ | ✅ (3 层 TOML) | ❌ |
| **管理模式 (Manifest)** | ✅ (Hash manifest) | ❌ | ✅ | ❌ |
| **清理/unsync** | ✅ (clean) | ❌ | ✅ (managed cleanup) | ✅ (unsync) |

---

## 8. 代码质量与成熟度

| 维度 | vsync | HarnessBridge | Agent Switchboard | syncode |
|---|---|---|---|---|
| **测试数量** | **612** | ~40 | 38 | ~2 |
| **测试框架** | Vitest + mock-fs | Vitest | node:test (零依赖) | 自定义 runner |
| **TypeScript 严格度** | strict, 无 any | strict | strict, 全面 | strict |
| **Linting/Formatting** | ESLint + Prettier | (无配置) | Biome v2 | Biome |
| **CI/CD** | GitHub Actions + semantic-release | — | GitHub Actions + 自动发布 | GitHub Actions |
| **Pre-commit hooks** | ✅ Husky + commitlint | ❌ | ✅ Biome | ❌ |
| **文档质量** | 极强的中英双语文档 | 优秀的 README | 3 份 adapter 文档 | 优秀的 README + 设计文档 |
| **代码组织** | 高度模块化、清晰分层 | 清晰的 monorepo 分层 | 高度模块化、大型 CLI 文件 | 适配器模式、函数拆分良好 |
| **贡献指南** | ✅ | ❌ | ❌ | ✅ |
| **活跃度** | 活跃 (2026-01) | 早期 (v0.1.0) | 活跃 (2026-04) | 活跃 (2026-01) |

---

## 9. 局限性与未来规划

### vsync
**当前局限**:
- 仅支持 4 个工具
- 单向同步（Source → Targets）
- Skills symlinks 是全部或全无
- 无 watch 模式、无 CI 集成

**路线图 (v1.3 → v2.0)**:
- Watch mode、GitHub Actions 集成
- Web UI dashboard
- VS Code 扩展
- 配置模板、正式插件系统

### HarnessBridge
**当前局限**:
- Claude skills/hooks/memory 仅导入不支持导出
- 自定义 TOML 解析器可能有边界情况
- 无 `hb sync`/`hb diff` 命令
- 无 GitHub Action、无插件系统

**路线图**:
- `hb sync`（自动检测源 → 导出到所有目标）
- `hb diff`（对比两个工具的配置差异）
- Cline、Continue.dev、Aider 转换器
- 社区插件系统

### Agent Switchboard
**当前局限**:
- OpenCode + Claude Code 双写重复问题（已知未解决）
- Hooks 支持有限（仅 Claude Code + Codex）
- Trae 不支持 agents/commands/skills（GUI 专属）
- Cursor rules 简化合并到单个 `.mdc`

**活跃开发中** (v0.4.x):
- Trae hooks 支持
- Gemini agents/skills importers
- Shared subagent handlers
- 更多 Claude-compatible subagent tools

### syncode
**当前局限**:
- 测试极少（仅 2 个文件）
- Windows 支持未完成
- Canonical skill 格式功能仅 stub
- 不解决跨格式 MCP 转换
- 无 watch 模式、无 CI 集成
- 单次单向 sync（import 或 export）

**路线图**:
- Windows 完整支持
- Vercel 风格的 skill 添加
- Universal skill 格式（写一次，自动转换到各 agent 语法）
- Auto-push on changes

---

## 10. 适用场景推荐

| 场景 | 推荐工具 | 原因 |
|---|---|---|
| **想在同设备多个 agent 间共享 Skills + MCP** | **vsync** | MCP 格式转换最成熟，diff 预览最强，Safe mode 安全 |
| **从工具 A 一次性迁移到工具 B** | **HarnessBridge** | 零安装 `npx`，一行命令搞定，全双向转换 |
| **日常管理多个 agent + 插件生态** | **Agent Switchboard** | 交互式 UI 最丰富，插件系统，per-app 精细控制 |
| **多台设备间同步 agent 配置 + 环境搭建** | **syncode** | Git 原生跨机器同步，`machine deps` 机器级环境搭建 |
| **团队共享统一的 agent 配置** | **Agent Switchboard** | 三层配置（User/Profile/Project），per-app 覆盖，分享灵活 |
| **安全敏感的跨设备同步** | **mcpocket** (不在本文分析范围内) | 端到端加密，GitHub gist/repo 后端 |
| **想最广的工具覆盖面** | **syncode** | 21 个 agent，包括 VSCode、dotfiles 等非纯 AI 工具 |
| **想最稳定的 MCP 格式转换** | **vsync** | JSONC 注释保留、TOML 正确解析、环境变量多格式转换 |
| **项目整体 AI 配置管理** | **Agent Switchboard** | 项目管理模式、manifest 跟踪、`asb init` 项目初始化 |

---

## 11. 总结评分

> 评分标准：1-5 分，5 分最高

| 维度 | vsync | HarnessBridge | Agent Switchboard | syncode |
|---|---|---|---|---|
| **功能完整度** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **代码质量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **测试覆盖** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| **用户体验** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **工具覆盖面** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **MCP 转换能力** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| **跨机器能力** | ⭐ | ⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| **扩展性** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **文档质量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **创新特性** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **综合评分** | **4.1** | **2.8** | **4.4** | **3.2** |

---

## 你的项目 (migrate-agent) 的差异化机会

基于以上分析，现有工具的核心覆盖已经很全面，但仍有一些明显缺口：

1. **跨设备一键迁移体验**：syncode 做了跨机器但体验较重（Git 工作流），mcpocket 做了但仅覆盖 Claude 系。做一个"扫描当前设备 → 一键导出配置文件 → 新设备一键导入"的傻瓜式体验，市场上没有。

2. **Hooks 深度迁移**：Hooks 是各工具差异最大的部分（Claude Code 的 event-based hooks vs 其他），现有工具几乎都只是"导入"或基础支持，没有做深度转换。

3. **配置发现（Discovery）**：所有现有工具都要求用户知道自己在用什么工具。一个自动扫描设备、自动发现所有 agent 及其配置的工具，目前没有。

4. **统一的 TUI/Web UI**：vsync 的 Web UI 还在 v2.0 规划中。做一个漂亮的 TUI 或 Web dashboard 来可视化和管理所有 agent 配置，差异化明显。

5. **中国市场特化**：支持 Trae、Trae-CN、通义灵码、文心快码等国产 agent 的配置迁移。
