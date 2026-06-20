<p align="center">
  <img src="docs/images/logo.png" alt="MCPFlo" width="120" />
</p>

<h1 align="center">MCPFlo</h1>

<p align="center">
  <strong>A visual testing tool for MCP (Model Context Protocol) servers.</strong><br/>
  Think Postman, but for MCP.
</p>

<p align="center">
  <img src="docs/images/screenshot-dark.png" alt="MCPFlo screenshot" width="820" />
</p>

MCPFlo lets you connect to any MCP server, browse its tools, resources, and prompts, and — soon — test multi-step tool chains without writing code or spending LLM tokens.

> ⚠️ **Early development.** MCPFlo is brand new and under active construction. Today it connects to stdio servers and browses their capabilities; tool calling and visual chains are next on the roadmap. Expect rapid change.

---

## Why

MCP tool chains are hard to test today. Your options are:

- Hardcode a chain in a prompt and hope it works
- Write throwaway test scripts
- Use an AI client like Claude Desktop, which gives you little visibility into what actually happened

MCPFlo aims to fill that gap — a local, deterministic, visual debugger for MCP workflows where you can see exactly what each tool received and returned.

---

## Status & roadmap

| Feature                        | Description                                                   | Status     |
| ------------------------------ | ------------------------------------------------------------- | ---------- |
| **Connect (stdio)**            | Spawn a local MCP server over stdio                           | ✅ Working |
| **Browse capabilities**        | View every tool, resource, and prompt in a tree               | ✅ Working |
| **Connect (Streamable HTTP)**  | Connect to remote MCP servers over HTTP                       | ✅ Working |
| **Call tools**                 | Invoke a tool with real inputs and inspect the raw response   | 🚧 Planned |
| **Build tool chains**          | Wire tools from different servers together on a visual canvas | 🚧 Planned |
| **Deterministic transformers** | Map outputs to inputs between tools — no LLM, no tokens       | 🚧 Planned |
| **Step-through execution**     | Run a chain node by node, inspecting I/O at every step        | 🚧 Planned |

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

### Installing a downloaded build (macOS)

MCPFlo's macOS builds aren't yet signed with an Apple Developer ID or notarized, so
the first time you open one Gatekeeper will warn that the app "can't be opened" or is
from an unidentified developer. This is expected — clear it once and macOS remembers:

1. In Finder, **right-click** (or Control-click) **MCPFlo.app → Open**.
2. Click **Open** in the dialog.

After that, MCPFlo launches normally on every subsequent run.

If you prefer the terminal, you can strip the quarantine flag instead:

```bash
xattr -dr com.apple.quarantine /Applications/MCPFlo.app
```

> If the app ever fails to launch with a *"different Team IDs"* error, the bundle was
> modified after download (for example a partially applied update). Reinstall a fresh
> copy from the latest release rather than re-signing it in place.

### Add your first server

1. Click **+ Add Server** in the sidebar
2. Enter a name and select the **stdio** transport
3. Provide the command and args (e.g. `npx` with args `-y @modelcontextprotocol/server-memory`)
4. Click **Add Server**
5. Expand the server row — MCPFlo connects and discovers all tools, resources, and prompts automatically

Server configs are saved to `~/Library/Application Support/MCPFlo/config.json` on macOS
(`%APPDATA%/MCPFlo/config.json` on Windows, `~/.config/MCPFlo/config.json` on Linux).

---

## Development

```bash
npm run dev         # run the app in development
npm test            # run the test suite once
npm run test:watch  # run tests in watch mode
npm run typecheck   # type-check main and renderer
npm run lint        # lint with ESLint
npm run format      # format with Prettier
```

### Project structure

```
src/
├── main/        Electron main process — IPC, MCP client, persistence
├── preload/     Typed bridge between main and renderer
├── renderer/    React UI (sidebar, server tree, modals, stores)
└── shared/      Types shared across processes (MCP schemas, configs)
```

---

## Build

```bash
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

---

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [React Flow](https://reactflow.dev/) for the chain canvas
- [Zustand](https://zustand-demo.pmnd.rs/) for state
- [electron-store](https://github.com/sindresorhus/electron-store) for persistence
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) for tests

---

## Contributing

MCPFlo is in early development and contributions are welcome. Open an issue to
discuss a change, or file a bug at the [issue tracker](https://github.com/harshalslimaye/mcpflo/issues).

---

## License

MIT — free to use, modify, and distribute. See author and repository details in [package.json](package.json).
