# MCPFlo

**A visual testing tool for MCP (Model Context Protocol) servers.**

MCPFlo lets you connect to any MCP server, browse its tools, resources, and prompts, and test multi-step tool chains — without writing code or spending LLM tokens.

Think Postman, but for MCP.

![MCPFlo screenshot](docs/screenshot-dark.png)

---

## What it does

- **Connect to MCP servers** — stdio, SSE, and Streamable HTTP transports
- **Browse capabilities** — see every tool, resource, and prompt exposed by a server in a tree view
- **Call tools** — invoke any tool with real inputs and inspect the raw response *(coming soon)*
- **Build tool chains** — wire tools from different servers together on a visual canvas *(coming soon)*
- **Deterministic transformers** — map outputs to inputs between tools without an LLM or API tokens *(coming soon)*
- **Step-through execution** — run a chain node by node, inspect inputs and outputs at every step *(coming soon)*

---

## Why

MCP tool chains are hard to test today. Your options are:

- Hardcode a chain in a prompt and hope it works
- Write throwaway test scripts
- Use Claude Desktop, which gives you no visibility into what actually happened

MCPFlo fills that gap — a local, deterministic, visual debugger for MCP workflows.

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
git clone https://github.com/harshalslimaye/mcpflo.git
cd mcpflo
npm install
```

### Run in development

```bash
npm run dev
```

### Add your first server

1. Click **+ Add Server** in the sidebar
2. Enter a name and select transport type
3. For stdio: provide the command and args (e.g. `npx` / `-y @modelcontextprotocol/server-memory`)
4. Click **Add Server**
5. Expand the server row — MCPFlo connects and discovers all tools, resources, and prompts automatically

Server configs are saved to `~/Library/Application Support/MCPFlo/config.json` on macOS.

---

## Build

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

---

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [Zustand](https://zustand-demo.pmnd.rs/) for state
- [electron-store](https://github.com/sindresorhus/electron-store) for persistence
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) for tests

---

## License

MIT — free to use, modify, and distribute.
