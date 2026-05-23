import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { start } from "../../src/web/server.js";

export interface E2EFixture {
  root: string;
  home: string;
  project: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function createE2EFixture(): Promise<E2EFixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-agent-e2e-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  // Pre-create global dirs so scan() detects all three tools.
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  // Seed some content so the UI has stuff to show.
  fs.writeFileSync(
    path.join(project, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], env: { DEBUG: "1" } },
      },
    })
  );
  fs.mkdirSync(path.join(home, ".claude", "agents", "code-reviewer"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "agents", "code-reviewer", "AGENT.md"),
    `---\nname: code-reviewer\ndescription: Reviews code carefully\ntools: Read, Grep\nmodel: sonnet\ncolor: blue\n---\nBody text here.`
  );
  fs.mkdirSync(path.join(home, ".claude", "skills", "my-skill"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".claude", "skills", "my-skill", "SKILL.md"),
    `---\nname: my-skill\ndescription: Useful skill\nversion: 0.1.0\n---`
  );

  const { port, close } = await start({ home, cwd: project, port: 0 });
  return {
    root,
    home,
    project,
    port,
    url: `http://localhost:${port}`,
    close: async () => {
      await close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
