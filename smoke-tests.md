# Smoke Tests — migrate-agent

> 草稿 v0.1。范围：P0 能力（MCP + Rules）+ 关键语义陷阱。
>
> 目的：项目 MVP 完成时，跑完这份清单就能确认核心管道**没有从根上断**。不追求覆盖率，追求"断了立刻发现"。

---

## 0. 测试夹具约定

所有用例都基于以下临时目录结构，避免污染用户真实配置：

```
/tmp/migrate-agent-test/
├── home/                       # 假装是 $HOME
│   ├── .claude/
│   ├── .config/opencode/
│   ├── .codex/
│   └── .agents/skills/
└── project/                    # 假装是 cwd
    ├── .claude/
    ├── .opencode/
    └── .codex/
```

跑测试前把 `HOME` 环境变量指到 `/tmp/migrate-agent-test/home`。

---

## A. 工具检测（Tool Discovery）

### A1. 检测出三个工具都安装了
**给定**：`home/` 下三个工具目录都存在
**当**：跑 `migrate-agent scan`
**应当**：输出包含 `claude-code`、`opencode`、`codex` 三项，且状态为 `detected`

### A2. 检测出只装了 Claude Code
**给定**：只有 `home/.claude/` 存在
**当**：跑 `migrate-agent scan`
**应当**：只列出 `claude-code`，其余标记为 `not-found`

### A3. 区分全局 vs 项目级
**给定**：`home/.claude/` 和 `project/.claude/` 都存在
**当**：跑 `migrate-agent scan --cwd project/`
**应当**：claude-code 同时上报 `scope: global` 和 `scope: project`

---

## B. MCP 读取（Tool → IR）

### B1. Claude Code: 从 `.mcp.json` 读 stdio server
**给定** `project/.mcp.json`：
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": { "DEBUG": "1" }
    }
  }
}
```
**应当**：IR 里出现一个 MCP entry，且：
- `transport === "stdio"`
- `command === "npx"`
- `args === ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]`
- `env.DEBUG === { kind: "literal", value: "1" }`

### B2. OpenCode: 读 `opencode.json` 里的 `mcp` 字段（不是 `mcpServers`）
**给定** `project/opencode.json`：
```json
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": { "GITHUB_TOKEN": "{env:GH_TOKEN}" }
    }
  }
}
```
**应当**：
- `transport === "stdio"`（从 `type: "local"` 推断）
- `command === "npx"`，`args === ["-y", "@modelcontextprotocol/server-github"]`（合并的数组被拆开）
- `env.GITHUB_TOKEN === { kind: "env_ref", name: "GH_TOKEN" }`（**关键**：`{env:X}` 被解析成结构化引用，不是字符串）

### B3. Codex: 读 `config.toml` 里的 `[mcp_servers.*]`
**给定** `home/.codex/config.toml`：
```toml
[mcp_servers.search]
command = "uvx"
args = ["mcp-server-search"]
env_vars = ["BRAVE_API_KEY"]
```
**应当**：
- `transport === "stdio"`
- `env.BRAVE_API_KEY === { kind: "env_ref", name: "BRAVE_API_KEY" }`（**关键**：`env_vars` 数组被翻译成 env 引用）

### B4. OpenCode 的 remote HTTP server
**给定**：`type: "remote"`、有 `url`、有 `headers`
**应当**：`transport === "http"`，`url` 被保留，`headers` 解析正确

---

## C. MCP 写入（IR → Tool）

### C1. 写入 Claude Code（字段名 `mcpServers`，无 `type`）
**给定**：一个 stdio MCP IR entry
**当**：写到 `project/.mcp.json`
**应当**：
- 顶层字段是 `mcpServers`（**不是** `mcp`、**不是** `mcp_servers`）
- 没有 `type` 字段（Claude 不需要）
- `args` 是数组而不是合并进 `command`

### C2. 写入 OpenCode（字段名 `mcp`，强制有 `type`）
**应当**：
- 顶层字段是 `mcp`
- 每个 server 都有 `type: "local"` 或 `"remote"`（**关键**：不能漏，OpenCode 会报错）
- `command` 是合并数组：`["npx", "-y", "pkg"]`
- env var 引用渲染成 `{env:X}` 而不是 `${X}`

### C3. 写入 Codex（TOML 段，env_vars 数组化）
**应当**：
- 输出是合法 TOML，段名 `[mcp_servers.<name>]`
- env_ref 类型的 env 变量被收集进 `env_vars = [...]` 数组（**不是**塞进 `[mcp_servers.x.env]` 表里）
- literal 类型的 env 变量进 `[mcp_servers.x.env]` 表

### C4. OpenCode 的 `enabled: false` 被保留
**应当**：禁用状态的 server 仍然出现在输出里，带 `enabled: false`，而不是被删掉

---

## D. Round-trip 完整性（Read → Write → Read）

### D1. Claude → IR → Claude 应当语义等价
**当**：读 `.mcp.json` → IR → 重新写出
**应当**：再次读取得到的 IR 与第一次相同（JSON 字段顺序可以不同，但值相同）

### D2. OpenCode `{env:X}` 不被降级成字面量
**给定**：OpenCode 配置里有 `"token": "{env:GITHUB_TOKEN}"`
**当**：读入 IR，再写回 OpenCode
**应当**：写出的 JSON 仍然是 `"{env:GITHUB_TOKEN}"`，**不是** `"${GITHUB_TOKEN}"` 也**不是** `"{env:GITHUB_TOKEN}"` 被当成字面量字符串保留（要验证它经过了 env_ref 结构）

### D3. Codex `env_vars` 数组 round-trip
**给定**：Codex `env_vars = ["KEY_A", "KEY_B"]`
**当**：IR → Codex 再读回
**应当**：仍然出现在 `env_vars` 数组里，**不是**被错误地写进 `[env]` 表

---

## E. 跨工具迁移（核心场景）

### E1. Claude → OpenCode：env var 语法翻译
**给定**：Claude 配置里 `"token": "${GITHUB_TOKEN}"`
**当**：同步到 OpenCode
**应当**：输出里是 `"{env:GITHUB_TOKEN}"`（语法已翻译）

### E2. Claude → OpenCode：自动补 `type` 字段
**给定**：Claude 配置里的 stdio server（无 `type`）
**当**：同步到 OpenCode
**应当**：输出里有 `type: "local"`

### E3. Claude → Codex：JSON → TOML 格式转换
**应当**：输出是合法 TOML，能被 Codex 实际加载（用 `toml` 解析器验证）

### E4. OpenCode → Codex：env 表达式三跳翻译
**给定**：OpenCode `"key": "{env:X}"`
**当**：同步到 Codex
**应当**：`X` 出现在 `env_vars` 数组里（不是写成 `"key" = "{env:X}"` 这种字面量）

---

## F. Rules 同步

### F1. CLAUDE.md → AGENTS.md 文件名映射
**给定**：`project/CLAUDE.md` 含 "Use TypeScript strict mode"
**当**：同步到 OpenCode 和 Codex
**应当**：分别生成 `project/AGENTS.md`（OpenCode 和 Codex 都用这个文件名），内容一致

### F2. 全局 vs 项目级隔离
**给定**：`home/.claude/CLAUDE.md` (global) 和 `project/CLAUDE.md` (project) 内容不同
**应当**：同步时分别处理，全局规则写到 `~/.config/opencode/AGENTS.md`，项目规则写到 `project/AGENTS.md`

---

## G. 能力不对等的 Warning（不能静默丢失）

### G1. Claude → OpenCode：hook 被丢失时必须 warn
**给定**：Claude `settings.json` 里有一个 `PreToolUse` hook
**当**：同步到 OpenCode
**应当**：
- exit code 仍然是 0（不是 fatal）
- stderr 或 report 里**明确出现** "hook X dropped: opencode does not support hooks"
- 写出的 `opencode.json` 不包含 hook

### G2. OpenCode → Claude：plugin 被丢失时必须 warn
**对称用例**：OpenCode 的 plugin 同步到 Claude，必须有 warning

### G3. IR 里能否保留 hook（即使目标不支持）
**给定**：从 Claude 读入了 hook
**当**：写到 OpenCode 后，再回写到 Claude
**应当**：hook 仍然存在（IR 层不要因为某次同步到 OpenCode 就丢了 hook）

---

## H. CLI / Web UI 基础冒烟

### H1. CLI: `migrate-agent --help` 不崩
**应当**：exit code 0，输出包含 `scan`、`sync`、`diff` 等命令名

### H2. CLI: `migrate-agent diff --from claude --to opencode` 输出可读 diff
**给定**：两边都有 MCP 配置但内容不同
**应当**：输出 unified diff 或类似格式，能看出哪些 server 增删改

### H3. Web UI: 首页能打开
**当**：启动 dev server 后访问 `localhost:<port>/`
**应当**：HTTP 200，页面包含三个工具的状态卡片

### H4. Web UI: MCP 列表正确渲染
**给定**：Claude 装了 2 个 MCP server
**应当**：UI 显示 2 条记录，每条带 transport、command、env vars 数量

---

## I. 错误处理（不要在用户配置面前崩）

### I1. 配置文件不存在时不崩
**给定**：`home/.codex/` 不存在
**当**：跑 `migrate-agent scan`
**应当**：codex 标记为 `not-found`，**不抛异常**

### I2. 配置文件格式损坏时给清晰错误
**给定**：`opencode.json` 是损坏的 JSON
**当**：读入
**应当**：错误信息包含文件路径 + 行号，**不是**裸的 `SyntaxError`

### I3. 写入前的 backup
**应当**：写入任何工具配置前，原文件先备份到 `<file>.bak.<timestamp>`

---

## 优先实现顺序

跑通 → 验证 → 下一组：

1. **第一波**（最小闭环）：A1, B1, C1, D1 — 验证 Claude 单边能读能写
2. **第二波**（核心跨工具）：B2, C2, E1, E2 — 验证 Claude ↔ OpenCode 能跑
3. **第三波**（env var 陷阱）：D2, D3, E4 — 验证最容易出 bug 的语义翻译
4. **第四波**（rules + warning）：F1, G1 — 闭合 P0 功能
5. **第五波**（Codex + UI）：B3, C3, E3, H3, H4
6. **第六波**（健壮性）：I1, I2, I3
